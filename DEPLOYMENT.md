# النشر (DEPLOYMENT)

## الخيار أ: تشغيل محلي + Tunnel للاختبار

مناسب لاختبار Webhook قبل النشر النهائي. Meta تتطلب رابط HTTPS عام لاستقبال الأحداث؛ رابط
Tunnel **مؤقت للاختبار فقط وليس حلًا نهائيًا للإنتاج** كما هو موضّح في متطلبات المشروع.

```bash
npm run dev:server   # يشغّل الخادم على http://localhost:4000
```

في نافذة طرفية أخرى، استخدم أي أداة Tunnel آمنة متوفرة لديك (مثل `ssh -R` عبر خادم تملكه، أو أي
خدمة Tunnel رسمية تثق بها) لتوجيه رابط HTTPS عام إلى `localhost:4000`. ضع الرابط الناتج في
Meta Webhooks كما في [SETUP_AR.md](./SETUP_AR.md#5-إعداد-webhook)، وحدّث أيضًا
`PUBLIC_BASE_URL` في `.env` لاستخدامه في نقاط النهاية التي تولّد روابط (مثل Data Deletion).

> لم يتم تثبيت أو تشغيل أداة Tunnel تلقائيًا في هذه البيئة لأنه قرار يتطلب اختيارك لخدمة موثوقة
> (والموافقة على شروطها). إن رغبت، أخبرني بالأداة التي تفضّلها وسأكمل الإعداد.

## الخيار ب: Docker Compose (خادم + لوحة تحكم + PostgreSQL)

```bash
cp .env.example .env   # عبّئ القيم الفعلية، وأضف POSTGRES_PASSWORD
docker compose build
docker compose up -d
```

يشغّل هذا: `postgres` (منفذ 5432)، `server` (منفذ 4000، يتصل تلقائيًا بـPostgreSQL عبر
`DATABASE_URL` المُركَّب من `POSTGRES_PASSWORD`)، و`web` (منفذ 3000).

بعد أول تشغيل، طبّق Migrations على PostgreSQL:
```bash
docker compose exec server npx prisma migrate deploy
```

## الخيار ج: استضافة سحابية (Render / Railway / VPS)

الخطوات عامة لأي مزوّد يدعم Node.js + PostgreSQL:

1. أنشئ قاعدة بيانات PostgreSQL مُدارة، وانسخ `DATABASE_URL`.
2. انشر `server/` كخدمة Node.js: أمر البناء `npm install && npx prisma generate && npm run build`،
   أمر التشغيل `npm run start`، مع تشغيل `npx prisma migrate deploy` مرة عند أول نشر.
3. انشر `web/` كخدمة Next.js منفصلة، مع `NEXT_PUBLIC_API_BASE_URL` يشير لرابط خدمة `server`.
4. حدّث `PUBLIC_BASE_URL` في متغيرات بيئة `server` إلى النطاق النهائي، واستخدمه في Meta Webhooks
   بدل رابط Tunnel المؤقت.
5. **لم يتم تنفيذ هذا الخيار تلقائيًا لأنه يتطلب تسجيل دخولك لحساب الاستضافة** — إن أردت المتابعة
   أخبرني بالمزوّد الذي تملك حسابًا فيه وسأكمل خطوات النشر معك خطوة بخطوة.

## الانتقال من SQLite إلى PostgreSQL

1. في `server/prisma/schema.prisma` غيّر `provider = "sqlite"` إلى `provider = "postgresql"`.
2. اضبط `DATABASE_URL` في `.env` بصيغة `postgresql://user:pass@host:5432/db?schema=public`.
3. `npx prisma migrate deploy` (لا تستخدم `migrate dev` في الإنتاج).

## النسخ الاحتياطي والاستعادة

- SQLite (تطوير): `npm run backup` ينسخ `server/prisma/dev.db` إلى `backups/`.
  استعادة: `npm run restore -- <اسم-الملف>`.
- PostgreSQL (إنتاج): استخدم `pg_dump`/`pg_restore` القياسية:
  ```bash
  pg_dump "$DATABASE_URL" > backups/prod-$(date +%Y%m%d-%H%M).sql
  psql "$DATABASE_URL" < backups/prod-XXXXXXXX.sql
  ```

## فحص الصحة (Health Check)

`GET /api/health` يعيد `{"status":"ok","db":"connected"}` عند سلامة الاتصال بقاعدة البيانات —
مناسب لإعداد Health Check في أي منصة استضافة أو Load Balancer.
