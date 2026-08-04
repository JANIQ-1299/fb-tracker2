import type { Order } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { normalizeHeader } from "./importColumns.js";
import { pickBestOrderCandidate, type CandidateOrderLike, type ConversationMatchContext } from "./conversationMatch.js";

// مصادر ثقة المطابقة: نطبّق ترتيب الأولوية بالضبط كما طلب المستخدم. أي خطوة لا تجد دليلًا
// حقيقيًا تنتقل للتي تليها؛ لا نخمّن أبدًا من التاريخ/الوقت/المحافظة/الموظف وحدها - تلك ليست
// أدلة مصدر إطلاقًا، والتاريخ/الوقت يُستخدَم فقط كعامل ترجيح ثانوي عند تعادل عدة نتائج مرشّحة
// من خطوة الهاتف (الخطوة 5)، وليس كأساس مطابقة مستقل بحد ذاته.
//
// خطوات مطابقة المحادثات (2.5 و6.5 أدناه) تعتمد على بيانات Conversation المُلتقَطة فقط من رسائل
// إنستغرام الجديدة الواردة عبر Webhook منذ التفعيل - لا قراءة ولا بحث في أي محادثة قديمة موجودة
// مسبقًا بأي طريقة. راجع DECISIONS.md.

export type MatchStatus = "EXACT" | "PROBABLE" | "MANUAL" | "NEEDS_REVIEW" | "UNMATCHED";

export interface AttributionDecision {
  matchStatus: MatchStatus;
  matchMethod: string | null;
  confidence: number;
  pageId: string | null;
  adAccountId: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  creativeId: string | null;
  reason: string;
}

const UNMATCHED: Omit<AttributionDecision, "reason"> = {
  matchStatus: "UNMATCHED",
  matchMethod: null,
  confidence: 0,
  pageId: null,
  adAccountId: null,
  campaignId: null,
  adSetId: null,
  adId: null,
  creativeId: null,
};

const NEEDS_REVIEW: Omit<AttributionDecision, "reason"> = {
  matchStatus: "NEEDS_REVIEW",
  matchMethod: null,
  confidence: 0,
  pageId: null,
  adAccountId: null,
  campaignId: null,
  adSetId: null,
  adId: null,
  creativeId: null,
};

interface ConversationMatchOutcome {
  kind: "MATCHED" | "NEEDS_REVIEW" | "NONE";
  method?: "MESSAGE_REFERRAL_AD_ID" | "MESSAGE_PHONE";
  decision?: AttributionDecision;
}

/** يبحث عن محادثة إنستغرام (مُلتقَطة حصرًا عبر Webhook منذ التفعيل) برقم هاتف يطابق هذا الطلب،
 * ويحسم الغموض عند وجود عدة طلبات مرشّحة لنفس المحادثة عبر conversationMatch.ts. لا يُنشئ ولا
 * يعدّل أي Conversation - قراءة فقط. */
