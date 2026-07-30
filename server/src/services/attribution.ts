import { metaGet } from "../lib/meta.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { normalizeIraqiPhone } from "../lib/phone.js";

/**
 * جلب تفاصيل Lead كامل من Graph API وربطه بالحملة/المجموعة الإعلانية/الإعلان/Creative،
 * مع محاولة تحديد مصدر الفيديو. راجع META_ATTRIBUTION.md لشرح كل حالة.
 */

interface LeadFieldData {
  name: string;
  values: string[];
}

interface LeadgenDetails {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  page_id?: string;
  field_data?: LeadFieldData[];
}

export async function fetchLeadDetails(leadgenId: string): Promise<LeadgenDetails> {
  return metaGet<LeadgenDetails>(leadgenId, {
    fields:
      "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,page_id,field_data",
  });
}

function extractField(fields: LeadFieldData[] | undefined, ...names: string[]): string | undefined {
  if (!fields) return undefined;
  for (const name of names) {
    const match = fields.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (match?.values?.[0]) return match.values[0];
  }
  return undefined;
}

// ---------- Creative / Video source extraction ----------

export type CreativeSourceType =
  | "VIDEO"
  | "IMAGE"
  | "CAROUSEL"
  | "EXISTING_POST"
  | "ASSET_FEED"
  | "DYNAMIC_CREATIVE"
  | "REEL"
  | "UNKNOWN";

export interface ExtractedCreative {
  metaCreativeId: string;
  videoId: string | null;
  postId: string | null;
  reelId: string | null;
  thumbnailUrl: string | null;
  sourceType: CreativeSourceType;
  extractionNote: string | null;
  rawMetadata: any;
}

/**
 * إعلانات Meta تخزّن الفيديو/المصدر في أماكن مختلفة تمامًا حسب نوع الإعلان:
 *  - إعلان فيديو كلاسيكي: creative.video_id أو object_story_spec.video_data.video_id
 *  - إعلان من منشور موجود (Existing Post): creative.effective_object_story_id -> post
 *  - Dynamic Creative / Asset Feed: creative.asset_feed_spec.videos[]
 *  - Reels/Story Ads: object_story_spec.video_data أو asset_feed_spec
 * لذلك نحاول عدة مسارات بالترتيب ونسجّل أيها نجح، وإن فشلت كلها نخزّن السبب صراحة
 * بدل ترك الحقل فارغًا بصمت.
 */
export async function fetchAndExtractCreative(adId: string): Promise<ExtractedCreative> {
  const adData = await metaGet<any>(adId, {
    fields: "creative{id,object_type,video_id,effective_object_story_id,thumbnail_url,asset_feed_spec,object_story_spec}",
  });

  const creative = adData.creative;
  if (!creative) {
    return {
      metaCreativeId: `unknown-${adId}`,
      videoId: null,
      postId: null,
      reelId: null,
      thumbnailUrl: null,
      sourceType: "UNKNOWN",
      extractionNote: "لا يوجد كائن creative مرتبط بهذا الإعلان في استجابة Graph API",
      rawMetadata: adData,
    };
  }

  let videoId: string | null = null;
  let postId: string | null = null;
  let reelId: string | null = null;
  let sourceType: CreativeSourceType = "UNKNOWN";
  let extractionNote: string | null = null;

  // 1) مسار مباشر: creative.video_id
  if (creative.video_id) {
    videoId = creative.video_id;
    sourceType = "VIDEO";
  }

  // 2) object_story_spec.video_data.video_id (إعلانات فيديو/Reels منشأة عبر الحملة)
  if (!videoId && creative.object_story_spec?.video_data?.video_id) {
    videoId = creative.object_story_spec.video_data.video_id;
    sourceType = creative.object_story_spec?.video_data?.branded_content_shared_to_sponsor_status
      ? "REEL"
      : "VIDEO";
  }

  // 3) asset_feed_spec.videos[] (Dynamic Creative / Advantage+ / Asset Feed)
  if (!videoId && Array.isArray(creative.asset_feed_spec?.videos) && creative.asset_feed_spec.videos.length > 0) {
    videoId = creative.asset_feed_spec.videos[0].video_id ?? null;
    sourceType = "ASSET_FEED";
    if (creative.asset_feed_spec.videos.length > 1) {
      extractionNote = `تم استخدام أول فيديو من ${creative.asset_feed_spec.videos.length} فيديوهات ضمن Asset Feed / Dynamic Creative`;
    }
  }

  // 4) إعلان من منشور موجود (Existing Post) — يُحدَّد الـpost_id فقط، ويُجلب نوعه لاحقًا إن أمكن
  if (creative.effective_object_story_id) {
    postId = creative.effective_object_story_id;
    if (!videoId) sourceType = "EXISTING_POST";
  }

  // 5) صورة ثابتة أو كاروسيل بدون فيديو
  if (!videoId && !postId && creative.object_type) {
    sourceType = creative.object_type === "SHARE" ? "CAROUSEL" : "IMAGE";
  }

  if (!videoId && !postId) {
    extractionNote =
      extractionNote ??
      `تعذّر تحديد مصدر الفيديو أو المنشور تلقائيًا (object_type=${creative.object_type ?? "غير معروف"}). قد يكون الإعلان صورة ثابتة أو نوع بنية جديد غير مغطى بعد.`;
  }

  return {
    metaCreativeId: creative.id ?? `unknown-${adId}`,
    videoId,
    postId,
    reelId,
    thumbnailUrl: creative.thumbnail_url ?? null,
    sourceType,
    extractionNote,
    rawMetadata: creative,
  };
}

