import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import * as XLSX from "xlsx";

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const { env } = await import("../src/lib/env.js");
const { TEST_WORKSPACE_ID } = await import("./setup.js");

const WORKSPACE_B_ID = "test-workspace-imports-b";

function signUserToken(userId: string, email: string, workspaceId: string, role = "OWNER") {
  return jwt.sign({ typ: "user", id: userId, email, workspaceId, role }, env.jwtSecret, { expiresIn: "1h" });
}

async function seedWorkspaceB() {
  await prisma.workspace.create({ data: { id: WORKSPACE_B_ID, name: "Workspace B" } });
  await prisma.workspaceSubscription.create({ data: { workspaceId: WORKSPACE_B_ID, status: "ACTIVE" } });
}

function buildXlsxBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function uploadFile(app: any, token: string, buffer: Buffer, filename: string) {
  return request(app)
    .post("/api/imports/upload")
    .set("Authorization", `Bearer ${token}`)
    .attach("file", buffer, filename);
}

describe("استيراد ملف عربي", () => {
  it("يتعرّف تلقائيًا على أعمدة عربية ويستوردها بنجاح", async () => {
    const app = buildApp();
    const token = signUserToken("user-ar", "ar@example.com", TEST_WORKSPACE_ID);

    const buffer = buildXlsxBuffer({
      "Sheet1": [
        ["اسم الزبون", "رقم الهاتف", "المحافظة", "العنوان", "المنتج", "السعر", "حالة الطلب", "تاريخ الطلب"],
        ["فاطمة علي", "07701234567", "بغداد", "الكرادة", "كريم", "15000", "جديد", "2026-07-01"],
      ],
    });

    const uploadRes = await uploadFile(app, token, buffer, "orders_ar.xlsx");
    expect(uploadRes.status).toBe(200);
    const { stagingId, sheetNames } = uploadRes.body;
    expect(sheetNames).toEqual(["Sheet1"]);

    const sheetRes = await request(app)
      .get(`/api/imports/${stagingId}/sheets/Sheet1`)
      .set("Authorization", `Bearer ${token}`);
    expect(sheetRes.status).toBe(200);
    expect(sheetRes.body.suggestedMapping.customerName).toBe(0);
    expect(sheetRes.body.suggestedMapping.phone).toBe(1);
    expect(sheetRes.body.suggestedMapping.governorate).toBe(2);
    expect(sheetRes.body.suggestedMapping.price).toBe(5);

    const confirmRes = await request(app)
      .post(`/api/imports/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping: sheetRes.body.suggestedMapping, duplicateStrategy: "skip" });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.message).toContain("تم استيراد الطلبات بنجاح");
    expect(confirmRes.body.importedFile.acceptedCount).toBe(1);

    const orders = await prisma.order.findMany({ where: { workspaceId: TEST_WORKSPACE_ID } });
    expect(orders.length).toBe(1);
    expect(orders[0].customerName).toBe("فاطمة علي");
    expect(orders[0].normalizedPhone).toBe("+9647701234567");
    expect(orders[0].price).toBe(15000);
  });
});

describe("استيراد ملف إنجليزي", () => {
  it("يتعرّف تلقائيًا على أعمدة إنجليزية ويستوردها بنجاح", async () => {
    const app = buildApp();
    const token = signUserToken("user-en", "en@example.com", TEST_WORKSPACE_ID);

    const buffer = buildXlsxBuffer({
      Sheet1: [
        ["Customer Name", "Phone", "Governorate", "Product", "Price", "Status"],
        ["John Smith", "07709876543", "Baghdad", "Cream", "20000", "New"],
      ],
    });

    const uploadRes = await uploadFile(app, token, buffer, "orders_en.xlsx");
    const { stagingId } = uploadRes.body;
    const sheetRes = await request(app)
      .get(`/api/imports/${stagingId}/sheets/Sheet1`)
      .set("Authorization", `Bearer ${token}`);
    expect(sheetRes.body.suggestedMapping.customerName).toBe(0);
    expect(sheetRes.body.suggestedMapping.phone).toBe(1);
    expect(sheetRes.body.suggestedMapping.product).toBe(3);
    expect(sheetRes.body.suggestedMapping.price).toBe(4);

    const confirmRes = await request(app)
      .post(`/api/imports/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping: sheetRes.body.suggestedMapping, duplicateStrategy: "skip" });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.importedFile.acceptedCount).toBe(1);
  });
});