async function matchViaConversation(order: Order, workspaceId: string): Promise<ConversationMatchOutcome> {
  if (!order.normalizedPhone) return { kind: "NONE" };

  const conversations = await prisma.conversation.findMany({
    where: { workspaceId, normalizedPhoneExtracted: order.normalizedPhone },
  });
  if (conversations.length === 0) return { kind: "NONE" };

  const integration = await prisma.messagingIntegration.findUnique({ where: { workspaceId } });
  const matchWindowHours = integration?.matchWindowHours ?? 48;

  const siblingOrders = await prisma.order.findMany({
    where: { workspaceId, normalizedPhone: order.normalizedPhone },
    include: { attribution: true },
  });
  const candidateOrders: CandidateOrderLike[] = siblingOrders.map((o) => ({
    id: o.id,
    orderDate: o.orderDate,
    orderStatus: o.orderStatus,
    customerName: o.customerName,
    governorate: o.governorate,
    adIdRaw: o.adIdRaw,
    campaignIdRaw: o.campaignIdRaw,
    attributionPageId: o.attribution?.pageId ?? null,
    attributionMatchStatus: o.attribution?.matchStatus ?? null,
  }));

  let referralWinner: { conv: (typeof conversations)[number]; adAccountId: string | null } | null = null;
  let phoneWinner: { conv: (typeof conversations)[number]; adAccountId: string | null } | null = null;
  let anyNeedsReview = false;

  for (const conv of conversations) {
    let referralAdMetaId: string | null = null;
    let referralCampaignMetaId: string | null = null;
    let adAccountId: string | null = null;
    if (conv.referralAdInternalId) {
      const ad = await prisma.ad.findUnique({ where: { id: conv.referralAdInternalId } });
      referralAdMetaId = ad?.metaAdId ?? null;
    }
    if (conv.referralCampaignInternalId) {
      const campaign = await prisma.campaign.findUnique({ where: { id: conv.referralCampaignInternalId } });
      referralCampaignMetaId = campaign?.metaCampaignId ?? null;
      adAccountId = campaign?.adAccountId ?? null;
    }

    const ctx: ConversationMatchContext = {
      conversationFirstMessageAt: conv.firstMessageAt,
      matchWindowHours,
      messageText: null, // مطابقة تاريخية: لا نص رسالة متاح هنا (وقد يكون مُنظَّفًا أصلًا)
      conversationPageId: conv.pageId,
      referralResolvedAdMetaId: referralAdMetaId,
      referralResolvedCampaignMetaId: referralCampaignMetaId,
    };
    const result = pickBestOrderCandidate(candidateOrders, ctx);

    if (result.outcome === "MATCHED" && result.orderId === order.id) {
      // طريقة المطابقة تُحدَّد بوجود إعلان مرجعي محلول على المحادثة نفسها، وليس بكون التمييز بين
      // المرشحين اعتمد على هذه الإشارة تحديدًا (تلك إشارة ترجيح إضافية عند تعدد المرشحين فقط -
      // راجع conversationMatch.ts - وليست شرطًا لتصنيف طريقة المطابقة).
      if (conv.referralAdInternalId && !referralWinner) {
        referralWinner = { conv, adAccountId };
      } else if (!conv.referralAdInternalId && !phoneWinner) {
        phoneWinner = { conv, adAccountId };
      }
    } else if (result.outcome === "NEEDS_REVIEW" && result.scored.some((s) => s.orderId === order.id)) {
      anyNeedsReview = true;
    }
  }

  if (referralWinner) {
    const { conv, adAccountId } = referralWinner;
    const sourceLabel = conv.source === "HISTORICAL_IMPORT" ? "مستوردة من ملف بيانات محادثة تاريخي" : "واردة عبر Webhook حي";
    return {
      kind: "MATCHED",
      method: "MESSAGE_REFERRAL_AD_ID",
      decision: {
        matchStatus: "PROBABLE",
        matchMethod: "MESSAGE_REFERRAL_AD_ID",
        confidence: 0.85,
        pageId: conv.pageId,
        adAccountId,
        campaignId: conv.referralCampaignInternalId,
        adSetId: conv.referralAdSetInternalId,
        adId: conv.referralAdInternalId,
        creativeId: conv.referralCreativeInternalId,
        reason: `محادثة إنستغرام (${sourceLabel}، منذ ${conv.firstMessageAt.toISOString().slice(0, 16).replace("T", " ")}) بدأت من إعلان محدَّد (referral) عبر Click-to-Message، ورقم هاتفها يطابق هذا الطلب دون غموض بين عدة طلبات مرشَّحة`,
      },
    };
  }
  if (phoneWinner) {
    const { conv, adAccountId } = phoneWinner;
    const sourceLabel = conv.source === "HISTORICAL_IMPORT" ? "مستوردة من ملف بيانات محادثة تاريخي" : "واردة عبر Webhook حي";
    return {
      kind: "MATCHED",
      method: "MESSAGE_PHONE",
      decision: {
        matchStatus: "PROBABLE",
        matchMethod: "MESSAGE_PHONE",
        confidence: 0.7,
        pageId: conv.pageId,
        adAccountId,
        campaignId: conv.referralCampaignInternalId,
        adSetId: conv.referralAdSetInternalId,
        adId: conv.referralAdInternalId,
        creativeId: conv.referralCreativeInternalId,
        reason: `محادثة إنستغرام (${sourceLabel}، منذ ${conv.firstMessageAt.toISOString().slice(0, 16).replace("T", " ")}) رقم هاتفها يطابق هذا الطلب دون إعلان مرجعي محدَّد، ودون غموض بين عدة طلبات مرشَّحة`,
      },
    };
  }
  if (anyNeedsReview) return { kind: "NEEDS_REVIEW" };
  return { kind: "NONE" };
}

