import { describe, it, expect, vi, beforeEach } from "vitest";

const metaGetMock = vi.fn();
vi.mock("../src/lib/meta.js", () => ({
  metaGet: (...args: any[]) => metaGetMock(...args),
  MetaApiError: class MetaApiError extends Error {},
  verifyWebhookSignature: () => true,
}));

const { fetchAndExtractCreative, fetchLeadDetails, processLeadgenId } = await import(
  "../src/services/attribution.js"
);
const { prisma } = await import("../src/lib/prisma.js");
const { TEST_WORKSPACE_ID } = await import("./setup.js");

beforeEach(() => {
  metaGetMock.mockReset();
});

describe("fetchAndExtractCreative - استخراج مصدر الفيديو من أنواع Creative مختلفة", () => {
  it("إعلان فيديو كلاسيكي: creative.video_id مباشرة", async () => {
    metaGetMock.mockResolvedValueOnce({
      creative: { id: "cr1", video_id: "vid_1", object_type: "VIDEO", thumbnail_url: "http://x/1.jpg" },
    });
    const result = await fetchAndExtractCreative("ad1");
    expect(result.videoId).toBe("vid_1");
    expect(result.sourceType).toBe("VIDEO");
  });

  it("إعلان Reel/Story عبر object_story_spec.video_data.video_id", async () => {
    metaGetMock.mockResolvedValueOnce({
      creative: { id: "cr2", object_story_spec: { video_data: { video_id: "vid_2" } } },
    });
    const result = await fetchAndExtractCreative("ad2");
    expect(result.videoId).toBe("vid_2");
  });

  it("Dynamic Creative / Asset Feed: أول فيديو من asset_feed_spec.videos[]", async () => {
    metaGetMock.mockResolvedValueOnce({
      creative: { id: "cr3", asset_feed_spec: { videos: [{ video_id: "vid_3" }, { video_id: "vid_4" }] } },
    });
    const result = await fetchAndExtractCreative("ad3");
    expect(result.videoId).toBe("vid_3");
    expect(result.sourceType).toBe("ASSET_FEED");
    expect(result.extractionNote).toContain("2");
  });

  it("إعلان من منشور موجود (Existing Post) بدون فيديو مباشر", async () => {
    metaGetMock.mockResolvedValueOnce({
      creative: { id: "cr4", effective_object_story_id: "page_1_post_2", object_type: "SHARE" },
    });
    const result = await fetchAndExtractCreative("ad4");
    expect(result.postId).toBe("page_1_post_2");
    expect(result.sourceType).toBe("EXISTING_POST");
  });

  it("عند تعذّر التحديد يُسجَّل سبب واضح بدل فشل صامت", async () => {
    metaGetMock.mockResolvedValueOnce({ creative: { id: "cr5", object_type: "SOMETHING_NEW" } });
    const result = await fetchAndExtractCreative("ad5");
    expect(result.videoId).toBeNull();
    expect(result.postId).toBeNull();
    expect(result.extractionNote).toBeTruthy();
  });

  it("عند غياب كائن creative بالكامل", async () => {
    metaGetMock.mockResolvedValueOnce({});
    const result = await fetchAndExtractCreative("ad6");
    expect(result.sourceType).toBe("UNKNOWN");
    expect(result.extractionNote).toBeTruthy();
  });
});

describe("processLeadgenId - الربط الكامل بالحملة/المجموعة/الإعلان", () => {
  it("يربط Lead بالحملة والمجموعة الإعلانية والإعلان الصحيحين", async () => {
    metaGetMock
      .mockResolvedValueOnce({
        id: "leadgen_1",
        created_time: "2026-07-20T10:00:00+0000",
        ad_id: "ad_100",
        ad_name: "إعلان تجريبي",
        adset_id: "adset_100",
        adset_name: "مجموعة تجريبية",
        campaign_id: "camp_100",
        campaign_name: "حملة تجريبية",
        form_id: "form_1",
        field_data: [
          { name: "full_name", values: ["فاطمة علي"] },
          { name: "phone_number", values: ["07701234567"] },
        ],
      })
      .mockResolvedValueOnce({
        creative: { id: "cr_100", video_id: "vid_100" },
      });

    const result = await processLeadgenId("leadgen_1", "page_1", TEST_WORKSPACE_ID);

    expect(result.name).toBe("فاطمة علي");
    expect(result.normalizedPhone).toBe("+9647701234567");
    expect(result.campaignRecordId).toBeTruthy();
    expect(result.adSetRecordId).toBeTruthy();
    expect(result.adRecordId).toBeTruthy();

    const campaign = await prisma.campaign.findUnique({
      where: { workspaceId_metaCampaignId: { workspaceId: TEST_WORKSPACE_ID, metaCampaignId: "camp_100" } },
    });
    expect(campaign?.name).toBe("حملة تجريبية");
    const creative = await prisma.creative.findUnique({
      where: { workspaceId_metaCreativeId: { workspaceId: TEST_WORKSPACE_ID, metaCreativeId: "cr_100" } },
    });
    expect(creative?.videoId).toBe("vid_100");
  });
});
