import XLSX from "xlsx";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "../data-imports/nadhara_orders_WORKING.xlsx");

const wb = XLSX.readFile(file);
const ws = wb.Sheets["الطلبات المرتبة"];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

console.log("إجمالي الصفوف:", rows.length);

const phoneRegex = /^\+9647\d{8}$/;
let validPhones = 0;
let invalidPhones = 0;
const invalidList = [];
const phoneCount = {};
const duplicateGroups = {};

for (const r of rows) {
  const phone = String(r["رقم الهاتف الدولي E.164"] || "").trim();
  const orderNum = r["رقم الطلب"];
  if (phoneRegex.test(phone)) {
    validPhones++;
  } else {
    invalidPhones++;
    invalidList.push({ orderNum, phoneLocal: r["رقم الهاتف المحلي"], phoneE164: phone });
  }
  phoneCount[phone] = (phoneCount[phone] || 0) + 1;
}

console.log("أرقام هاتف بصيغة E.164 صحيحة الشكل:", validPhones);
console.log("أرقام هاتف تحتاج مراجعة:", invalidPhones);
if (invalidList.length) console.log("تفاصيل الأرقام المشكوك بها:", JSON.stringify(invalidList, null, 2));

const dupPhones = Object.entries(phoneCount).filter(([p, c]) => c > 1 && p !== "");
console.log("\nأرقام هاتف مكررة (نفس الرقم أكثر من طلب):", dupPhones.length);
for (const [phone, count] of dupPhones) {
  const orders = rows.filter((r) => String(r["رقم الهاتف الدولي E.164"]).trim() === phone).map((r) => r["رقم الطلب"]);
  console.log(`  ${phone} -> الطلبات: ${orders.join(", ")}`);
}

const uniquePhones = new Set(Object.keys(phoneCount).filter((p) => p !== ""));
console.log("\nعدد الطلبات الفريدة (بحسب الهاتف):", uniquePhones.size);

// حالة التكرار وحالة الرقم الأعمدة الموجودة أصلًا في الملف نفسه
const dupStatusCol = {};
for (const r of rows) {
  const s = r["حالة التكرار"] || "(فارغ)";
  dupStatusCol[s] = (dupStatusCol[s] || 0) + 1;
}
console.log("\nتوزيع عمود 'حالة التكرار' من الملف نفسه:", JSON.stringify(dupStatusCol));

const phoneStatusCol = {};
for (const r of rows) {
  const s = r["حالة الرقم"] || "(فارغ)";
  phoneStatusCol[s] = (phoneStatusCol[s] || 0) + 1;
}
console.log("توزيع عمود 'حالة الرقم' من الملف نفسه:", JSON.stringify(phoneStatusCol));

const provinceCol = {};
for (const r of rows) {
  const s = r["المحافظة"] || "(فارغ)";
  provinceCol[s] = (provinceCol[s] || 0) + 1;
}
console.log("\nتوزيع المحافظات:", JSON.stringify(provinceCol, null, 2));

// نطاق التواريخ
const dates = rows.map((r) => r["التاريخ"]).filter(Boolean);
console.log("\nأقدم تاريخ (serial):", Math.min(...dates), "أحدث تاريخ (serial):", Math.max(...dates));

function excelSerialToDate(serial) {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + serial * 86400000);
}
console.log("أقدم تاريخ فعلي:", excelSerialToDate(Math.min(...dates)).toISOString());
console.log("أحدث تاريخ فعلي:", excelSerialToDate(Math.max(...dates)).toISOString());