/** يحسب قرار المطابقة لطلب واحد فقط - لا يقرأ ولا يكتب أي OrderAttribution، دالة نقية تعتمد
 * فقط على بيانات Meta/Leads/المحادثات المُزامنة أو المُلتقَطة مسبقًا ضمن نفس الـWorkspace. */
export async function computeAttributionForOrder(
  order: Order,
  workspaceId: string,
): Promise<AttributionDecision> {
  const evidenceNotes: string[] = [];

  // ---- 1) ad_id ----
  if (order.adIdRaw) {
    const ad = await prisma.ad.findUnique({
      where: { workspaceId_metaAdId: { workspaceId, metaAdId: order.adIdRaw } },
      include: { adSet: { include: { campaign: true } } },
    });
    if (ad) {
      return {
        matchStatus: "EXACT",
        matchMethod: "AD_ID",
        confidence: 1,
        pageId: null,
        adAccountId: ad.adSet.campaign.adAccountId,
        campaignId: ad.adSet.campaignId,
        adSetId: ad.adSetId,
        adId: ad.id,
        creativeId: ad.creativeId,
        reason: `مطابقة مباشرة عبر ad_id "${order.adIdRaw}" الموجود ضمن الإعلانات المُزامنة من Meta`,
      };
    }
    evidenceNotes.push(`ad_id "${order.adIdRaw}" غير موجود ضمن الإعلانات المُزامنة`);
  }

  // ---- 2) lead_id ----
  if (order.leadIdRaw) {
    const lead = await prisma.lead.findUnique({
      where: { workspaceId_metaLeadId: { workspaceId, metaLeadId: order.leadIdRaw } },
    });
    if (lead) {
      let adAccountId: string | null = null;
      if (lead.campaignId) {
        const campaign = await prisma.campaign.findUnique({ where: { id: lead.campaignId } });
        adAccountId = campaign?.adAccountId ?? null;
      }
      return {
        matchStatus: "EXACT",
        matchMethod: "LEAD_ID",
        confidence: 0.95,
        pageId: lead.pageId,
        adAccountId,
        campaignId: lead.campaignId,
        adSetId: lead.adSetId,
        adId: lead.adId,
        creativeId: lead.creativeId,
        reason: `مطابقة مباشرة عبر lead_id "${order.leadIdRaw}" لعميل محتمل مسجَّل مسبقًا في هذا الـWorkspace`,
      };
    }
    evidenceNotes.push(`lead_id "${order.leadIdRaw}" غير موجود ضمن العملاء المحتملين المسجَّلين`);
  }

  // ---- 2.5) محادثة إنستغرام جديدة بدأت من إعلان محدَّد (referral) - أقوى من الأدلة الاحتمالية التالية ----
  const conversationMatch = await matchViaConversation(order, workspaceId);
  if (conversationMatch.kind === "MATCHED" && conversationMatch.method === "MESSAGE_REFERRAL_AD_ID") {
    return conversationMatch.decision!;
  }

  // ---- 3) campaign_id / adset_id ----
  if (order.adSetIdRaw) {
    const adSet = await prisma.adSet.findUnique({
      where: { workspaceId_metaAdSetId: { workspaceId, metaAdSetId: order.adSetIdRaw } },
      include: { campaign: true },
    });
    if (adSet) {
      return {
        matchStatus: "PROBABLE",
        matchMethod: "CAMPAIGN_ADSET",
        confidence: 0.7,
        pageId: null,
        adAccountId: adSet.campaign.adAccountId,
        campaignId: adSet.campaignId,
        adSetId: adSet.id,
        adId: null,
        creativeId: null,
        reason: `مطابقة عبر adset_id "${order.adSetIdRaw}" (على مستوى مجموعة الإعلانات، دون تحديد الإعلان الدقيق)`,
      };
    }
    evidenceNotes.push(`adset_id "${order.adSetIdRaw}" غير موجود ضمن المجموعات الإعلانية المُزامنة`);
  }
  if (order.campaignIdRaw) {
    const campaign = await prisma.campaign.findUnique({
      where: { workspaceId_metaCampaignId: { workspaceId, metaCampaignId: order.campaignIdRaw } },
    });
    if (campaign) {
      return {
        matchStatus: "PROBABLE",
        matchMethod: "CAMPAIGN_ADSET",
        confidence: 0.6,
        pageId: null,
        adAccountId: campaign.adAccountId,
        campaignId: campaign.id,
        adSetId: null,
        adId: null,
        creativeId: null,
        reason: `مطابقة عبر campaign_id "${order.campaignIdRaw}" (على مستوى الحملة فقط، دون مجموعة إعلانات أو إعلان محدَّد)`,
      };
    }
    evidenceNotes.push(`campaign_id "${order.campaignIdRaw}" غير موجود ضمن الحملات المُزامنة`);
  }

  // ---- 4) اسم الإعلان/الفيديو/الحملة أو المصدر (مطابقة نصية مقابل بيانات Meta المُزامنة) ----
  const nameCandidates: { field: string; raw: string }[] = [];
  if (order.adNameRaw) nameCandidates.push({ field: "اسم الإعلان", raw: order.adNameRaw });
  if (order.videoNameRaw) nameCandidates.push({ field: "اسم الفيديو", raw: order.videoNameRaw });
  if (order.campaignNameRaw) nameCandidates.push({ field: "اسم الحملة", raw: order.campaignNameRaw });

  for (const candidate of nameCandidates) {
    const normalized = normalizeHeader(candidate.raw);
    if (!normalized) continue;

    const ads = await prisma.ad.findMany({ where: { workspaceId }, include: { adSet: { include: { campaign: true } } } });
    const matchedAd = ads.find((a) => normalizeHeader(a.name) === normalized);
    if (matchedAd) {
      return {
        matchStatus: "PROBABLE",
        matchMethod: "NAME",
        confidence: 0.55,
        pageId: null,
        adAccountId: matchedAd.adSet.campaign.adAccountId,
        campaignId: matchedAd.adSet.campaignId,
        adSetId: matchedAd.adSetId,
        adId: matchedAd.id,
        creativeId: matchedAd.creativeId,
        reason: `مطابقة نصية: ${candidate.field} "${candidate.raw}" يطابق اسم الإعلان "${matchedAd.name}" المُزامن من Meta`,
      };
    }

    const campaigns = await prisma.campaign.findMany({ where: { workspaceId } });
    const matchedCampaign = campaigns.find((c) => normalizeHeader(c.name) === normalized);
    if (matchedCampaign) {
      return {
        matchStatus: "PROBABLE",
        matchMethod: "NAME",
        confidence: 0.5,
        pageId: null,
        adAccountId: matchedCampaign.adAccountId,
        campaignId: matchedCampaign.id,
        adSetId: null,
        adId: null,
        creativeId: null,
        reason: `مطابقة نصية: ${candidate.field} "${candidate.raw}" يطابق اسم الحملة "${matchedCampaign.name}" المُزامنة من Meta`,
      };
    }
    evidenceNotes.push(`${candidate.field} "${candidate.raw}" لا يطابق أي إعلان أو حملة مُزامنة`);
  }
  if (order.sourceRaw) evidenceNotes.push(`المصدر "${order.sourceRaw}" غير كافٍ وحده لتحديد المصدر بدون معرّف أو اسم مطابق`);

  // ---- 5) رقم الهاتف مع Lead موجود - احتمالي فقط، والتاريخ/الوقت عامل ترجيح ثانوي عند التعادل ----
  if (order.normalizedPhone) {
    const leads = await prisma.lead.findMany({
      where: { workspaceId, normalizedPhone: order.normalizedPhone },
    });
    if (leads.length > 0) {
      let chosen = leads[0];
      let tieBreakNote = "";
      if (leads.length > 1 && order.orderDate) {
        const orderTime = order.orderDate.getTime();
        chosen = leads.reduce((closest, candidate) => {
          const closestTime = (closest.metaCreatedAt ?? closest.createdAt).getTime();
          const candidateTime = (candidate.metaCreatedAt ?? candidate.createdAt).getTime();
          return Math.abs(candidateTime - orderTime) < Math.abs(closestTime - orderTime) ? candidate : closest;
        }, leads[0]);
        tieBreakNote = ` (تم اختيار الأقرب زمنيًا من بين ${leads.length} نتائج بنفس رقم الهاتف - التاريخ/الوقت استُخدم فقط كعامل ترجيح، وليس دليلًا مستقلًا)`;
      }
      let adAccountId: string | null = null;
      if (chosen.campaignId) {
        const campaign = await prisma.campaign.findUnique({ where: { id: chosen.campaignId } });
        adAccountId = campaign?.adAccountId ?? null;
      }
      return {
        matchStatus: "PROBABLE",
        matchMethod: "PHONE",
        confidence: 0.5,
        pageId: chosen.pageId,
        adAccountId,
        campaignId: chosen.campaignId,
        adSetId: chosen.adSetId,
        adId: chosen.adId,
        creativeId: chosen.creativeId,
        reason: `تطابق رقم الهاتف الموحّد (${order.normalizedPhone}) مع عميل محتمل مسجَّل مسبقًا في هذا الـWorkspace${tieBreakNote}`,
      };
    }
    evidenceNotes.push(`لا يوجد عميل محتمل بنفس رقم الهاتف (${order.normalizedPhone}) ضمن هذا الـWorkspace`);
  } else {
    evidenceNotes.push("لا يوجد رقم هاتف موحَّد لمقارنته بالعملاء المحتملين");
  }

  // ---- 6) قاعدة MappingRule محفوظة من تصحيح يدوي سابق - مفتاحها اسم/مصدر فقط، أبدًا الهاتف ----
  const ruleCandidates: { ruleType: string; raw: string }[] = [];
  if (order.adNameRaw) ruleCandidates.push({ ruleType: "AD_NAME_ALIAS", raw: order.adNameRaw });
  if (order.videoNameRaw) ruleCandidates.push({ ruleType: "VIDEO_NAME_ALIAS", raw: order.videoNameRaw });
  if (order.sourceRaw) ruleCandidates.push({ ruleType: "SOURCE_ALIAS", raw: order.sourceRaw });

  for (const candidate of ruleCandidates) {
    const matchKey = normalizeHeader(candidate.raw);
    if (!matchKey) continue;
    const rule = await prisma.mappingRule.findUnique({
      where: { workspaceId_ruleType_matchKey: { workspaceId, ruleType: candidate.ruleType, matchKey } },
    });
    if (rule && (rule.adId || rule.campaignId)) {
      let adSetId: string | null = null;
      let adAccountId: string | null = null;
      let campaignId = rule.campaignId;
      let creativeId: string | null = null;
      if (rule.adId) {
        const ad = await prisma.ad.findUnique({
          where: { id: rule.adId },
          include: { adSet: { include: { campaign: true } } },
        });
        if (ad) {
          adSetId = ad.adSetId;
          campaignId = ad.adSet.campaignId;
          adAccountId = ad.adSet.campaign.adAccountId;
          creativeId = ad.creativeId;
        }
      } else if (rule.campaignId) {
        const campaign = await prisma.campaign.findUnique({ where: { id: rule.campaignId } });
        adAccountId = campaign?.adAccountId ?? null;
      }
      return {
        matchStatus: "PROBABLE",
        matchMethod: "MAPPING_RULE",
        confidence: 0.65,
        pageId: null,
        adAccountId,
        campaignId,
        adSetId,
        adId: rule.adId,
        creativeId,
        reason: `تم تطبيق قاعدة ربط محفوظة مسبقًا من تصحيح يدوي سابق لنفس القيمة "${candidate.raw}"`,
      };
    }
  }

  // ---- 6.5) محادثة إنستغرام جديدة بنفس رقم الهاتف دون إعلان مرجعي محدَّد ----
  if (conversationMatch.kind === "MATCHED" && conversationMatch.method === "MESSAGE_PHONE") {
    return conversationMatch.decision!;
  }
  if (conversationMatch.kind === "NEEDS_REVIEW") {
    return {
      ...NEEDS_REVIEW,
      reason:
        "توجد محادثة إنستغرام جديدة بنفس رقم الهاتف، لكن هناك أكثر من طلب مرشَّح محتمل دون فائز واضح " +
        "(بعد مقارنة تاريخ الطلب/المحادثة، حالة الطلب، الإعلان المرجعي) - يتطلب مراجعة يدوية بدل الربط التلقائي",
    };
  }

  // ---- 7) لا دليل كافٍ - غير مطابق صراحةً، وليس تخمينًا ----
  const reason =
    evidenceNotes.length > 0
      ? `لا يوجد دليل كافٍ لتحديد مصدر هذا الطلب: ${evidenceNotes.join("؛ ")}.`
      : "لا توجد أي بيانات مصدر (ad_id/lead_id/campaign_id/adset_id/اسم إعلان أو فيديو أو حملة/مصدر) في هذا الطلب، ولا رقم هاتف قابل للمطابقة.";

  return { ...UNMATCHED, reason };
}

