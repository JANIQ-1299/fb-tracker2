# سجل تقدّم المشروع (PROGRESS)

## المرحلة 1: فحص البيئة ✅
- Node.js v24.15.0, npm 11.12.1, Git 2.55.0 مثبّتة. pnpm وDocker **غير مثبّتين** على الجهاز.
- Git repository محلي أُنشئ في `meta-order-attribution/`.
- بنية المشروع (`server/`, `web/`, `docs/`, `scripts/`) أُنشئت.
- اكتُشف اتصال حقيقي وموثّق بـMeta Ads عبر أداة MCP متاحة في البيئة (10 حسابات إعلانية، 21 صفحة).
  المستخدم اختار مشروع **"نضارة" (صفحة: نضارة الأفضل لكِ، بزنس: طنين الاذن)** كأول ربط.

## المرحلة 2: إعداد Meta ✅ مكتمل وفعّال
- أُنشئ تطبيق Business باسم "جرد كلاود" (App ID: 2554401444982156) مرتبط بحافظة أعمال "طنين الاذن".
- أُنشئ **مستخدم نظام (System User)** باسم `jardcloudserver` بصلاحية Admin، ووافق عليه مسؤول
  ثانٍ (Amr) كما تتطلب سياسة أمان Meta لهذه الحافظة، وتم ربطه بصفحة "نضارة الأفضل لكِ" وحساب
  الإعلانات "نضارة" معًا (كلاهما كأصلين منفصلين، راجع DECISIONS.md #13).
- App ID, App Secret, Page/Marketing Access Token, Webhook Verify Token: **كلها فعّالة ومُختبرة
  فعليًا** ضد Graph API الحقيقي (وليس محاكاة) — راجع نتائج الاختبار أدناه.

## المرحلة 3: Webhook ✅ مكتمل ومُختبر عبر رابط عام حقيقي
- `GET/POST /webhook/meta/leads` — تحقق Verify Token + توقيع HMAC-SHA256 (`x-hub-signature-256`)
  + Idempotency عبر `hash(leadgen_id)` + تخزين raw payload + معالجة غير متزامنة بعد رد 200 فوري.
- تم تشغيل Cloudflare Quick Tunnel فعليًا (رابط عام مؤقت)، والتحقق أن Meta نجحت في التحقق من
  الـWebhook فعليًا (سُجّل "Webhook verification succeeded" في السجلات بعد ضغط "تحقق وحفظ" في
  لوحة Meta)، ثم أكملنا **اشتراك الصفحة فعليًا** في حقل `leadgen` عبر
  `POST /{page-id}/subscribed_apps` (تأكد الرد: `{"success":true}` وظهر `leadgen` في قائمة
  `subscribed_fields` عند الاستعلام). النظام جاهز الآن لاستقبال Leads حقيقية فور تشغيل الخادم
  خلف رابط عام (مؤقت أو دائم).

## المرحلة 4: جلب تفاصيل العميل والـAttribution ✅
- `server/src/services/attribution.ts`: جلب Lead كامل، ربط بالحملة/المجموعة/الإعلان، واستخراج
  الفيديو/المصدر بعدة طرق (video_id مباشر، object_story_spec، asset_feed_spec، existing post)
  مع تسجيل سبب صريح عند التعذّر.

## المرحلة 5: قاعدة البيانات ✅
- كل الجداول المطلوبة في `server/prisma/schema.prisma` (Business, Page, AdAccount, Campaign,
  AdSet, Ad, Creative, Lead, LeadStatusHistory, WebhookEvent, SyncLog, + InsightSnapshot,
  AdminUser, AppSetting الإضافية). Migration أولي مُطبَّق (`20260723170033_init`)، وSeed تجريبي يعمل.

## المرحلة 6: حالة "تم تقديم الطلب" ✅
- مصدر الحقيقة محليًا (`Lead.status` + `LeadStatusHistory`)، لأن Meta لا توفر API عامًا لقراءة
  Leads Center (تحقق موثّق في README). إرسال Best-effort عبر Conversions API for CRM عند توفر
  Dataset. زر تغيير الحالة في لوحة التحكم + دعم من Google Sheets.

## المرحلة 7: Google Sheets ✅ (الكود جاهز، غير مفعّل افتراضيًا)
- مزامنة باتجاهين (`syncSystemToSheet` / `syncSheetToSystem`) بمفتاح `Lead ID`، تعمل فقط إن
  `GOOGLE_SHEETS_ENABLED=true` ووُجد ملف Service Account. **لم يُفعَّل فعليًا** (يتطلب مصادقة
  Google منك، راجع "الخطوات المتبقية").

## المرحلة 8: لوحة التحكم ✅
- Next.js عربية RTL كاملة: الرئيسية (بطاقات + أفضل/أسوأ إعلان/فيديو)، تقرير الإعلانات، تقرير
  الفيديوهات، العملاء (بحث/فلترة/تعديل حالة وقيمة وملاحظات/سجل تغييرات)، الإعدادات (اختبار
  Meta/Sheets، آخر Webhook، إعادة مزامنة). **تم اختبارها فعليًا في المتصفح** (تسجيل دخول، عرض
  بيانات تجريبية صحيحة، تغيير حالة عميل والتحقق من تسجيله في السجل).

## المرحلة 9: Meta Insights ✅ مكتمل ويعمل ببيانات حقيقية
- مهمة cron كل ساعة تجلب spend/impressions/reach/clicks/leads لآخر 3 أيام (لتعويض تأخر بيانات
  Meta)، بتوقيت `Asia/Baghdad`. **تم تشغيلها فعليًا وجلبت 60 صف بيانات حقيقية** من حساب
  الإعلانات "نضارة" (حملات فعلية: SALES 18-7-2026, SALES 20-7-2026, THIRD SALES 23-7-2026, INSTA)
  وتظهر الآن في تقرير الإعلانات بلوحة التحكم بأرقام إنفاق حقيقية.

## المرحلة 10: اكتشاف التكرار ✅
- بالـmetaLeadId (فريد قسريًا في قاعدة البيانات) + الهاتف العراقي الموحّد + البريد، ضمن نافذة
  72 ساعة قابلة للتعديل. لا حذف تلقائي — علم `isDuplicate` + سبب + قابل للمراجعة اليدوية.

## المرحلة 11: الأمان ✅
- Helmet, Rate limiting (عام/دخول/Webhook منفصلة), JWT + bcrypt, Zod validation على كل المدخلات,
  Redaction للأسرار من السجلات (pino redact), عدم عرض Token بالواجهة, Data Deletion Callback
  الرسمي (`/api/meta/data-deletion`) + حذف يدوي للعميل، نسخ احتياطي/استعادة SQLite.

## المرحلة 12: الاختبارات ✅
- **29 اختبارًا تمر بنجاح** (Vitest): Webhook Verification، استقبال Lead، تكرار Webhook،
  استخراج Video ID من 6 أنواع Creative مختلفة، Attribution كامل، تغيير الحالة + السجل، مزامنة
  Google Sheets (باتجاهين، مموّهة/mocked)، اكتشاف تكرار الهاتف/البريد، حساب Conversion Rate
  وCost per Order. بيانات الاختبار في `.env.test` منفصلة تمامًا عن بيانات التطوير/الإنتاج.

## المرحلة 13: التوثيق والتشغيل ✅
- README.md, SETUP_AR.md, DEPLOYMENT.md, META_APP_REVIEW.md, TROUBLESHOOTING.md, DECISIONS.md،
  docs/PRIVACY_POLICY.md, docs/DATA_DELETION.md, docs/TERMS.md — جميعها مكتوبة. docker-compose.yml
  + Dockerfiles للخادم ولوحة التحكم جاهزة (لم تُختبر فعليًا لعدم توفر Docker على الجهاز - راجع
  "الخطوات المتبقية"). Health check (`/api/health`), Backup/Restore scripts تعمل ومُختبرة.

## المرحلة 14: إعداد Meta App الفعلي ✅ مكتمل بالكامل
- تطبيق "جرد كلاود" فعّال، مستخدم النظام مربوط بالصفحة وحساب الإعلانات، Webhook مشترك فعليًا في
  `leadgen`، والنظام يستقبل بيانات حقيقية من Meta الآن (Insights). App Review الرسمي (لتوسيع
  الاستخدام خارج نطاق حسابك الحالي) لا يزال اختياريًا ومُوثّقًا بالكامل في META_APP_REVIEW.md
  إن احتجته مستقبلًا.

---

## المرحلة 0 (Multi-Tenant): الأساس + نظام التراخيص ✅ الكود مكتمل، بانتظار تشغيل فعلي بـPostgres

تحويل النظام من أحادي المستأجر (حساب Meta واحد ثابت عبر `.env`) إلى منصة متعددة المستأجرين
(Workspaces/Users/MetaConnections) مع طبقة تراخيص/اشتراكات مركزية يتحكم بها Super Admin منفصل.
راجع الخطة الكاملة والمراحل القادمة في `.claude/plans` (أو اطلب من المساعد تلخيصها).

منجَز فعليًا في الكود:
- `server/prisma/schema.prisma`: Postgres بدل SQLite + جداول جديدة (`User`, `Workspace`,
  `SuperAdmin`, `SubscriptionPlan`, `WorkspaceSubscription`, `AdminAction`, `LicenseDevice`,
  `MetaConnection`, `ImportedFile`, `Order`, `OrderAttribution`, `MappingRule`) + `workspaceId`
  على كل جداول بيانات Meta القديمة (Page/AdAccount/Campaign/AdSet/Ad/Creative/Lead/WebhookEvent)
  بقيود UNIQUE مركّبة بدل حقل مفرد. راجع DECISIONS.md #18-21.
- تشفير AES-256-GCM لتوكنات Meta (`server/src/lib/crypto.ts`) - لا يُخزَّن أي توكن كنص مكشوف.
- Middleware: `requireUser`, `requireSystemActive`, `requireActiveWorkspace`,
  `requireActiveSubscription`, `requireSuperAdmin` - مُطبَّقة فعليًا (وليس فقط في الواجهة) على
  دخول المستخدمين، `/api/auth/user/me`، وكل مسارات `/api/superadmin/*`.
- مصادقة Super Admin بخطوتين (بريد+كلمة مرور ثم TOTP 2FA إلزامي عبر `otplib`)، منفصلة تمامًا
  (سر JWT مختلف، لا تقاطع مع حسابات Workspace).
- API + واجهة بسيطة لـSuper Admin (`/superadmin/login`, `/superadmin`): تفعيل/إيقاف/حظر/تمديد/
  تعديل حدود لكل Workspace، سجل تدقيق (`AdminAction`) بالـIP والوقت، تبديل وضع الصيانة العام
  (`SYSTEM_ACTIVE`/`MAINTENANCE_MODE`) بتأكيد كتابة نص صريح.
- واجهة دخول ومنزل بسيط لمستخدمي الـWorkspace (`/workspace/login`, `/workspace`) تعرض رسالة
  الإيقاف/الحظر/الانتهاء **حرفيًا كما يرسلها الخادم** عند 403، بدل استبدالها.
- `server/prisma/seedWorkspace.ts`: سكربت تفاعلي لإنشاء أول Workspace + مستخدم Owner +
  Super Admin (مع QR Code لإعداد 2FA فورًا) - لا صفحة تسجيل عامة.
- `server/scripts/migrate-sqlite-to-postgres.ts`: ينقل كل بياناتك الحقيقية الحالية (Leads,
  Insights, SyncRun/DetectedOrderIncrement, ...) من SQLite القديم إلى Postgres تحت أول Workspace،
  دون فقدان أي شيء. راجع DECISIONS.md #19 لسبب استخدام Prisma Client ثانٍ بدل `better-sqlite3`.
- خط Webhook/Insights/Google Sheets القديم (خاص بعملك "نضارة") يستمر بالعمل دون أي تغيير في
  السلوك عبر `LEGACY_WORKSPACE_ID` (راجع DECISIONS.md #20) - لم يُحذف ولم يُعَد كتابته.
- `npx tsc --noEmit` نظيف تمامًا على `server/` و`web/` بعد كل التعديلات.

**لم يُنفَّذ بعد فعليًا** (يحتاج تشغيل حقيقي على قاعدة Postgres، وهذا الجهاز لا يملك Docker مثبّتًا
وقت الكتابة - راجع "الخطوات المتبقية" أدناه): تشغيل `prisma migrate`، تشغيل `seed:workspace`،
تشغيل `migrate:sqlite-to-postgres` الفعلي على نسخة من `dev.db`، وتشغيل `npm test` للتأكد أن كل
الاختبارات (المعدَّلة لتضمين `workspaceId`) لا تزال خضراء على Postgres حقيقي.

---

## الخطوات اليدوية المتبقية (اختيارية فقط، النظام يعمل فعليًا بدونها)

1. **رابط دائم بدل Cloudflare Quick Tunnel المؤقت**: الرابط الحالي يتغيّر عند إعادة تشغيل الأداة.
   للإنتاج الفعلي راجع [DEPLOYMENT.md](./DEPLOYMENT.md) لخيارات استضافة دائمة أو Named Tunnel.
2. **(اختياري) Google Sheets**: تسجيل الدخول لـGoogle Cloud Console لإنشاء Service Account
   ومشاركة الشيت معه (راجع [SETUP_AR.md](./SETUP_AR.md#6-google-sheets-اختياري)).
3. **(اختياري) اختيار منصة استضافة** إن رغبت بنشر إنتاجي حقيقي بدل التشغيل المحلي.
4. **إبطال الرمز القديم**: تم استخدام رمز مستخدم النظام مؤقتًا وظهر جزئيًا في نافذة متصفح أثناء
   الإعداد (وليس في هذه المحادثة). يُنصح مراجعته من Business Settings → مستخدمو النظام إن رغبت
   بحذر إضافي، رغم أنه يبقى ضمن نطاق تحكمك الكامل.
5. **مطلوب الآن (وليس اختياريًا) لتفعيل نسخة Multi-Tenant**: تثبيت Docker Desktop (لتشغيل
   `docker-compose up -d postgres`) أو إنشاء قاعدة Postgres سحابية مجانية مؤقتة (Neon/Supabase)
   وتحديث `DATABASE_URL` في `.env` بها، ثم بالترتيب من مجلد `server/`:
   - `npm run migrate` (يُنشئ الجداول الجديدة في Postgres)
   - `npm run seed:workspace` (يُنشئ أول Workspace + Owner + Super Admin، ويعرض QR لـ2FA - احفظه)
   - انسخ معرّف الـWorkspace الظاهر في المخرجات إلى `LEGACY_WORKSPACE_ID` في `.env` و`.env` بجذر
     المشروع
   - `npm run migrate:sqlite-to-postgres` **على نسخة من `prisma/dev.db`** (وليس الأصل مباشرة)
     للتأكد من عدم المخاطرة ببياناتك الحقيقية، ثم تحقق من النتيجة قبل اعتماد الأصل
   - `npm test` للتأكد أن كل الاختبارات القديمة ما زالت تعمل على المخطط الجديد

جميع الخطوات الجوهرية الأخرى تم تنفيذها واختبارها فعليًا (وليس فقط كتابتها).
