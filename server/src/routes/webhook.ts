import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { verifyWebhookSignature } from "../lib/meta.js";
import { processLeadgenId } from "../services/attribution.js";
import { detectDuplicate } from "../services/dedup.js";

export const webhookRouter = Router();

// ---- 1) GET: Webhook Verification (Meta subscription handshake) ----
webhookRouter.get("/meta/leads", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.metaWebhookVerifyToken && env.metaWebhookVerifyToken) {
    logger.info("Webhook verification succeeded");
    return res.status(200).send(challenge);
  }
  logger.warn({ mode }, "Webhook verification failed");
  return res.sendStatus(403);
});

// ---- 2) POST: Event reception ----
// يتطلب express.raw() على هذا المسار تحديدًا للتحقق من التوقيع HMAC قبل أي JSON.parse (مركّب في index.ts)
webhookRouter.post("/meta/leads", async (req, res) => {
  const rawBody: Buffer = req.body;
  const signature = req.header("x-hub-signature-256");

  if (env.metaAppSecret) {
    const validSignature = verifyWebhookSignature(rawBody, signature);
    if (!validSignature) {
      logger.warn("توقيع Webhook غير صالح - تم رفض الطلب");
      return res.sendStatus(401);
    }
  } else {
    logger.warn("META_APP_SECRET غير مهيأ - تم تخطي التحقق من التوقيع (غير آمن للإنتاج)");
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.sendStatus(400);
  }

  // أعد 200 فورًا لتفادي إعادة إرسال Meta للحدث، ثم عالج بشكل غير متزامن.
  res.sendStatus(200);

  try {
    await handleWebhookPayload(payload);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "فشل غير متوقع في معالجة Webhook");
  }
});

async function handleWebhookPayload(payload: any) {
  if (payload.object !== "page") return;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const value = change.value;
      const leadgenId: string | undefined = value?.leadgen_id;
      const pageId: string | undefined = value?.page_id ?? entry.id;
      if (!leadgenId || !pageId) continue;

      // Idempotency key: leadgen_id ثابت لكل عميل — كافٍ لمنع التكرار حتى لو أعادت Meta إرسال نفس الحدث
      const eventKey = crypto.createHash("sha256").update(`leadgen:${leadgenId}`).digest("hex");
      const workspaceId = env.legacyWorkspaceId;

      const existing = await prisma.webhookEvent.findUnique({
        where: { workspaceId_eventKey: { workspaceId, eventKey } },
      });
      if (existing) {
        logger.info({ leadgenId }, "Webhook مكرر - تم تجاهله (idempotency)");
        continue;
      }

      const event = await prisma.webhookEvent.create({
        data: {
          workspaceId,
          eventKey,
          eventType: "leadgen",
          rawPayload: JSON.stringify(value),
          status: "PENDING",
        },
      });

      try {
        await processLead(leadgenId, pageId);
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { status: "PROCESSED", processedAt: new Date() },
        });
      } catch (err) {
        logger.error({ leadgenId, err: (err as Error).message }, "فشل معالجة Lead");
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: "FAILED",
            errorMessage: (err as Error).message?.slice(0, 2000),
            retryCount: { increment: 1 },
          },
        });
      }
    }
  }
}

export async function processLead(leadgenId: string, pageId: string) {
  const workspaceId = env.legacyWorkspaceId;
  const existingLead = await prisma.lead.findUnique({
    where: { workspaceId_metaLeadId: { workspaceId, metaLeadId: leadgenId } },
  });
  if (existingLead) {
    logger.info({ leadgenId }, "Lead موجود مسبقًا - تم تجاهله");
    return existingLead;
  }

  const attribution = await processLeadgenId(leadgenId, pageId, workspaceId);
  const createdAt = attribution.metaCreatedAt ?? new Date();

  const dup = await detectDuplicate({
    normalizedPhone: attribution.normalizedPhone,
    email: attribution.email,
    createdAt,
  });

  const lead = await prisma.lead.create({
    data: {
      workspaceId,
      metaLeadId: leadgenId,
      name: attribution.name,
      phone: attribution.phone,
      normalizedPhone: attribution.normalizedPhone,
      email: attribution.email,
      metaCreatedAt: attribution.metaCreatedAt,
      pageId: attribution.page.id,
      campaignId: attribution.campaignRecordId,
      adSetId: attribution.adSetRecordId,
      adId: attribution.adRecordId,
      creativeId: attribution.creativeRecordId,
      formId: attribution.formId,
      status: "جديد",
      isDuplicate: dup.isDuplicate,
      duplicateOfId: dup.duplicateOfId,
      duplicateReason: dup.reason,
      rawData: JSON.stringify(attribution.rawData).slice(0, 20_000),
    },
  });

  await prisma.leadStatusHistory.create({
    data: {
      leadId: lead.id,
      oldStatus: null,
      newStatus: "جديد",
      changedBy: "system",
      source: "webhook",
    },
  });

  logger.info({ leadId: lead.id, leadgenId, isDuplicate: dup.isDuplicate }, "تم تخزين Lead جديد");
  return lead;
}
