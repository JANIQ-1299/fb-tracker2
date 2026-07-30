import XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportData = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../data-imports/video-orders-report.json"), "utf8"));
const ordersFile = path.resolve(__dirname, "../data-imports/nadhara_orders_WORKING.xlsx");
const ordersWb = XLSX.readFile(ordersFile);
const ordersRows = XLSX.utils.sheet_to_json(ordersWb.Sheets["الطلبات المرتبة"], { defval: "" });

const wb = XLSX.utils.book_new();

// ---- 1) ملخص الفيديوهات ----
const videoHeaders = [
  "الترتيب", "Video ID", "أسماء الإعلانات", "أسماء الحملات", "عدد الطلبات (Meta orders_created)",
  "عدد المحادثات التي بدأت", "نسبة التحويل %", "الإنفاق (USD)", "تكلفة الطلب (USD)",
];
const videoRows = reportData.videos.map((v, i) => [
  i + 1,
  v.videoId ?? v.postId ?? "غير معروف",
  v.adNames.join(" | "),
  v.campaignNames.join(" | "),
  v.totalOrders,
  v.totalConversationsStarted,
  v.conversionRate ?? "",
  v.totalSpend,
  v.totalOrders > 0 ? v.costPerOrder : "لا توجد طلبات",
]);
const wsVideos = XLSX.utils.aoa_to_sheet([videoHeaders, ...videoRows]);
wsVideos["!cols"] = [{ wch: 8 }, { wch: 18 }, { wch: 30 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
XLSX.utils.book_append_sheet(wb, wsVideos, "ملخص الفيديوهات");

// ---- 2) تفاصيل الإعلانات (كل 34 إعلانًا) ----
const adHeaders = [
  "Ad ID", "اسم الإعلان", "Ad Set ID", "اسم المجموعة", "Campaign ID", "اسم الحملة",
  "Video ID", "Post ID", "نوع المصدر", "ملاحظة الاستخراج", "الإنفاق (USD)", "المشاهدات",
  "الوصول", "النقرات", "عدد الطلبات", "محادثات بدأت",
];
const adRows = reportData.ads
  .sort((a, b) => b.orders - a.orders)
  .map((a) => [
    a.adId, a.adName, a.adsetId, a.adsetName, a.campaignId, a.campaignName,
    a.videoId ?? "", a.postId ?? "", a.sourceType, a.note ?? "", a.spend, a.impressions,
    a.reach, a.clicks, a.orders, a.conversationsStarted,
  ]);
const wsAds = XLSX.utils.aoa_to_sheet([adHeaders, ...adRows]);
wsAds["!cols"] = adHeaders.map(() => ({ wch: 16 }));
XLSX.utils.book_append_sheet(wb, wsAds, "تفاصيل الإعلانات");

// ---- 3) الطلبات الأصلية (77 من ملف المستخدم، بدون تعديل) ----
const wsOriginalOrders = XLSX.utils.json_to_sheet(ordersRows);
XLSX.utils.book_append_sheet(wb, wsOriginalOrders, "الطلبات الأصلية (77)");

// ---- 4) ملاحظات منهجية ----
const methodologyRows = [
  ["ملاحظات منهجية مهمة - اقرأها قبل استخدام الأرقام", ""],
  ["", ""],
  ["المصدر الحقيقي لأرقام 'ملخص الفيديوهات' و'تفاصيل الإعلانات'",
    "Meta Marketing API (Graph API) مباشرة - Insights حقيقية 100%، وليست تخمينًا أو محاكاة."],
  ["الفترة الزمنية", `${reportData.period.since} إلى ${reportData.period.until} (توقيت Asia/Baghdad)`],
  ["كيف يُحسب 'عدد الطلبات' لكل فيديو/إعلان؟",
    "من إجراء التحويل الرسمي في Meta Insights: onsite_conversion.messaging_order_created_v2 - وهو حدث 'تم إنشاء طلب' الذي تتتبعه Meta تلقائيًا لمحادثات المراسلة الناتجة عن الإعلان. تم التحقق: مجموع الطلبات عبر كل الإعلانات (48) يطابق تمامًا رقم الحساب الإجمالي من Meta."],
  ["لماذا 48 وليس 77؟",
    "ملف الطلبات (77 صفًا) أعده صاحب النشاط يدويًا من محادثات فعلية مؤكدة، وقد يشمل طلبات من مصادر غير مرتبطة مباشرة بحدث Meta التحويلي (تواصل عضوي، تكرار عميل بدون رسالة جديدة، طلبات تمت متابعتها خارج نافذة تتبع Meta الزمنية القياسية). رقم 48 هو ما تؤكده Meta نفسها كأحداث 'طلب' مرتبطة بإعلان محدد."],
  ["هل تم ربط كل طلب من الـ77 برقم هاتف بفيديو محدد؟",
    "لا. حاولنا ذلك عبر عدة طرق (تصدير Leads Center CSV، فتح المحادثات فرديًا عبر أتمتة المتصفح، البحث بالهاتف داخل Inbox) ولم تنجح أي طريقة بشكل موثوق - إما لغياب رقم الهاتف من بيانات Meta المصدَّرة، أو لعدم استقرار أتمتة المتصفح مع واجهة Meta المعقدة. لم نخمّن أي ربط. راجع ورقة 'الطلبات الأصلية (77)' كمرجع خام فقط دون ربط بفيديو."],
  ["ما الحل الدائم للمستقبل؟",
    "تفعيل استقبال حدث messaging_referral عبر Webhook (مدعوم رسميًا من Meta) ليُسجَّل ad_id تلقائيًا لحظة بدء كل محادثة جديدة قادمة من إعلان، بدل محاولة استرجاعه لاحقًا لمحادثات قديمة (وهو غير مدعوم من Meta أساسًا)."],
  ["CPL مقابل Cost per Order",
    "لم نخلط بينهما: 'تكلفة الطلب' هنا = الإنفاق ÷ عدد أحداث 'طلب تم إنشاؤه' الرسمية (وليس عدد Leads أو محادثات فقط)."],
  ["Seed Data / بيانات تجريبية", "هذا التقرير مبني بالكامل على بيانات Meta Insights الحقيقية من حساب الإعلانات الفعلي - لا علاقة له ببيانات seed التجريبية في قاعدة بيانات النظام المحلي."],
];
const wsMethodology = XLSX.utils.aoa_to_sheet(methodologyRows);
wsMethodology["!cols"] = [{ wch: 45 }, { wch: 90 }];
XLSX.utils.book_append_sheet(wb, wsMethodology, "ملاحظات منهجية");

const outPath = path.resolve(__dirname, "../data-imports/nadhara_video_order_results.xlsx");
XLSX.writeFile(wb, outPath);
console.log("تم إنشاء الملف النهائي:", outPath);
