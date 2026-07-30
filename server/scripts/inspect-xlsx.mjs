import XLSX from "xlsx";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "../data-imports/nadhara_orders_WORKING.xlsx");

const wb = XLSX.readFile(file);
console.log("مسار الملف:", file);
console.log("أوراق العمل:", wb.SheetNames);

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  console.log(`\n--- ${name} ---`);
  console.log("النطاق:", ws["!ref"]);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  console.log("عدد الصفوف (شامل العناوين):", rows.length);
  if (rows.length > 0) {
    console.log("صف العناوين:", JSON.stringify(rows[0]));
  }
  if (rows.length > 1) {
    console.log("صف بيانات أول:", JSON.stringify(rows[1]));
  }
  if (rows.length > 2) {
    console.log("صف بيانات ثانٍ:", JSON.stringify(rows[2]));
  }
}
