import { describe, it, expect, vi, beforeEach } from "vitest";

const metaGetMock = vi.fn();
vi.mock("../src/lib/meta.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/meta.js")>("../src/lib/meta.js");
  return { ...actual, metaGet: (...args: any[]) => metaGetMock(...args) };
});

const { runInsightsSync } = await import("../src/jobs/insights.js");
const { prisma } = await import("../src/lib/prisma.js");
const { TEST_WORKSPACE_ID } = await import("./setup.js");

const AD_ROW = (metaOrderCount: number, spend = 10) => ({
  data: [
    {
      campaign_id: "camp_delta",
      campaign_name: "حملة اختبار Delta",
      adset_id: "adset_delta",
      adset_name: "مجموعة اختبار",
      ad_id: "ad_delta_1",
      ad_name: "إعلان اختبار Delta",
      spend: String(spend),
      impressions: "100",
      reach: "90",
      clicks: "10",
      actions: [{ action_type: "onsite_conversion.messaging_order_created_v2", value: String(metaOrderCount) }],
      date_start: "2026-07-25",
    },
  ],
});

const CREATIVE_RESPONSE = { creative: { id: "cr_delta_1", video_id: "vid_delta_1" } };

// أول مزامنة لإعلان معيّن فقط تستدعي metaGet مرتين (insights ثم creative)، لأن fetchAndExtractCreative
// لا يُستدعى إلا حين يكون ad.creativeId فارغًا. المزامنات اللاحقة لنفس الإعلان تستدعيه مرة واحدة فقط.
function mockFirstSyncCycle(metaOrderCount: number, spend = 10) {
  metaGetMock.mockResolvedValueOnce(AD_ROW(metaOrderCount, spend)).mockResolvedValueOnce(CREATIVE_RESPONSE);
}
function mockSyncCycle(metaOrderCount: number, spend = 10) {
  metaGetMock.mockResolvedValueOnce(AD_ROW(metaOrderCount, spend));
}

beforeEach(() => {
  metaGetMock.mockReset();
});

describe("runInsightsSync - حساب الفروقات (Delta) لطلبات المراسلة", () => {
  it("أول مزامنة (Baseline) لا تُنشئ DetectedOrderIncrement", async () => {
    mockFirstSyncCycle(10);
    await runInsightsSync();

    const ad = await prisma.ad.findUnique({
      where: { workspaceId_metaAdId: { workspaceId: TEST_WORKSPACE_ID, metaAdId: "ad_delta_1" } },
    });
    const snapshots = await prisma.adPerformanceSnapshot.findMany({ where: { adId: ad!.id } });
    const increments = await prisma.detectedOrderIncrement.findMany({ where: { adId: ad!.id } });

    expect(snapshots.length).toBe(1);
    expect(snapshots[0].isBaseline).toBe(true);
    expect(snapshots[0].metaOrderCount).toBe(10);
    expect(increments.length).toBe(0);
  });

  it("مزامنة ثانية بارتفاع العدد من 10 إلى 13 تُنتج newMetaOrders=3", async () => {
    mockFirstSyncCycle(10);
    await runInsightsSync();
    mockSyncCycle(13, 15);
    await runInsightsSync();

    const ad = await prisma.ad.findUnique({
      where: { workspaceId_metaAdId: { workspaceId: TEST_WORKSPACE_ID, metaAdId: "ad_delta_1" } },
    });
    const increments = await prisma.detectedOrderIncrement.findMany({ where: { adId: ad!.id } });

    expect(increments.length).toBe(1);
    expect(increments[0].previousCount).toBe(10);
    expect(increments[0].currentCount).toBe(13);
    expect(increments[0].newMetaOrders).toBe(3);
    expect(increments[0].spendDelta).toBeCloseTo(5, 5);
  });

  it("عدم تغيّر العدد بين مزامنتين يُنتج newMetaOrders=0", async () => {
    mockFirstSyncCycle(10);
    await runInsightsSync();
    mockSyncCycle(10, 10);
    await runInsightsSync();

    const ad = await prisma.ad.findUnique({
      where: { workspaceId_metaAdId: { workspaceId: TEST_WORKSPACE_ID, metaAdId: "ad_delta_1" } },
    });
    const increments = await prisma.detectedOrderIncrement.findMany({ where: { adId: ad!.id } });

    expect(increments.length).toBe(1);
    expect(increments[0].newMetaOrders).toBe(0);
  });

  it("انخفاض العدد (شذوذ) لا يُنتج رقمًا سالبًا - يُحتسب صفرًا", async () => {
    mockFirstSyncCycle(13);
    await runInsightsSync();
    mockSyncCycle(5, 8); // انخفاض غير منطقي من 13 إلى 5
    await runInsightsSync();

    const ad = await prisma.ad.findUnique({
      where: { workspaceId_metaAdId: { workspaceId: TEST_WORKSPACE_ID, metaAdId: "ad_delta_1" } },
    });
    const increments = await prisma.detectedOrderIncrement.findMany({ where: { adId: ad!.id } });

    expect(increments.length).toBe(1);
    expect(increments[0].newMetaOrders).toBe(0);
    expect(increments[0].previousCount).toBe(13);
    expect(increments[0].currentCount).toBe(5);
  });

  it("Idempotency: تكرار مزامنة بنفس القيمة عدة مرات لا يضاعف الطلبات المكتشفة", async () => {
    mockFirstSyncCycle(10);
    await runInsightsSync();
    for (let i = 0; i < 3; i++) {
      mockSyncCycle(10, 10);
      await runInsightsSync();
    }

    const ad = await prisma.ad.findUnique({
      where: { workspaceId_metaAdId: { workspaceId: TEST_WORKSPACE_ID, metaAdId: "ad_delta_1" } },
    });
    const increments = await prisma.detectedOrderIncrement.findMany({ where: { adId: ad!.id } });
    const totalNew = increments.reduce((s, i) => s + i.newMetaOrders, 0);

    expect(increments.length).toBe(3);
    expect(totalNew).toBe(0);
  });

  it("قفل المزامنة (sync lock) يمنع تشغيل مزامنتين في وقت واحد", async () => {
    mockFirstSyncCycle(10);
    mockFirstSyncCycle(10); // احتياطي إن حاولت الثانية التنفيذ فعليًا (لا يجب أن يحدث)

    const [first, second] = await Promise.all([runInsightsSync(), runInsightsSync()]);
    const results = [first, second];
    const skipped = results.filter((r: any) => r.skipped && r.reason === "sync_in_progress");

    expect(skipped.length).toBe(1);
  });
});