interface AttributionSnapshot {
  matchMethod: string | null;
  matchStatus: string | null;
  confidence: number | null;
  reason: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  creativeId: string | null;
}

/** يكتب قرار مطابقة واحد ويُسجّل سطرًا في OrderAttributionHistory عند أي تغيير فعلي - لا يستبدل
 * MANUAL أبدًا (إلا بطلب صريح allowOverrideManual=true من مسار التصحيح اليدوي نفسه)، ولا يستبدل
 * تطابقًا أعلى ثقة بآخر أقل عندما يكون المصدر إشارة تكميلية (مثل محادثة جديدة) لا إعادة حساب كاملة. */
export async function writeOrderAttribution(
  orderId: string,
  workspaceId: string,
  decision: AttributionDecision,
  opts: { changeSource: "AUTO_RUN" | "MANUAL" | "MESSAGE_PHONE" | "MESSAGE_REFERRAL_AD_ID"; changedBy?: string | null },
): Promise<boolean> {
  const existing = await prisma.orderAttribution.findUnique({ where: { orderId } });
  const allowOverrideManual = opts.changeSource === "MANUAL";

  if (existing?.matchStatus === "MANUAL" && !allowOverrideManual) return false;
  if (
    existing &&
    opts.changeSource !== "AUTO_RUN" &&
    !allowOverrideManual &&
    existing.confidence > decision.confidence
  ) {
    return false; // إشارة تكميلية أضعف من تطابق موجود بالفعل - لا نستبدله
  }

  const snapshot = (a: typeof existing | null): AttributionSnapshot | null =>
    a
      ? {
          matchMethod: a.matchMethod,
          matchStatus: a.matchStatus,
          confidence: a.confidence,
          reason: a.reason,
          campaignId: a.campaignId,
          adSetId: a.adSetId,
          adId: a.adId,
          creativeId: a.creativeId,
        }
      : null;

  const previous = snapshot(existing);
  const unchanged =
    previous &&
    previous.matchMethod === decision.matchMethod &&
    previous.matchStatus === decision.matchStatus &&
    previous.confidence === decision.confidence;

  await prisma.orderAttribution.upsert({
    where: { orderId },
    update: { workspaceId, ...decision, matchedAt: new Date(), matchedBy: opts.changedBy ?? null },
    create: { orderId, workspaceId, ...decision, matchedAt: new Date(), matchedBy: opts.changedBy ?? null },
  });

  if (!unchanged) {
    await prisma.orderAttributionHistory.create({
      data: {
        orderId,
        workspaceId,
        previousMatchMethod: previous?.matchMethod ?? null,
        previousMatchStatus: previous?.matchStatus ?? null,
        previousConfidence: previous?.confidence ?? null,
        previousReason: previous?.reason ?? null,
        previousStateJson: previous
          ? JSON.stringify({
              campaignId: previous.campaignId,
              adSetId: previous.adSetId,
              adId: previous.adId,
              creativeId: previous.creativeId,
            })
          : null,
        newMatchMethod: decision.matchMethod,
        newMatchStatus: decision.matchStatus,
        newConfidence: decision.confidence,
        newReason: decision.reason,
        newStateJson: JSON.stringify({
          campaignId: decision.campaignId,
          adSetId: decision.adSetId,
          adId: decision.adId,
          creativeId: decision.creativeId,
        }),
        changeSource: opts.changeSource,
        changedBy: opts.changedBy ?? null,
      },
    });
  }
  return true;
}