describe("اختلاف ترتيب الأعمدة", () => {
  it("يتعرّف على الأعمدة بغض النظر عن ترتيبها", async () => {
    const app = buildApp();
    const token = signUserToken("user-reorder", "reorder@example.com", TEST_WORKSPACE_ID);

    // نفس حقول الاختبار الأول لكن بترتيب مختلف تمامًا
    const buffer = buildXlsxBuffer({
      Sheet1: [
        ["السعر", "تاريخ الطلب", "اسم الزبون", "حالة الطلب", "رقم الهاتف"],
        ["30000", "2026-07-02", "زينب كاظم", "قيد المعالجة", "07711112222"],
      ],
    });

    const uploadRes = await uploadFile(app, token, buffer, "reordered.xlsx");
    const { stagingId } = uploadRes.body;
    const sheetRes = await request(app)
      .get(`/api/imports/${stagingId}/sheets/Sheet1`)
      .set("Authorization", `Bearer ${token}`);

    expect(sheetRes.body.suggestedMapping.price).toBe(0);
    expect(sheetRes.body.suggestedMapping.orderDate).toBe(1);
    expect(sheetRes.body.suggestedMapping.customerName).toBe(2);
    expect(sheetRes.body.suggestedMapping.orderStatus).toBe(3);
    expect(sheetRes.body.suggestedMapping.phone).toBe(4);
  });
});

describe("الأرقام العربية والإنجليزية", () => {
  it("يحوّل الأرقام العربية في الهاتف والسعر إلى إنجليزية صحيحة", async () => {
    const app = buildApp();
    const token = signUserToken("user-digits", "digits@example.com", TEST_WORKSPACE_ID);

    const buffer = buildXlsxBuffer({
      Sheet1: [
        ["اسم الزبون", "رقم الهاتف", "السعر"],
        ["سارة", "٠٧٧١٢٣٤٥٦٧٨", "١٥٠٠٠"],
      ],
    });

    const uploadRes = await uploadFile(app, token, buffer, "arabic_digits.xlsx");
    const { stagingId } = uploadRes.body;
    const sheetRes = await request(app)
      .get(`/api/imports/${stagingId}/sheets/Sheet1`)
      .set("Authorization", `Bearer ${token}`);
    const mapping = sheetRes.body.suggestedMapping;

    const validateRes = await request(app)
      .post(`/api/imports/${stagingId}/validate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping: mapping });

    expect(validateRes.body.validCount).toBe(1);
    expect(validateRes.body.sampleValid[0].data.normalizedPhone).toBe("+9647712345678");
    expect(validateRes.body.sampleValid[0].data.price).toBe(15000);
  });
});

describe("الصفوف الناقصة والمكررة", () => {
  it("يصنّف الصف بلا اسم أو هاتف كناقص، ويكتشف تكرار رقم الهاتف", async () => {
    const app = buildApp();
    const token = signUserToken("user-missing-dup", "md@example.com", TEST_WORKSPACE_ID);

    const buffer = buildXlsxBuffer({
      Sheet1: [
        ["اسم الزبون", "رقم الهاتف", "السعر"],
        ["أحمد", "07701111111", "10000"],
        ["", "", "5000"], // ناقص: بلا اسم وبلا هاتف
        ["أحمد مكرر", "07701111111", "10000"], // مكرر لنفس الهاتف أعلاه
      ],
    });

    const uploadRes = await uploadFile(app, token, buffer, "missing_dup.xlsx");
    const { stagingId } = uploadRes.body;
    const sheetRes = await request(app)
      .get(`/api/imports/${stagingId}/sheets/Sheet1`)
      .set("Authorization", `Bearer ${token}`);

    const validateRes = await request(app)
      .post(`/api/imports/${stagingId}/validate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping: sheetRes.body.suggestedMapping });

    expect(validateRes.body.totalRows).toBe(3);
    expect(validateRes.body.validCount).toBe(1);
    expect(validateRes.body.missingCount).toBe(1);
    expect(validateRes.body.duplicateCount).toBe(1);
  });
});

