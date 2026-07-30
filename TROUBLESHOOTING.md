# حل المشاكل الشائعة (TROUBLESHOOTING)

## الخادم لا يعمل / يتعطل عند الإقلاع

- **`Environment variable not found: DATABASE_URL`**: تأكد من وجود ملف `.env` في **كل من**
  جذر المشروع **و**`server/` (Prisma CLI يبحث في مجلد `schema.prisma` تحديدًا). انسخ:
  `cp .env server/.env`
- **`secretOrPrivateKey must have a value`**: `JWT_SECRET` فارغ في `.env`. ولّد قيمة عشوائية:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` وضعها في كل من
  `.env` و`server/.env`.

## Webhook Verification يفشل (403) من لوحة Meta

- تأكد أن `META_WEBHOOK_VERIFY_TOKEN` في `.env` مطابق تمامًا لما أدخلته في حقل Verify Token
  بلوحة Meta (حساس لحالة الأحرف والمسافات).
- تأكد أن رابط Callback URL يشير فعليًا إلى `/webhook/meta/leads` (وليس فقط الجذر).

## Webhook يصل لكن لا يُخزَّن العميل

- تحقق من صفحة الإعدادات → "آخر Webhook مستلم"، وتحقق من الحالة (`PROCESSED`/`FAILED`).
- إن كانت `FAILED`، راجع `errorMessage` في جدول `WebhookEvent` — الأسباب الشائعة:
  - `META_PAGE_ACCESS_TOKEN` منتهي أو غير صالح لهذه الصفحة تحديدًا.
  - الصلاحية `leads_retrieval` غير مفعّلة على التطبيق/المستخدم.

## توقيع Webhook غير صالح (401)

- تأكد أن `META_APP_SECRET` في `.env` مطابق للقيمة الفعلية في App Dashboard → Settings → Basic.
- في وضع التطوير المحلي بدون App Secret حقيقي، اترك `META_APP_SECRET` فارغًا مؤقتًا (يتخطى
  النظام التحقق مع تحذير في السجل) — **غير آمن للإنتاج إطلاقًا**.

## Access Token منتهي الصلاحية

Page Access Token طويل الأمد يبقى صالحًا طالما بقي User Token الأصلي صالحًا ولم يُلغَ الإذن.
لتجديده: كرر خطوة 4 في [SETUP_AR.md](./SETUP_AR.md#4-الحصول-على-page-access-token-الطريقة-الرسمية)
لتوليد رمز جديد، وحدّث `META_PAGE_ACCESS_TOKEN` في `.env` ثم أعد تشغيل الخادم.

## Insights لا تظهر أو تظهر صفرًا

- Meta تؤخر بيانات Insights أحيانًا حتى 24-48 ساعة. مهمة المزامنة (`npm run sync:meta`) تسحب
  آخر 3 أيام في كل مرة لتعويض ذلك تلقائيًا.
- تحقق أن `META_AD_ACCOUNT_ID` في `.env` يطابق الحساب الصحيح (بدون بادئة `act_`).

## Google Sheets: "ملف Service Account غير موجود"

تأكد أن `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` يشير لمسار صحيح وموجود فعليًا على القرص، وأن الملف
لم يُستثنَ بالخطأ عبر `.gitignore` عند النشر (يجب رفعه يدويًا لبيئة الإنتاج، وليس عبر git).

## اختبارات Vitest تفشل بسبب قاعدة بيانات غير متزامنة

```bash
cd server
npx dotenv -e .env.test -- prisma db push --skip-generate --accept-data-loss
npm test
```

## منفذ (Port) مستخدم مسبقًا

Windows: `Get-NetTCPConnection -LocalPort 4000 | Stop-Process -Id {OwningProcess} -Force`
عبر PowerShell، أو غيّر `PORT` في `.env`.