/** يُستدعى من مسار Webhook الحي عند وصول رسالة إنستغرام جديدة تُطابق طلبًا موجودًا بالفعل -
 * إشارة تكميلية فورية، منفصلة عن إعادة الحساب الكاملة الدورية. */
export async function applyMessagingAttribution(
  orderId: string,
  workspaceId: string,
  decision: AttributionDecision,
  method: "MESSAGE_PHONE" | "MESSAGE_REFERRAL_AD_ID",
): Promise<boolean> {
  return writeOrderAttribution(orderId, workspaceId, decision, { changeSource: method, changedBy: null });
}

export interface AttributionRunSummary {
  total: number;
  exact: number;
  probable: number;
  manual: number;
  needsReview: number;
  unmatched: number;
  processed: number; // عدد الطلبات التي أُعيد حسابها فعليًا (باستثناء المطابقات اليدوية المحفوظة)
}

/**
 * يشغّل المحرك على كل طلبات الـWorkspace. Idempotent تمامًا: نفس المدخلات تُنتج نفس النتيجة
 * دائمًا (دالة حتمية بلا عشوائية)، والحفظ عبر upsert بمفتاح orderId الفريد - لا يمكن أن يُنشئ
 * صفين لنفس الطلب مهما تكرر التشغيل. المطابقات اليدوية (MANUAL) لا يُعاد حسابها أو الكتابة
 * فوقها أبدًا في التشغيل التلقائي - قرار المستخدم البشري يبقى نهائيًا حتى يُغيَّر يدويًا مجددًا.
 * كل تغيير فعلي يُسجَّل في OrderAttributionHistory عبر writeOrderAttribution.
 */