describe("صف عنوان عام قبل صف أسماء الأعمدة", () => {
  it("يتجاهل صف العنوان العام ويكتشف صف العناوين الحقيقي تلقائيًا", async () => {
    const app = buildApp();
    const token = signUserToken("user-title-row", "title@example.com", TEST_WORKSPACE_ID);

    // صف عنوان عام (خلية واحدة فقط، والباقي فارغ كما يحدث مع الخلايا المدمجة)، ثم صف عناوين
    // حقيقي في الصف الثاني، تمامًا كما وصف المستخدم في الملف الحقيقي.
    const buffer = buildXlsxBuffer({
      Sheet1: [
        ["طلبات 26–28 يوليو 2026 — مهيأة للرفع إلى كلاود", null, null, null, null, null, null],
        ["رقم الطلب", "التاريخ", "الوقت", "الموظف", "المحافظة", "العنوان التفصيلي", "رقم الهاتف"],
        ["1001", "2026-07-26", "14:30", "علي", "بغداد", "الكرادة", "07701234567"],
      ],
    });

    const uploadRes = await uploadFile(app, token, buffer, "titled_orders.xlsx");
    const { stagingId } = uploadRes.body;
    const sheetRes = await request(app)
      .get(`/api/imports/${stagingId}/sheets/Sheet1`)
      .set("Authorization", `Bearer ${token}`);

    // يجب اكتشاف صف العناوين الحقيقي في الفهرس 1 (الصف الثاني)، وليس الصف الأول (صف العنوان العام)
    expect(sheetRes.body.headerRowIndex).toBe(1);
    expect(sheetRes.body.headers).toEqual([
      "رقم الطلب",
      "التاريخ",
      "الوقت",
      "الموظف",
      "المحافظة",
      "العنوان التفصيلي",
      "رقم الهاتف",
    ]);
    // إجمالي الصفوف بعد استبعاد صف العنوان وصف العناوين = صف بيانات واحد فقط
    expect(sheetRes.body.totalRows).toBe(1);

    const mapping = sheetRes.body.suggestedMapping;
    expect(mapping.externalOrderId).toBe(0);
    expect(mapping.orderDate).toBe(1);
    expect(mapping.orderTime).toBe(2);
    expect(mapping.employeeName).toBe(3);
    expect(mapping.governorate).toBe(4);
    expect(mapping.address).toBe(5);
    expect(mapping.phone).toBe(6);

    const confirmRes = await request(app)
      .post(`/api/imports/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping: mapping, duplicateStrategy: "skip" });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.importedFile.rowCount).toBe(1);
    expect(confirmRes.body.importedFile.acceptedCount).toBe(1);

    const orders = await prisma.order.findMany({ where: { workspaceId: TEST_WORKSPACE_ID, externalOrderId: "1001" } });
    expect(orders.length).toBe(1);
    expect(orders[0].governorate).toBe("بغداد");
    expect(orders[0].address).toBe("الكرادة");
  });
});

describe("دمج عمودي التاريخ والوقت", () => {
  it("يدمج التاريخ والوقت في حقل orderDate واحد بدل تجاهل الوقت", async () => {
    const app = buildApp();
    const token = signUserToken("user-datetime", "dt@example.com", TEST_WORKSPACE_ID);

    const buffer = buildXlsxBuffer({
      Sheet1: [
        ["اسم الزبون", "رقم الهاتف", "التاريخ", "الوقت"],
        ["هدى", "07701235555", "2026-07-27", "14:30"],
      ],
    });

    const uploadRes = await uploadFile(app, token, buffer, "datetime.xlsx");
    const { stagingId } = uploadRes.body;
    const sheetRes = await request(app)
      .get(`/api/imports/${stagingId}/sheets/Sheet1`)
      .set("Authorization", `Bearer ${token}`);
    expect(sheetRes.body.suggestedMapping.orderTime).toBe(3);

    const validateRes = await request(app)
      .post(`/api/imports/${stagingId}/validate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping: sheetRes.body.suggestedMapping });
    expect(validateRes.body.validCount).toBe(1);

    const confirmRes = await request(app)
      .post(`/api/imports/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping: sheetRes.body.suggestedMapping, duplicateStrategy: "skip" });
    expect(confirmRes.status).toBe(200);

    const order = await prisma.order.findFirst({ where: { workspaceId: TEST_WORKSPACE_ID, customerName: "هدى" } });
    expect(order?.orderDate).toBeTruthy();
    const savedDate = new Date(order!.orderDate!);
    expect(savedDate.getUTCFullYear()).toBe(2026);
    expect(savedDate.getUTCMonth()).toBe(6); // يوليو = الفهرس 6
    expect(savedDate.getUTCDate()).toBe(27);
    expect(savedDate.getUTCHours()).toBe(14);
    expect(savedDate.getUTCMinutes()).toBe(30);
  });
});

describe("ملف بأكثر من ورقة عمل", () => {
  it("يعرض كل الأوراق ويسمح باختيار أي منها", async () => {
    const app = buildApp();
    const token = signUserToken("user-multisheet", "ms@example.com", TEST_WORKSPACE_ID);

    const buffer = buildXlsxBuffer({
      "طلبات يوليو": [
        ["اسم الزبون", "رقم الهاتف"],
        ["ليلى", "07701231111"],
      ],
      "طلبات أغسطس": [
        ["اسم الزبون", "رقم الهاتف"],
        ["مريم", "07701232222"],
      ],
    });

    const uploadRes = await uploadFile(app, token, buffer, "multi_sheet.xlsx");
    expect(uploadRes.body.sheetNames).toEqual(["طلبات يوليو", "طلبات أغسطس"]);

    const sheet2Res = await request(app)
      .get(`/api/imports/${uploadRes.body.stagingId}/sheets/${encodeURIComponent("طلبات أغسطس")}`)
      .set("Authorization", `Bearer ${token}`);
    expect(sheet2Res.status).toBe(200);
    expect(sheet2Res.body.previewRows[0][0]).toBe("مريم");
  });
});

describe("منع استيراد ملف غير مدعوم", () => {
  it("يرفض ملفًا بامتداد غير مدعوم", async () => {
    const app = buildApp();
    const token = signUserToken("user-badfile", "bad@example.com", TEST_WORKSPACE_ID);

    const res = await uploadFile(app, token, Buffer.from("not a spreadsheet"), "orders.pdf");
    expect(res.status).toBe(400);
  });
});

describe("عزل ملفات وطلبات الاستيراد بين الـWorkspaces", () => {
  it("لا يستطيع Workspace B رؤية سجل استيراد أو الوصول لجلسة رفع تخص Workspace A", async () => {
    await seedWorkspaceB();
    const app = buildApp();
    const tokenA = signUserToken("user-iso-a", "iso-a@example.com", TEST_WORKSPACE_ID);
    const tokenB = signUserToken("user-iso-b", "iso-b@example.com", WORKSPACE_B_ID);

    const buffer = buildXlsxBuffer({
      Sheet1: [
        ["اسم الزبون", "رقم الهاتف"],
        ["عزل", "07701239999"],
      ],
    });
    const uploadRes = await uploadFile(app, tokenA, buffer, "isolation.xlsx");
    const { stagingId } = uploadRes.body;

    // Workspace B لا يستطيع الوصول لجلسة رفع Workspace A
    const sheetAsB = await request(app)
      .get(`/api/imports/${stagingId}/sheets/Sheet1`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(sheetAsB.status).toBe(404);

    const confirmAsB = await request(app)
      .post(`/api/imports/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ sheetName: "Sheet1", columnMapping: { customerName: 0, phone: 1 }, duplicateStrategy: "skip" });
    expect(confirmAsB.status).toBe(404);

    // Workspace A يكمل الاستيراد بنجاح
    const confirmAsA = await request(app)
      .post(`/api/imports/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ sheetName: "Sheet1", columnMapping: { customerName: 0, phone: 1 }, duplicateStrategy: "skip" });
    expect(confirmAsA.status).toBe(200);

    // سجل الاستيراد: كل Workspace يرى ملفاته فقط
    const historyA = await request(app).get("/api/imports").set("Authorization", `Bearer ${tokenA}`);
    const historyB = await request(app).get("/api/imports").set("Authorization", `Bearer ${tokenB}`);
    expect(historyA.body.files.some((f: any) => f.filename === "isolation.xlsx")).toBe(true);
    expect(historyB.body.files.length).toBe(0);

    const ordersB = await prisma.order.findMany({ where: { workspaceId: WORKSPACE_B_ID } });
    expect(ordersB.length).toBe(0);
  });
});
