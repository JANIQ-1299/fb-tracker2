import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMock = vi.fn().mockResolvedValue({});
const getMock = vi.fn();
const spreadsheetsGetMock = vi.fn().mockResolvedValue({ data: { properties: { title: "شيت تجريبي" } } });

vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(() => ({})) },
    sheets: vi.fn().mockImplementation(() => ({
      spreadsheets: {
        get: spreadsheetsGetMock,
        values: { update: updateMock, get: getMock },
      },
    })),
  },
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  const patched = { ...actual, existsSync: () => true };
  return { ...patched, default: patched };
});

const { prisma } = await import("../src/lib/prisma.js");
const { TEST_WORKSPACE_ID } = await import("./setup.js");

describe("مزامنة Google Sheets", () => {
  beforeEach(() => {
    updateMock.mockClear();
    getMock.mockReset();
    process.env.GOOGLE_SHEETS_ENABLED = "true";
    process.env.GOOGLE_SHEET_ID = "sheet123";
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = "./fake.json";
  });

  it("اختبار الاتصال ينجح ويعيد عنوان الشيت", async () => {
    vi.resetModules();
    const { env } = await import("../src/lib/env.js");
    (env as any).googleSheetsEnabled = true;
    (env as any).googleSheetId = "sheet123";
    (env as any).googleServiceAccountKeyFile = "./fake.json";
    const { testConnection } = await import("../src/services/sheets.js");
    const result = await testConnection();
    expect(result.ok).toBe(true);
    expect(result.title).toBe("شيت تجريبي");
  });

  it("مزامنة النظام -> Sheet تكتب صفًا لكل Lead مع الأعمدة المطلوبة", async () => {
    vi.resetModules();
    const { env } = await import("../src/lib/env.js");
    (env as any).googleSheetsEnabled = true;
    (env as any).googleSheetId = "sheet123";
    (env as any).googleServiceAccountKeyFile = "./fake.json";
    await prisma.lead.create({
      data: { workspaceId: TEST_WORKSPACE_ID, metaLeadId: "sheet-lead-1", name: "أحمد", status: "جديد" },
    });

    const { syncSystemToSheet } = await import("../src/services/sheets.js");
    const result = await syncSystemToSheet();
    expect(result.synced).toBe(1);
    expect(updateMock).toHaveBeenCalled();
    const headerCall = updateMock.mock.calls.find((c) => c[0].range?.includes("A1"));
    expect(headerCall[0].requestBody.values[0]).toContain("Lead ID");
    expect(headerCall[0].requestBody.values[0]).toContain("تم تقديم الطلب؟");
  });

  it("مزامنة Sheet -> النظام تحدّث الحالة عند اختلافها فقط", async () => {
    vi.resetModules();
    const { env } = await import("../src/lib/env.js");
    (env as any).googleSheetsEnabled = true;
    (env as any).googleSheetId = "sheet123";
    (env as any).googleServiceAccountKeyFile = "./fake.json";
    const lead = await prisma.lead.create({
      data: { workspaceId: TEST_WORKSPACE_ID, metaLeadId: "sheet-lead-2", status: "جديد" },
    });

    getMock.mockResolvedValueOnce({
      data: { values: [["sheet-lead-2", "", "", "", "", "تم تقديم الطلب"]] },
    });

    const { syncSheetToSystem } = await import("../src/services/sheets.js");
    const result = await syncSheetToSystem();
    expect(result.updated).toBe(1);

    const updated = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(updated?.status).toBe("تم تقديم الطلب");
  });
});
