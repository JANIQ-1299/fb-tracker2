import { prisma } from "../lib/prisma.js";

export interface ResolvedReferral {
  referralAdId: string;
  referralAdInternalId: string | null;
  referralAdSetInternalId: string | null;
  referralCampaignInternalId: string | null;
  referralCreativeInternalId: string | null;
  referralAdNameSnapshot: string | null;
  referralAdSetNameSnapshot: string | null;
  referralCampaignNameSnapshot: string | null;
  referralVideoIdSnapshot: string | null;
}

/** يحلّ referral_ad_id (من Webhook حي أو من ملف استيراد تاريخي مجرَّد) إلى بيانات الإعلان الداخلية
 * مع أخذ Snapshot من الأسماء وقت الحل - حتى لا تختفي البيانات لاحقًا إن حُذف الإعلان أو تغيّر اسمه
 * في Meta. يُستخدَم من مسارين: webhook.ts (رسائل جديدة) وconversationImport.ts (ملف تاريخي). */
export async function resolveReferralAd(workspaceId: string, referralAdId: string): Promise<ResolvedReferral> {
  const ad = await prisma.ad.findUnique({
    where: { workspaceId_metaAdId: { workspaceId, metaAdId: referralAdId } },
    include: { adSet: { include: { campaign: true } }, creative: true },
  });

  if (!ad) {
    return {
      referralAdId,
      referralAdInternalId: null,
      referralAdSetInternalId: null,
      referralCampaignInternalId: null,
      referralCreativeInternalId: null,
      referralAdNameSnapshot: null,
      referralAdSetNameSnapshot: null,
      referralCampaignNameSnapshot: null,
      referralVideoIdSnapshot: null,
    };
  }

  return {
    referralAdId,
    referralAdInternalId: ad.id,
    referralAdSetInternalId: ad.adSetId,
    referralCampaignInternalId: ad.adSet.campaignId,
    referralCreativeInternalId: ad.creativeId,
    referralAdNameSnapshot: ad.name,
    referralAdSetNameSnapshot: ad.adSet.name,
    referralCampaignNameSnapshot: ad.adSet.campaign.name,
    referralVideoIdSnapshot: ad.creative?.videoId ?? null,
  };
}
