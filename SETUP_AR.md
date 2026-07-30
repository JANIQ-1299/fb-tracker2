# دليل الإعداد التفصيلي (SETUP_AR)

## 1. المتطلبات

- Node.js 22 LTS أو أحدث (تم التطوير والاختبار على Node v24)
- npm (مضمّن مع Node) — المشروع يستخدم npm workspaces
- Git
- (اختياري للإنتاج) Docker + Docker Compose
- حساب Meta for Developers + صلاحية Admin على صفحة Facebook وحساب الإعلانات المستهدفين

## 2. التثبيت المحلي

```bash
git clone <رابط-المستودع>   # أو استخدم المجلد الحالي مباشرة
cd meta-order-attribution
npm install
cp .env.example .env
```

افتح `.env` وعبّئ:
- `META_APP_ID`, `META_APP_SECRET` — من لوحة تحكم تطبيقك في Meta for Developers.
- `META_WEBHOOK_VERIFY_TOKEN` — أي نص عشوائي تختاره أنت (استخدمه لاحقًا في إعداد Webhook بلوحة Meta).
- `META_PAGE_ACCESS_TOKEN` — رمز وصول الصفحة (راجع القسم 4).
- `JWT_SECRET` — تم توليده تلقائيًا بالفعل عشوائيًا في `.env` المحلي؛ ولّد قيمة جديدة للإنتاج:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 3. قاعدة البيانات

```bash
npm run migrate     # ينشئ server/prisma/dev.db (SQLite) ويطبّق كل الجداول
npm run seed        # بيانات تجريبية فقط - لا تستخدمها كبيانات حقيقية
```

## 4. الحصول على Page Access Token (الطريقة الرسمية)

1. من [Meta for Developers](https://developers.facebook.com/apps) افتح تطبيقك (Business type).
2. أضف منتج **Facebook Login for Business** إن لم يكن مضافًا.
3. استخدم [Graph API Explorer](https://developers.facebook.com/tools/explorer/) أو تدفّق OAuth
   لتوليد **User Access Token** بصلاحيات: `pages_show_list`, `pages_read_engagement`,
   `pages_manage_metadata`, `leads_retrieval`, `ads_read` (تحقق من التوثيق الرسمي لأي تحديث في
   أسماء الصلاحيات قبل الاعتماد عليها: https://developers.facebook.com/docs/permissions/reference).
4. بدّل User Token برمز الصفحة طويل الأمد عبر:
   `GET /me/accounts?access_token=<USER_TOKEN>` — انسخ `access_token` الخاص بصفحتك.
5. ضع الرمز في `META_PAGE_ACCESS_TOKEN` داخل `.env` (لا تشاركه أبدًا ولا ترفعه لـ git).

## 5. إعداد Webhook

راجع [DEPLOYMENT.md](./DEPLOYMENT.md) قسم "Tunnel للاختبار المحلي" أولًا للحصول على رابط HTTPS
عام يشير إلى `http://localhost:4000`. ثم في لوحة تحكم تطبيق Meta:

1. Products → Webhooks → Page → Subscribe.
2. Callback URL: `https://<رابط-التنل-أو-النطاق>/webhook/meta/leads`
3. Verify Token: نفس قيمة `META_WEBHOOK_VERIFY_TOKEN` في `.env`.
4. اشترك في حقل `leadgen` تحت كائن Page.

## 6. Google Sheets (اختياري)

1. أنشئ Google Cloud Project → فعّل Google Sheets API.
2. أنشئ Service Account → حمّل مفتاح JSON → احفظه خارج git (مثلًا `secrets/google-service-account.json`).
3. شارك Google Sheet المستهدف مع بريد الـService Account (كـ Editor).
4. في `.env`: `GOOGLE_SHEETS_ENABLED=true`, `GOOGLE_SHEET_ID=<معرّف الشيت من الرابط>`,
   `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./secrets/google-service-account.json`.

## 7. تشغيل الخادم ولوحة التحكم

```bash
npm run dev:server   # http://localhost:4000
npm run dev:web      # http://localhost:3000
```

سجّل الدخول بحساب Admin المُنشأ عبر `npm run seed` (`admin@example.com` / `ChangeMe123!`)
ثم غيّر كلمة المرور فورًا من الإنتاج، أو أنشئ Admin جديد مباشرة في قاعدة البيانات باستخدام
`bcryptjs` لتشفير كلمة المرور.

## 8. التحقق من نجاح الإعداد

- صفحة الإعدادات → "اختبار اتصال Meta" يجب أن تُظهر ✅.
- أرسل Lead تجريبي (عبر Meta Lead Ads Testing Tool أو نموذج حقيقي) وتحقق من ظهوره في صفحة العملاء.
- `npm test` يجب أن تنجح جميع الاختبارات (29 اختبارًا وقت كتابة هذا الدليل).
