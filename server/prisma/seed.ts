import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// بيانات تجريبية فقط لأغراض التطوير والاختبار المحلي — لا تُستخدم أبدًا في الإنتاج
// ولا تحتوي على أي رقم هاتف أو بريد حقيقي قد يصل لعميل فعلي.
const prisma = new PrismaClient();

async function main() {
  const business = await prisma.business.upsert({
    where: { metaBusinessId: "762472333565499" },
    update: {},
    create: { metaBusinessId: "762472333565499", name: "طنين الاذن" },
  });

  const page = await prisma.page.upsert({
    where: { metaPageId: "1126970097176252" },
    update: {},
    create: { metaPageId: "1126970097176252", name: "نضارة الأفضل لكِ", businessId: business.id },
  });

  const adAccount = await prisma.adAccount.upsert({
    where: { metaAdAccountId: "1708235990232230" },
    update: {},
    create: {
      metaAdAccountId: "1708235990232230",
      name: "نضارة",
      currency: "USD",
      businessId: business.id,
    },
  });

  const campaign = await prisma.campaign.upsert({
    where: { metaCampaignId: "test-campaign-1" },
    update: {},
    create: { metaCampaignId: "test-campaign-1", name: "[تجريبي] حملة كريم التفتيح", adAccountId: adAccount.id },
  });

  const adSet = await prisma.adSet.upsert({
    where: { metaAdSetId: "test-adset-1" },
    update: {},
    create: { metaAdSetId: "test-adset-1", name: "[تجريبي] مجموعة نساء 25-45", campaignId: campaign.id },
  });

  const creative1 = await prisma.creative.upsert({
    where: { metaCreativeId: "test-creative-video-1" },
    update: {},
    create: {
      metaCreativeId: "test-creative-video-1",
      videoId: "1000000000001",
      sourceType: "VIDEO",
      thumbnailUrl: "https://example.com/thumb1.jpg",
    },
  });

  const creative2 = await prisma.creative.upsert({
    where: { metaCreativeId: "test-creative-post-1" },
    update: {},
    create: {
      metaCreativeId: "test-creative-post-1",
      postId: "page_123_post_456",
      sourceType: "EXISTING_POST",
    },
  });

  const ad1 = await prisma.ad.upsert({
    where: { metaAdId: "test-ad-1" },
    update: {},
    create: { metaAdId: "test-ad-1", name: "[تجريبي] فيديو - قبل وبعد", adSetId: adSet.id, creativeId: creative1.id },
  });

  const ad2 = await prisma.ad.upsert({
    where: { metaAdId: "test-ad-2" },
    update: {},
    create: { metaAdId: "test-ad-2", name: "[تجريبي] منشور موجود", adSetId: adSet.id, creativeId: creative2.id },
  });

  const leadsData = [
    { metaLeadId: "test-lead-1", name: "زينب تجريبي", phone: "07701234567", status: "تم تقديم الطلب", orderValue: 25000, adId: ad1.id },
    { metaLeadId: "test-lead-2", name: "مريم تجريبي", phone: "07801234567", status: "جديد", adId: ad1.id },
    { metaLeadId: "test-lead-3", name: "سارة تجريبي", phone: "07901234567", status: "تم تقديم الطلب", orderValue: 30000, adId: ad2.id },
    { metaLeadId: "test-lead-4", name: "زينب تجريبي", phone: "07701234567", status: "جديد", adId: ad1.id }, // تكرار متعمد لاختبار Dedup
  ];

  for (const l of leadsData) {
    const normalizedPhone = "+964" + l.phone.slice(1);
    await prisma.lead.upsert({
      where: { metaLeadId: l.metaLeadId },
      update: {},
      create: {
        metaLeadId: l.metaLeadId,
        name: l.name,
        phone: l.phone,
        normalizedPhone,
        status: l.status,
        orderValue: l.orderValue,
        submittedOrderAt: l.status === "تم تقديم الطلب" ? new Date() : null,
        pageId: page.id,
        campaignId: campaign.id,
        adSetId: adSet.id,
        adId: l.adId,
        isDuplicate: l.metaLeadId === "test-lead-4",
        duplicateOfId: l.metaLeadId === "test-lead-4" ? undefined : undefined,
        duplicateReason: l.metaLeadId === "test-lead-4" ? "نفس رقم الهاتف الموحّد (بيانات تجريبية)" : null,
      },
    });
  }

  const adminPassword = "ChangeMe123!";
  await prisma.adminUser.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "admin",
    },
  });

  console.log("تم تجهيز بيانات تجريبية بنجاح.");
  console.log("دخول لوحة التحكم التجريبي: admin@example.com / ChangeMe123! (غيّره فورًا في الإنتاج)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
