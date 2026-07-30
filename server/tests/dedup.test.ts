import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { detectDuplicate } from "../src/services/dedup.js";
import { TEST_WORKSPACE_ID } from "./setup.js";

async function createLead(overrides: Record<string, any> = {}) {
  return prisma.lead.create({
    data: {
      workspaceId: TEST_WORKSPACE_ID,
      metaLeadId: `lead-${Math.random()}`,
      normalizedPhone: "+9647701234567",
      status: "جديد",
      ...overrides,
    },
  });
}

describe("detectDuplicate", () => {
  it("يكتشف تكرار رقم الهاتف الموحّد خلال النافذة الزمنية", async () => {
    const first = await createLead();
    const result = await detectDuplicate({
      normalizedPhone: "+9647701234567",
      email: null,
      createdAt: new Date(),
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.duplicateOfId).toBe(first.id);
  });

  it("يكتشف تكرار البريد الإلكتروني", async () => {
    const first = await createLead({ normalizedPhone: null, email: "test@example.com" });
    const result = await detectDuplicate({
      normalizedPhone: null,
      email: "test@example.com",
      createdAt: new Date(),
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.duplicateOfId).toBe(first.id);
  });

  it("لا يعتبر رقمًا مختلفًا تكرارًا", async () => {
    await createLead({ normalizedPhone: "+9647701111111" });
    const result = await detectDuplicate({
      normalizedPhone: "+9647702222222",
      email: null,
      createdAt: new Date(),
    });
    expect(result.isDuplicate).toBe(false);
  });

  it("لا يعتبره تكرارًا خارج النافذة الزمنية", async () => {
    const old = new Date(Date.now() - 200 * 60 * 60 * 1000); // قبل 200 ساعة
    await prisma.lead.create({
      data: {
        workspaceId: TEST_WORKSPACE_ID,
        metaLeadId: "old-lead",
        normalizedPhone: "+9647701234567",
        status: "جديد",
        createdAt: old,
      },
    });
    const result = await detectDuplicate({
      normalizedPhone: "+9647701234567",
      email: null,
      createdAt: new Date(),
      windowHours: 72,
    });
    expect(result.isDuplicate).toBe(false);
  });
});
