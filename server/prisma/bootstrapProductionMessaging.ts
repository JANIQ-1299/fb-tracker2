// سكربت لمرة واحدة: يُنشئ الحد الأدنى من البيانات في قاعدة إنتاج فارغة (Workspace + صفحة نضارة +
// اتصال Meta مُشفَّر بنفس التوكن الحقيقي المُتحقَّق منه + تفعيل استقبال رسائل إنستغرام) حتى يعمل
// خط أنابيب "اكتشاف الحجز من رقم الهاتف + معرفة الفيديو المصدر" فعليًا على الخادم الحي.
//
// يُشغَّل مرة واحدة فقط عبر Render One-Off Job (يرث كل متغيرات البيئة الحقيقية المنشورة أصلًا -
// META_PAGE_ID/META_BUSINESS_ID/META_AD_ACCOUNT_ID/META_PAGE_ACCESS_TOKEN/ENCRYPTION_KEY/
// LEGACY_WORKSPACE_ID - فلا حاجة لأي رابط اتصال قاعدة بيانات خام يُستخرَج يدويًا).
//
// لا يلمس أي بيانات طلبات/عملاء تاريخية - فقط هوية العمل نفسها (Workspace/صفحة/اتصال Meta).
//
// الاستخدام: SEED_OWNER_EMAIL=... SEED_OWNER_PASSWORD=... npx tsx prisma/bootstrapProductionMessaging.ts

import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

// يعمل سواء تم تشغيله من مجلد server/ (محليًا) أو بلا أي ملف .env إطلاقًا (Render One-Off Job
// يحقن متغيرات البيئة الحقيقية مباشرة في العملية - لا حاجة لأي ملف هناك). نفس منطق env.ts.
for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../.env")]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`متغير البيئة المطلوب مفقود: ${name}`);
  return value;
}

function encryptToken(plaintext: string, encryptionKeyHex: string) {
  const key = Buffer.from(encryptionKeyHex, "hex");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY يجب أن يكون 32 بايت (64 حرف hex)");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

async function main() {
  const workspaceId = required("LEGACY_WORKSPACE_ID");
  const metaPageId = required("META_PAGE_ID");
  const metaBusinessId = required("META_BUSINESS_ID");
  const metaAdAccountId = required("META_AD_ACCOUNT_ID");
  const metaPageAccessToken = required("META_PAGE_ACCESS_TOKEN");
  const encryptionKey = required("ENCRYPTION_KEY");
  const ownerEmail = required("SEED_OWNER_EMAIL");
  const ownerPassword = required("SEED_OWNER_PASSWORD");

  console.log(`== تجهيز إنتاج نضارة (Workspace: ${workspaceId}) ==`);

  const plan = await prisma.subscriptionPlan.upsert({
    where: { name: "افتراضية" },
    create: { name: "افتراضية", maxPages: 5, maxAdAccounts: 5, maxUsers: 5 },
    update: {},
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: workspaceId },
    create: { id: workspaceId, name: "نضارة" },
    update: {},
  });
  console.log(`✅ Workspace: ${workspace.name} (${workspace.id})`);

  await prisma.workspaceSubscription.upsert({
    where: { workspaceId: workspace.id },
    create: {
      workspaceId: workspace.id,
      planId: plan.id,
      status: "ACTIVE",
      maxPages: plan.maxPages,
      maxAdAccounts: plan.maxAdAccounts,
      maxUsers: plan.maxUsers,
      createdBy: "bootstrap-script",
    },
    update: {},
  });

  const existingOwner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (existingOwner) {
    console.log(`ℹ️  المستخدم ${ownerEmail} موجود مسبقًا - تم تخطي الإنشاء`);
  } else {
    const passwordHash = await bcrypt.hash(ownerPassword, 12);
    const owner = await prisma.user.create({
      data: { email: ownerEmail, passwordHash, role: "OWNER", workspaceId: workspace.id },
    });
    console.log(`✅ مستخدم Owner: ${owner.email}`);
  }

  const business = await prisma.business.upsert({
    where: { workspaceId_metaBusinessId: { workspaceId: workspace.id, metaBusinessId } },
    create: { workspaceId: workspace.id, metaBusinessId, name: "نضارة" },
    update: {},
  });

  const meRes = await fetch(
    `https://graph.facebook.com/v25.0/me?fields=id,name&access_token=${encodeURIComponent(metaPageAccessToken)}`,
  );
  const me = (await meRes.json()) as { id?: string; name?: string; error?: unknown };
  if (!me.id) throw new Error(`فشل التحقق من التوكن عبر /me: ${JSON.stringify(me)}`);
  console.log(`✅ التوكن يخص: ${me.name} (${me.id})`);

  const { ciphertext, iv, tag } = encryptToken(metaPageAccessToken, encryptionKey);
  const metaConnection = await prisma.metaConnection.upsert({
    where: { workspaceId_metaUserId: { workspaceId: workspace.id, metaUserId: me.id } },
    create: {
      workspaceId: workspace.id,
      metaUserId: me.id,
      accessTokenEncrypted: ciphertext,
      tokenIv: iv,
      tokenTag: tag,
      scopes: "instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list,pages_read_engagement,ads_management,ads_read,leads_retrieval,business_management",
      status: "CONNECTED",
      createdBy: "bootstrap-script",
    },
    update: {
      accessTokenEncrypted: ciphertext,
      tokenIv: iv,
      tokenTag: tag,
      status: "CONNECTED",
    },
  });
  console.log(`✅ MetaConnection: ${metaConnection.id}`);

  const page = await prisma.page.upsert({
    where: { workspaceId_metaPageId: { workspaceId: workspace.id, metaPageId } },
    create: {
      workspaceId: workspace.id,
      metaConnectionId: metaConnection.id,
      metaPageId,
      name: me.name ?? "نضارة",
      businessId: business.id,
    },
    update: { metaConnectionId: metaConnection.id, businessId: business.id },
  });
  console.log(`✅ Page: ${page.name} (${page.id})`);

  const adAccount = await prisma.adAccount.upsert({
    where: { workspaceId_metaAdAccountId: { workspaceId: workspace.id, metaAdAccountId } },
    create: {
      workspaceId: workspace.id,
      metaConnectionId: metaConnection.id,
      metaAdAccountId,
      name: "نضارة",
      currency: "IQD",
      businessId: business.id,
    },
    update: { metaConnectionId: metaConnection.id, businessId: business.id },
  });
  console.log(`✅ AdAccount: ${adAccount.id} (سيُزامَن Campaigns/Ads/Creatives تلقائيًا عبر AUTO_SYNC_CRON خلال ساعة، أو فورًا عند أول مزامنة يدوية)`);

  const messagingIntegration = await prisma.messagingIntegration.upsert({
    where: { workspaceId: workspace.id },
    create: {
      workspaceId: workspace.id,
      pageId: page.id,
      enabled: true,
      enabledAt: new Date(),
      enabledBy: "bootstrap-script",
    },
    update: { enabled: true, pageId: page.id, enabledAt: new Date(), disabledAt: null },
  });
  console.log(`✅ MessagingIntegration مفعَّل: ${messagingIntegration.id}`);

  console.log("\n== اكتمل التجهيز بنجاح ==");
}

main()
  .catch((err) => {
    console.error("❌ فشل السكربت:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