export async function runAttributionForWorkspace(
  workspaceId: string,
  options: { dryRun?: boolean } = {},
): Promise<AttributionRunSummary> {
  const orders = await prisma.order.findMany({
    where: { workspaceId },
    include: { attribution: true },
  });

  let processed = 0;
  const decisions: { orderId: string; decision: AttributionDecision }[] = [];

  for (const order of orders) {
    if (order.attribution?.matchStatus === "MANUAL") continue; // لا نلمس القرارات اليدوية إطلاقًا
    const decision = await computeAttributionForOrder(order, workspaceId);
    decisions.push({ orderId: order.id, decision });
    processed++;
  }

  if (!options.dryRun) {
    for (const { orderId, decision } of decisions) {
      await writeOrderAttribution(orderId, workspaceId, decision, { changeSource: "AUTO_RUN" });
    }
  }

  // العدّ النهائي: القرارات المُعاد حسابها (سواء حُفظت أو كانت معاينة) + المطابقات اليدوية المحفوظة كما هي
  const manualCount = orders.filter((o) => o.attribution?.matchStatus === "MANUAL").length;
  const counts = { exact: 0, probable: 0, needsReview: 0, unmatched: 0 };
  for (const { decision } of decisions) {
    if (decision.matchStatus === "EXACT") counts.exact++;
    else if (decision.matchStatus === "PROBABLE") counts.probable++;
    else if (decision.matchStatus === "NEEDS_REVIEW") counts.needsReview++;
    else counts.unmatched++;
  }

  return {
    total: orders.length,
    exact: counts.exact,
    probable: counts.probable,
    manual: manualCount,
    needsReview: counts.needsReview,
    unmatched: counts.unmatched,
    processed,
  };
}