// ---------- Full pipeline: process a leadgen_id end-to-end ----------

export async function processLeadgenId(leadgenId: string, pageId: string, workspaceId: string) {
  const details = await fetchLeadDetails(leadgenId);

  const page = await prisma.page.upsert({
    where: { workspaceId_metaPageId: { workspaceId, metaPageId: pageId } },
    update: {},
    create: { workspaceId, metaPageId: pageId, name: pageId },
  });

  let campaignRecordId: string | undefined;
  let adSetRecordId: string | undefined;
  let adRecordId: string | undefined;
  let creativeRecordId: string | undefined;

  if (details.campaign_id) {
    // يحتاج adAccountId - نستخدم إعداد افتراضي محفوظ في AppSetting إن لم يتوفر عبر insights لاحقًا
    const adAccount = await prisma.adAccount.findFirst({ where: { workspaceId } });
    const campaign = await prisma.campaign.upsert({
      where: { workspaceId_metaCampaignId: { workspaceId, metaCampaignId: details.campaign_id } },
      update: { name: details.campaign_name ?? undefined },
      create: {
        workspaceId,
        metaCampaignId: details.campaign_id,
        name: details.campaign_name ?? details.campaign_id,
        adAccountId: adAccount?.id ?? (await ensureFallbackAdAccount(workspaceId)),
      },
    });
    campaignRecordId = campaign.id;
  }

  if (details.adset_id && campaignRecordId) {
    const adSet = await prisma.adSet.upsert({
      where: { workspaceId_metaAdSetId: { workspaceId, metaAdSetId: details.adset_id } },
      update: { name: details.adset_name ?? undefined },
      create: {
        workspaceId,
        metaAdSetId: details.adset_id,
        name: details.adset_name ?? details.adset_id,
        campaignId: campaignRecordId,
      },
    });
    adSetRecordId = adSet.id;
  }

  if (details.ad_id) {
    let extracted: ExtractedCreative | null = null;
    try {
      extracted = await fetchAndExtractCreative(details.ad_id);
    } catch (err) {
      logger.warn({ adId: details.ad_id, err: (err as Error).message }, "فشل جلب creative للإعلان");
    }

    if (extracted) {
      const creative = await prisma.creative.upsert({
        where: { workspaceId_metaCreativeId: { workspaceId, metaCreativeId: extracted.metaCreativeId } },
        update: {
          videoId: extracted.videoId ?? undefined,
          postId: extracted.postId ?? undefined,
          thumbnailUrl: extracted.thumbnailUrl ?? undefined,
          sourceType: extracted.sourceType,
          extractionNote: extracted.extractionNote ?? undefined,
        },
        create: {
          workspaceId,
          metaCreativeId: extracted.metaCreativeId,
          videoId: extracted.videoId,
          postId: extracted.postId,
          reelId: extracted.reelId,
          thumbnailUrl: extracted.thumbnailUrl,
          sourceType: extracted.sourceType,
          extractionNote: extracted.extractionNote,
          rawMetadata: JSON.stringify(extracted.rawMetadata).slice(0, 20_000),
        },
      });
      creativeRecordId = creative.id;
    }

    if (adSetRecordId) {
      const ad = await prisma.ad.upsert({
        where: { workspaceId_metaAdId: { workspaceId, metaAdId: details.ad_id } },
        update: { name: details.ad_name ?? undefined, creativeId: creativeRecordId },
        create: {
          workspaceId,
          metaAdId: details.ad_id,
          name: details.ad_name ?? details.ad_id,
          adSetId: adSetRecordId,
          creativeId: creativeRecordId,
        },
      });
      adRecordId = ad.id;
    }
  }

  const name = extractField(details.field_data, "full_name", "name", "الاسم الكامل", "الاسم");
  const rawPhone = extractField(details.field_data, "phone_number", "phone", "الهاتف", "رقم الهاتف");
  const email = extractField(details.field_data, "email", "البريد الإلكتروني");
  const { normalized } = normalizeIraqiPhone(rawPhone);

  return {
    page,
    campaignRecordId,
    adSetRecordId,
    adRecordId,
    creativeRecordId,
    formId: details.form_id ?? null,
    metaCreatedAt: details.created_time ? new Date(details.created_time) : null,
    name: name ?? null,
    phone: rawPhone ?? null,
    normalizedPhone: normalized,
    email: email ?? null,
    rawData: details,
  };
}

async function ensureFallbackAdAccount(workspaceId: string): Promise<string> {
  const { env } = await import("../lib/env.js");
  const acc = await prisma.adAccount.upsert({
    where: {
      workspaceId_metaAdAccountId: { workspaceId, metaAdAccountId: env.metaAdAccountId || "unknown" },
    },
    update: {},
    create: {
      workspaceId,
      metaAdAccountId: env.metaAdAccountId || "unknown",
      name: env.metaAdAccountId ? "حساب الإعلانات الافتراضي" : "غير معروف",
    },
  });
  return acc.id;
}
