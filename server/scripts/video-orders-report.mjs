import "dotenv/config";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VER = process.env.META_GRAPH_API_VERSION || "v25.0";
const TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID;
const SINCE = "2026-07-19";
const UNTIL = "2026-07-24";
const ORDER_ACTION = "onsite_conversion.messaging_order_created_v2";

function graphGet(pathAndQuery, params) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ ...params, access_token: TOKEN });
    const url = `https://graph.facebook.com/${VER}/${pathAndQuery}?${qs}`;
    https
      .get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(d);
            if (j.error) reject(new Error(j.error.message));
            else resolve(j);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function fetchAdInsights() {
  const j = await graphGet(`act_${AD_ACCOUNT}/insights`, {
    level: "ad",
    time_range: JSON.stringify({ since: SINCE, until: UNTIL }),
    fields: "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,clicks,actions",
    limit: "500",
  });
  return j.data || [];
}

async function fetchCreative(adId) {
  try {
    const j = await graphGet(adId, {
      fields:
        "creative{id,object_type,video_id,effective_object_story_id,thumbnail_url,asset_feed_spec,object_story_spec}",
    });
    const creative = j.creative;
    if (!creative) return { metaCreativeId: null, videoId: null, postId: null, sourceType: "UNKNOWN", note: "لا يوجد creative" };

    let videoId = creative.video_id ?? null;
    let sourceType = videoId ? "VIDEO" : "UNKNOWN";
    if (!videoId && creative.object_story_spec?.video_data?.video_id) {
      videoId = creative.object_story_spec.video_data.video_id;
      sourceType = "VIDEO";
    }
    if (!videoId && Array.isArray(creative.asset_feed_spec?.videos) && creative.asset_feed_spec.videos.length > 0) {
      videoId = creative.asset_feed_spec.videos[0].video_id ?? null;
      sourceType = "ASSET_FEED";
    }
    let postId = creative.effective_object_story_id ?? null;
    if (postId && !videoId) sourceType = "EXISTING_POST";
    if (!videoId && !postId) sourceType = creative.object_type === "SHARE" ? "CAROUSEL" : "IMAGE";

    return {
      metaCreativeId: creative.id ?? null,
      videoId,
      postId,
      thumbnailUrl: creative.thumbnail_url ?? null,
      sourceType,
      note: !videoId && !postId ? `تعذّر تحديد الفيديو (object_type=${creative.object_type ?? "غير معروف"})` : null,
    };
  } catch (err) {
    return { metaCreativeId: null, videoId: null, postId: null, sourceType: "ERROR", note: err.message };
  }
}

function getAction(actions, type) {
  const a = (actions || []).find((x) => x.action_type === type);
  return a ? Number(a.value) : 0;
}

async function main() {
  console.log(`جلب Insights لكل إعلان (${SINCE} إلى ${UNTIL})...`);
  const rows = await fetchAdInsights();
  console.log(`عدد الإعلانات في هذه الفترة: ${rows.length}`);

  const adResults = [];
  for (const row of rows) {
    const orders = getAction(row.actions, ORDER_ACTION);
    const leadsCount = getAction(row.actions, "onsite_conversion.lead_grouped") || getAction(row.actions, "lead");
    const conversationsStarted = getAction(row.actions, "onsite_conversion.messaging_conversation_started_7d");
    process.stdout.write(`.`);
    const creative = await fetchCreative(row.ad_id);
    adResults.push({
      adId: row.ad_id,
      adName: row.ad_name,
      adsetId: row.adset_id,
      adsetName: row.adset_name,
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      spend: Number(row.spend || 0),
      impressions: Number(row.impressions || 0),
      reach: Number(row.reach || 0),
      clicks: Number(row.clicks || 0),
      orders,
      leadsCount,
      conversationsStarted,
      ...creative,
    });
  }
  console.log("\nتم جلب بيانات الإبداع (Creative) لكل إعلان.");

  // تجميع حسب الفيديو (videoId) أو postId عند غياب الفيديو
  const videoMap = new Map();
  for (const ad of adResults) {
    const key = ad.videoId ? `video:${ad.videoId}` : ad.postId ? `post:${ad.postId}` : `unknown:${ad.adId}`;
    if (!videoMap.has(key)) {
      videoMap.set(key, {
        key,
        videoId: ad.videoId,
        postId: ad.videoId ? null : ad.postId,
        thumbnailUrl: ad.thumbnailUrl,
        ads: [],
        totalSpend: 0,
        totalOrders: 0,
        totalLeads: 0,
        totalConversationsStarted: 0,
      });
    }
    const v = videoMap.get(key);
    v.ads.push(ad);
    v.totalSpend += ad.spend;
    v.totalOrders += ad.orders;
    v.totalLeads += ad.leadsCount;
    v.totalConversationsStarted += ad.conversationsStarted;
  }

  const videos = [...videoMap.values()].sort((a, b) => b.totalOrders - a.totalOrders);

  const out = {
    generatedAt: new Date().toISOString(),
    period: { since: SINCE, until: UNTIL, timezone: "Asia/Baghdad" },
    adAccountId: AD_ACCOUNT,
    totalOrdersAllAds: adResults.reduce((s, a) => s + a.orders, 0),
    totalSpendAllAds: adResults.reduce((s, a) => s + a.spend, 0),
    ads: adResults,
    videos: videos.map((v) => ({
      videoId: v.videoId,
      postId: v.postId,
      thumbnailUrl: v.thumbnailUrl,
      adNames: [...new Set(v.ads.map((a) => a.adName))],
      adIds: v.ads.map((a) => a.adId),
      campaignNames: [...new Set(v.ads.map((a) => a.campaignName))],
      totalSpend: Math.round(v.totalSpend * 100) / 100,
      totalOrders: v.totalOrders,
      totalConversationsStarted: v.totalConversationsStarted,
      conversionRate:
        v.totalConversationsStarted > 0 ? Math.round((v.totalOrders / v.totalConversationsStarted) * 10000) / 100 : null,
      costPerOrder: v.totalOrders > 0 ? Math.round((v.totalSpend / v.totalOrders) * 100) / 100 : null,
    })),
  };

  const outPath = path.resolve(__dirname, "../data-imports/video-orders-report.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log("\nحُفظت النتائج في:", outPath);

  console.log("\n=== ملخص أفضل الفيديوهات حسب عدد الطلبات ===");
  for (const v of out.videos.slice(0, 15)) {
    console.log(
      `فيديو ${v.videoId ?? v.postId ?? "غير معروف"} | إعلانات: ${v.adNames.join(",")} | حملات: ${v.campaignNames.join(",")} | إنفاق: ${v.totalSpend} | طلبات: ${v.totalOrders} | تكلفة الطلب: ${v.costPerOrder ?? "لا توجد طلبات"}`,
    );
  }
  console.log("\nإجمالي الطلبات (كل الإعلانات):", out.totalOrdersAllAds);
  console.log("إجمالي الإنفاق (كل الإعلانات):", out.totalSpendAllAds);
}

main().catch((err) => {
  console.error("خطأ:", err);
  process.exit(1);
});
