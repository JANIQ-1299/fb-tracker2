import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import { getMatchTier } from "./matchTier.js";
import { buildAttributionDashboard } from "./attributionDashboard.js";

function videoUrlOf(videoId: string | null | undefined): string {
  return videoId ? `https://www.facebook.com/watch/?v=${videoId}` : "";
}

/** يبني ملف Excel كامل (ورقتان) لنتائج مطابقة مصادر الطلبات - يستخدم حزمة xlsx الموجودة أصلًا
 * (تُستخدم حاليًا للقراءة فقط في importParser.ts). */
export async function buildAttributionWorkbook(workspaceId: string): Promise<Buffer> {
  const orders = await prisma.order.findMany({
    where: { workspaceId },
    include: {
      attribution: { include: { campaign: true, adSet: true, ad: true, creative: true } },
    },
    orderBy: { orderDate: "asc" },
  });

  const detailHeader = [
    "رقم الطلب",
    "اسم العميل",
    "الهاتف",
    "تاريخ الطلب",
    "الحملة",
    "مجموعة الإعلانات",
    "الإعلان",
    "معرف الفيديو",
    "رابط الفيديو",
    "طريقة المطابقة",
    "حالة المطابقة",
    "نسبة الثقة",
    "التصنيف",
    "السبب",
  ];
  const detailRows = orders.map((o) => {
    const a = o.attribution;
    const tier = getMatchTier(a?.matchStatus ?? null, a?.confidence ?? 0);
    return [
      o.externalOrderId ?? o.id.slice(0, 8),
      o.customerName ?? "",
      o.phone ?? "",
      o.orderDate ? o.orderDate.toISOString().slice(0, 16).replace("T", " ") : "",
      a?.campaign?.name ?? "",
      a?.adSet?.name ?? "",
      a?.ad?.name ?? "",
      a?.creative?.videoId ?? "",
      videoUrlOf(a?.creative?.videoId),
      a?.matchMethod ?? "",
      a?.matchStatus ?? "UNMATCHED",
      a ? Math.round(a.confidence * 100) + "%" : "0%",
      tier.label,
      a?.reason ?? "لم تُشغَّل المطابقة بعد لهذا الطلب",
    ];
  });

  const detailSheet = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
  detailSheet["!cols"] = [
    { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 22 },
    { wch: 22 }, { wch: 16 }, { wch: 38 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
    { wch: 12 }, { wch: 50 },
  ];

  const dashboard = await buildAttributionDashboard(workspaceId);
  const summaryHeader = [
    "الإعلان/الفيديو",
    "الحملة",
    "عدد الطلبات",
    "مؤكد",
    "قوي",
    "تقريبي",
    "يحتاج مراجعة",
    "غير معروف",
    "الإيراد",
    "الصرف الإعلاني",
    "تكلفة الطلب",
    "رابط الفيديو",
  ];
  const summaryRows = dashboard.byVideo.map((r) => [
    r.adName ?? r.videoId ?? "",
    r.campaignName ?? "",
    r.orderCount,
    r.tiers.confirmed,
    r.tiers.strong,
    r.tiers.approximate,
    r.tiers.needsReview,
    r.tiers.unknown,
    r.revenue,
    r.spend,
    r.costPerOrder !== null ? Math.round(r.costPerOrder) : "",
    r.videoUrl ?? "",
  ]);
  summaryRows.push([
    "غير مطابق لأي إعلان/فيديو",
    "",
    dashboard.unattributed.orderCount,
    "",
    "",
    "",
    "",
    dashboard.unattributed.orderCount,
    dashboard.unattributed.revenue,
    "",
    "",
    "",
  ]);

  const summarySheet = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryRows]);
  summarySheet["!cols"] = [
    { wch: 26 }, { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 38 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, detailSheet, "تفاصيل الطلبات");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "ملخص Dashboard");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
