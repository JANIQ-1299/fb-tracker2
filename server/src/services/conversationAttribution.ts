import type { Conversation } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { pickBestOrderCandidate, type CandidateOrderLike } from "./conversationMatch.js";
import { applyMessagingAttribution } from "./attributionEngine.js";

/**
 * يحاول ربط محادثة (من Webhook حي أو من استيراد تاريخي - المصدر لا يهم هنا) بطلب موجود بنفس
 * رقم الهاتف المستخرَج. لا يلمس أي تطابق MANUAL، ولا يخمّن عند تعدد المرشحين دون فائز واضح
 * (NEEDS_REVIEW بدلًا من ذلك). مشترك بين webhook.ts وconversationImport.ts لتفادي ازدواجية المنطق.
 */
export async function matchConversationToOrder(
  conversation: Conversation,
  workspaceId: string,
  matchWindowHours: number,
  messageText: string | null = null,
): Promise<void> {
  if (!conversation.normalizedPhoneExtracted || conversation.matchStatus !== "UNMATCHED") return;

  const candidates = await prisma.order.findMany({
    where: { workspaceId, normalizedPhone: conversation.normalizedPhoneExtracted },
    include: { attribution: true },
  });
  if (candidates.length === 0) return; // لا طلب مستورَد بعد بهذا الرقم - قد يُطابَق لاحقًا عند استيراده

  let referralAdMetaId: string | null = null;
  let referralCampaignMetaId: string | null = null;
  let adAccountId: string | null = null;
  if (conversation.referralAdInternalId) {
    const ad = await prisma.ad.findUnique({ where: { id: conversation.referralAdInternalId } });
    referralAdMetaId = ad?.metaAdId ?? null;
  }
  if (conversation.referralCampaignInternalId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: conversation.referralCampaignInternalId } });
    referralCampaignMetaId = campaign?.metaCampaignId ?? null;
    adAccountId = campaign?.adAccountId ?? null;
  }

  const candidateOrders: CandidateOrderLike[] = candidates.map((o) => ({
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

  const result = pickBestOrderCandidate(candidateOrders, {
    conversationFirstMessageAt: conversation.firstMessageAt,
    matchWindowHours,
    messageText,
    conversationPageId: conversation.pageId,
    referralResolvedAdMetaId: referralAdMetaId,
    referralResolvedCampaignMetaId: referralCampaignMetaId,
  });

  if (result.outcome === "MATCHED") {
    const method = referralAdMetaId ? ("MESSAGE_REFERRAL_AD_ID" as const) : ("MESSAGE_PHONE" as const);
    const confidence = method === "MESSAGE_REFERRAL_AD_ID" ? 0.85 : 0.7;
    const sourceLabel = conversation.source === "HISTORICAL_IMPORT" ? "مستوردة من ملف بيانات تاريخي" : "واردة عبر Webhook حي";
    const written = await applyMessagingAttribution(
      result.orderId,
      workspaceId,
      {
        matchStatus: "PROBABLE",
        matchMethod: method,
        confidence,
        pageId: conversation.pageId,
        adAccountId,
        campaignId: conversation.referralCampaignInternalId,
        adSetId: conversation.referralAdSetInternalId,
        adId: conversation.referralAdInternalId,
        creativeId: conversation.referralCreativeInternalId,
        reason: `محادثة إنستغرام (${sourceLabel}) ${method === "MESSAGE_REFERRAL_AD_ID" ? "بدأت من إعلان مرجعي Click-to-Message" : "برقم هاتف يطابق هذا الطلب دون إعلان مرجعي محدَّد"}`,
      },
      method,
    );
    if (written) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { matchStatus: "MATCHED", matchedOrderId: result.orderId, matchedAt: new Date() },
      });
      logger.info({ conversationId: conversation.id, orderId: result.orderId, method, source: conversation.source }, "تمت مطابقة محادثة إنستغرام بطلب");
    }
  } else if (result.outcome === "NEEDS_REVIEW") {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { matchStatus: "NEEDS_REVIEW", candidateOrdersJson: JSON.stringify(result.scored) },
    });
    logger.info({ conversationId: conversation.id, source: conversation.source }, "محادثة إنستغرام تحتاج مراجعة يدوية - عدة طلبات مرشَّحة دون فائز واضح");
  }
}
