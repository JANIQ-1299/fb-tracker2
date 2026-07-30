// سكربت تفاعلي لإنشاء أول Workspace + مستخدم Owner + حساب Super Admin (بمصادقة ثنائية).
// لا صفحة تسجيل عامة في هذا النظام - الحسابات تُنشأ يدويًا فقط عبر هذا السكربت (أو لاحقًا من
// لوحة Super Admin نفسها). يمكن تشغيله بشكل غير تفاعلي بتمرير كل القيم عبر متغيرات بيئة:
// SEED_WORKSPACE_NAME, SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD,
// SEED_SUPERADMIN_EMAIL, SEED_SUPERADMIN_PASSWORD
//
// الاستخدام: npm run seed:workspace --workspace=server

import "dotenv/config";
import readline from "node:readline/promises";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import qrcode from "qrcode";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function ask(question: string, envValue?: string): Promise<string> {
  if (envValue) return envValue;
  const answer = await rl.question(question);
  return answer.trim();
}

async function main() {
  console.log("== إنشاء أول Workspace + مستخدم Owner + Super Admin ==\n");

  const workspaceName = await ask("اسم الـWorkspace (اسم عملك/مشروعك): ", process.env.SEED_WORKSPACE_NAME);
  const ownerEmail = await ask("بريد مستخدم Owner (لتسجيل الدخول للوحة التحكم): ", process.env.SEED_OWNER_EMAIL);
  const ownerPassword = await ask("كلمة مرور Owner (لن تُخفى أثناء الكتابة هنا): ", process.env.SEED_OWNER_PASSWORD);
  const superAdminEmail = await ask("بريد Super Admin (منفصل تمامًا عن حساب Owner): ", process.env.SEED_SUPERADMIN_EMAIL);
  const superAdminPassword = await ask("كلمة مرور Super Admin: ", process.env.SEED_SUPERADMIN_PASSWORD);

  if (!workspaceName || !ownerEmail || !ownerPassword || !superAdminEmail || !superAdminPassword) {
    throw new Error("كل الحقول مطلوبة");
  }

  const plan = await prisma.subscriptionPlan.upsert({
    where: { name: "افتراضية" },
    create: { name: "افتراضية", maxPages: 5, maxAdAccounts: 5, maxUsers: 5 },
    update: {},
  });

  const workspace = await prisma.workspace.create({ data: { name: workspaceName } });

  await prisma.workspaceSubscription.create({
    data: {
      workspaceId: workspace.id,
      planId: plan.id,
      status: "ACTIVE",
      maxPages: plan.maxPages,
      maxAdAccounts: plan.maxAdAccounts,
      maxUsers: plan.maxUsers,
      createdBy: "seed-script",
    },
  });

  const ownerPasswordHash = await bcrypt.hash(ownerPassword, 12);
  const owner = await prisma.user.create({
    data: {
      email: ownerEmail,
      passwordHash: ownerPasswordHash,
      role: "OWNER",
      workspaceId: workspace.id,
    },
  });

  const totpSecret = authenticator.generateSecret();
  const superAdminPasswordHash = await bcrypt.hash(superAdminPassword, 12);
  const superAdmin = await prisma.superAdmin.create({
    data: {
      email: superAdminEmail,
      passwordHash: superAdminPasswordHash,
      totpSecret,
    },
  });

  const otpauthUrl = authenticator.keyuri(superAdminEmail, "جرد كلاود - Super Admin", totpSecret);
  const qrTerminal = await qrcode.toString(otpauthUrl, { type: "terminal", small: true });

  console.log("\n✅ تم الإنشاء بنجاح:\n");
  console.log(`Workspace: ${workspace.name} (${workspace.id})`);
  console.log(`Owner: ${owner.email} (${owner.id})`);
  console.log(`Super Admin: ${superAdmin.email} (${superAdmin.id})\n`);

  console.log("امسح رمز QR التالي بتطبيق مصادقة (Google Authenticator/Authy) لإعداد التحقق الثنائي:");
  console.log(qrTerminal);
  console.log(`أو أدخل هذا المفتاح يدويًا: ${totpSecret}`);
  console.log(
    "\n⚠️  احفظ هذا المفتاح في مكان آمن الآن — لن يُعرض مرة أخرى، ولا يمكن تسجيل دخول Super Admin بدونه.",
  );
}

main()
  .catch((err) => {
    console.error("❌ فشل السكربت:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
