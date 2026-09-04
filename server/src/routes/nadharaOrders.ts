import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { appendOrderToCsv, priceForQuantity, sendOrderToTelegram } from "../services/telegramOrders.js";

// نقطة نهاية عامة بلا مصادقة لاستقبال طلبات نموذج صفحة هبوط نضارة (web/app/page.tsx).
// مستقلة تمامًا عن مخطط Lead/Order متعدد المستأجرين - راجع services/telegramOrders.ts.
export const nadharaOrdersRouter = Router();

const orderSchema = z.object({
  name: z.string().trim().min(2, "الاسم قصير جدًا").max(100),
  phone: z.string().trim().min(7, "رقم الهاتف غير صحيح").max(20),
  city: z.string().trim().min(2, "الرجاء تحديد المحافظة/المدينة").max(100),
  address: z.string().trim().min(5, "الرجاء كتابة العنوان بالتفصيل").max(500),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  notes: z.string().trim().max(500).optional(),
  // fbp/fbc: كوكيز بكسل Meta (من متصفح الزائر) - تُستخدم لاحقًا لتحسين جودة مطابقة حدث
  // Purchase عند تأكيد الطلب (راجع services/metaPixelEvents.ts)
  fbp: z.string().trim().max(200).optional(),
  fbc: z.string().trim().max(200).optional(),
  // حقل فخ (honeypot) مخفي بالواجهة - لا قيد بنية عليه هنا حتى لا يظهر كخطأ تحقق للمستخدم؛
  // القيمة تُفحص يدويًا بالأسفل: إن امتلأ فهذا سلوك بوت سبام فنرد نجاحًا صوريًا بصمت
  website: z.string().max(500).optional(),
});

nadharaOrdersRouter.post("/", async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" });
  }

  const { website, fbp, fbc, ...order } = parsed.data;
  if (website) {
    // سبام واضح (حقل الفخ ممتلئ) - رد نجاح صوري بدون أي معالجة فعلية
    return res.json({ ok: true });
  }

  const record = {
    ...order,
    orderId: crypto.randomUUID(),
    price: priceForQuantity(order.quantity),
    receivedAt: new Date(),
    fbp,
    fbc,
    clientIp: req.ip,
    userAgent: req.headers["user-agent"],
  };

  try {
    appendOrderToCsv(record);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "فشل حفظ طلب نضارة في ملف CSV");
  }

  sendOrderToTelegram(record).catch((err) =>
    logger.error({ err: (err as Error).message }, "فشل إرسال طلب نضارة عبر Telegram"),
  );

  logger.info({ orderId: record.orderId, phone: record.phone, city: record.city }, "طلب نضارة جديد");
  res.json({ ok: true });
});
