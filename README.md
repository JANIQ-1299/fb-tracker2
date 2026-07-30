# نظام تتبع الطلبات من إعلانات Meta (meta-order-attribution)

نظام يربط صفحة Facebook، حساب Instagram، حساب الإعلانات، وحملات Lead Ads معًا، لمعرفة
**كل إعلان أو فيديو كم عميل محتمل جلب، وكم طلبًا مكتملًا جلب**، مع حساب نسبة التحويل وتكلفة
الطلب (CPA) وتكلفة العميل المحتمل (CPL).

## البنية

```
Meta Lead Ads / Instagram / Facebook
   → Webhook (server/src/routes/webhook.ts)
   → جلب تفاصيل العميل (server/src/services/attribution.ts)
   → معرفة الحملة/المجموعة الإعلانية/الإعلان/الفيديو
   → تخزين البيانات (Prisma + SQLite/PostgreSQL)
   → تحديد حالة العميل ("تم تقديم الطلب" وغيرها)
   → حساب الطلبات لكل إعلان وفيديو (server/src/routes/reports.ts)
   → لوحة تحكم عربية (web/ - Next.js)
   → مزامنة اختيارية مع Google Sheets
   → إرسال إشارة الجودة إلى Meta عبر Conversions API for CRM (best-effort)
```

| الطبقة | التقنية |
|---|---|
| API الخلفي | Node.js + TypeScript + Express |
| قاعدة البيانات | Prisma ORM — SQLite محليًا، PostgreSQL في الإنتاج |
| لوحة التحكم | Next.js (App Router) + React، عربية RTL بالكامل |
| الجدولة | node-cron (Insights كل ساعة، Google Sheets كل 15 دقيقة) |
| الاختبارات | Vitest + Supertest |
| الحاويات | Docker + Docker Compose |

## البدء السريع (محليًا)

```bash
npm install
cp .env.example .env   # ثم عدّل القيم الفعلية
npm run migrate
npm run seed            # بيانات تجريبية فقط
npm run dev:server      # http://localhost:4000
npm run dev:web         # http://localhost:3000
```

دخول تجريبي للوحة التحكم بعد `npm run seed`: `admin@example.com` / `ChangeMe123!` — **غيّره فورًا**.

راجع [SETUP_AR.md](./SETUP_AR.md) للتفاصيل الكاملة، و[DEPLOYMENT.md](./DEPLOYMENT.md) للنشر،
و[TROUBLESHOOTING.md](./TROUBLESHOOTING.md) عند المشاكل.

## أوامر التشغيل

| الأمر | الوصف |
|---|---|
| `npm run dev:server` | تشغيل الخادم في وضع التطوير (tsx watch) |
| `npm run dev:web` | تشغيل لوحة التحكم في وضع التطوير |
| `npm run build:server` / `npm run build:web` | بناء نسخة الإنتاج |
| `npm run start:server` / `npm run start:web` | تشغيل نسخة الإنتاج المبنية |
| `npm run migrate` | تطبيق Prisma migrations (تفاعلي، للتطوير) |
| `npm run seed` | تعبئة بيانات تجريبية (لا تستخدمها في الإنتاج) |
| `npm test` | تشغيل جميع اختبارات الخادم (Vitest) |
| `npm run sync:meta` | تشغيل مزامنة Meta Insights مرة واحدة يدويًا |
| `npm run sync:sheets` | تشغيل مزامنة Google Sheets مرة واحدة يدويًا |
| `npm run backup` | نسخة احتياطية فورية لقاعدة SQLite المحلية |
| `npm run restore -- <filename>` | استعادة نسخة احتياطية (راجع مجلد `backups/`) |

## حالة العميل: الفرق بين ثلاثة مفاهيم مهمة

هذا التمييز ضروري لفهم النظام بشكل صحيح:

1. **حالة Meta الداخلية (Leads Center Stage)** — الحالة التي قد يراها معلن داخل واجهة
   Meta Leads Center (مثل "جديد"، "تم التواصل"...). **Meta لا توفر حاليًا Graph API عامًا لقراءة
   هذه الحالة برمجيًا**. لذلك هذا النظام **لا** يقرأ حالة Leads Center ولا يدّعي ذلك.
2. **حالة النظام المحلي (مصدر الحقيقة هنا)** — حقل `status` في جدول `Lead` بقاعدة بياناتنا،
   بما فيها الحالة العربية `"تم تقديم الطلب"`. هذه الحالة تُدار بالكامل من لوحة التحكم أو
   Google Sheets، ولها سجل تغييرات كامل في `LeadStatusHistory`.
3. **أحداث Conversions API for CRM** — عندما يتحوّل عميل إلى `"تم تقديم الطلب"`، يحاول النظام
   *إرسال* (وليس قراءة) إشارة جودة مجهولة ومشفّرة إلى Meta عبر
   [Conversion Leads Integration](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration)
   الرسمية، لتحسين استهداف الحملة مستقبلًا. هذا **إرسال فقط (write-only)** ولا علاقة له بالقراءة
   من Leads Center. يتطلب `META_CONVERSIONS_DATASET_ID` مُهيّأ من Events Manager؛ إن لم يكن
   متوفرًا يسجّل النظام السبب ويستمر بدون توقف (best-effort، غير حرج لعمل النظام).

## استخراج الفيديو/المصدر من الإعلانات المختلفة

Meta لا تخزّن معرّف الفيديو في مكان واحد ثابت. `server/src/services/attribution.ts` يجرّب
بالترتيب: `creative.video_id` المباشر ← `object_story_spec.video_data.video_id` (Reels/Story) ←
`asset_feed_spec.videos[]` (Dynamic Creative/Asset Feed) ← `effective_object_story_id` (منشور
موجود). عند تعذّر التحديد يُخزَّن **سبب واضح** في `extractionNote` بدل ترك الحقل فارغًا بصمت.

## القيود الحالية المفروضة من Meta

- لا يوجد API عام لقراءة حالة Leads Center (موضّح أعلاه).
- Conversions API for CRM يتطلب Dataset مُفعّل من Events Manager، وقد يحتاج التطبيق لمراجعة
  Meta (App Review) قبل الحصول على Advanced Access لصلاحيات `leads_retrieval` و`ads_management`
  على مستوى الإنتاج (راجع [META_APP_REVIEW.md](./META_APP_REVIEW.md)).
- Graph API الحالي (وقت الكتابة): **v25.0**. راجع `META_GRAPH_API_VERSION` في `.env` وحدّثه
  عند صدور نسخة أحدث (Graph API changelog الرسمي).

## الوثائق الأخرى

- [SETUP_AR.md](./SETUP_AR.md) — دليل الإعداد التفصيلي خطوة بخطوة.
- [DEPLOYMENT.md](./DEPLOYMENT.md) — النشر (Docker، PostgreSQL، Tunnel).
- [META_APP_REVIEW.md](./META_APP_REVIEW.md) — تجهيز طلب مراجعة تطبيق Meta.
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — حل المشاكل الشائعة.
- [DECISIONS.md](./DECISIONS.md) — القرارات التقنية وأسبابها.
- [PROGRESS.md](./PROGRESS.md) — سجل تقدّم تنفيذ المشروع.
- [docs/PRIVACY_POLICY.md](./docs/PRIVACY_POLICY.md), [docs/DATA_DELETION.md](./docs/DATA_DELETION.md), [docs/TERMS.md](./docs/TERMS.md) — نماذج قانونية أولية.
