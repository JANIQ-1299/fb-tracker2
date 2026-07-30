import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

vi.mock("../src/services/capi.js", () => ({
  sendLeadStatusToMeta: vi.fn().mockResolvedValue({ sent: false, reason: "test" }),
}));

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const { TEST_WORKSPACE_ID } = await import("./setup.js");

async function loginAndGetToken(app: any) {
  await prisma.adminUser.create({
    data: { email: "tester@example.com", passwordHash: await bcrypt.hash("Passw0rd!", 10) },
  });
  const res = await request(app).post("/api/auth/login").send({ email: "tester@example.com", password: "Passw0rd!" });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

describe("تغيير حالة العميل إلى 'تم تقديم الطلب'", () => {
  it("يحدّث الحالة، يسجّل submittedOrderAt، ويضيف سجلًا في LeadStatusHistory", async () => {
    const app = buildApp();
    const token = await loginAndGetToken(app);

    const lead = await prisma.lead.create({
      data: { workspaceId: TEST_WORKSPACE_ID, metaLeadId: "lead-status-1", status: "جديد" },
    });

    const res = await request(app)
      .patch(`/api/leads/${lead.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "تم تقديم الطلب" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("تم تقديم الطلب");
    expect(res.body.submittedOrderAt).toBeTruthy();

    const history = await prisma.leadStatusHistory.findMany({ where: { leadId: lead.id } });
    expect(history.length).toBe(1);
    expect(history[0].oldStatus).toBe("جديد");
    expect(history[0].newStatus).toBe("تم تقديم الطلب");
  });

  it("يرفض الوصول بدون تسجيل دخول", async () => {
    const app = buildApp();
    const lead = await prisma.lead.create({
      data: { workspaceId: TEST_WORKSPACE_ID, metaLeadId: "lead-status-2", status: "جديد" },
    });
    const res = await request(app).patch(`/api/leads/${lead.id}/status`).send({ status: "تم تقديم الطلب" });
    expect(res.status).toBe(401);
  });
});
