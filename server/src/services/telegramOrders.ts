import fs from "node:fs";
import path from "node:path";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { sendPurchaseEvent } from "./metaPixelEvents.js";

/**
 * طلبات صفحة هبوط نضارة (بكج العناية بالبشرة) - لا علاقة لها بمخطط Lead/Order متعدد المستأجرين
 * في Prisma. هذا مسار مستقل ومبسّط: يُخزَّن كل طلب في CSV محلي (نسخة احتياطية) ويُرسَل فورًا
 * لصاحب المتجر عبر بوت تليجرام، الذي يمكنه أيضًا طلب ملف CSV الكامل لرفعه لشركة التوصيل
 * بإرسال الأمر /export للبوت. راجع routes/nadharaOrders.ts وjobs/telegramBot.ts.
 *
 * كل طلب يوصل تليجرام مع زر "تأكيد الطلب" - الضغط عليه (بعد ما تتأكد صاحبة المتجر من البيع
 * هاتفيًا) يرسل حدث Purchase فعلي لـMeta Conversions API (metaPixelEvents.ts)، حتى تتعلم
 * الحملات الإعلانية تستهدف ناس يشترون فعلاً، مو بس يعبّون الفورم.
 */

const DATA_DIR = path.resolve(process.cwd(), "data");
const CSV_PATH = path.join(DATA_DIR, "nadhara-orders.csv");
const STATE_PATH = path.join(DATA_DIR, "telegram-bot-state.json");
const ORDERS_STORE_PATH = path.join(DATA_DIR, "pending-orders.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface BotState {
  chatId?: number;
  lastUpdateId?: number;
}

function readState(): BotState {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state: BotState) {
  ensureDataDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

interface PendingOrder {
  orderId: string;
  name: string;
  phone: string;
  city: string;
  quantity: number;
  price: number;
  receivedAt: string;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
  confirmed: boolean;
}

function readOrdersStore(): Record<string, PendingOrder> {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(ORDERS_STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeOrdersStore(store: Record<string, PendingOrder>) {
  ensureDataDir();
  fs.writeFileSync(ORDERS_STORE_PATH, JSON.stringify(store, null, 2));
}

// الباقة الوحيدة المعروضة بالفورم: بكج واحد (33,000) أو ٣ بكجات بسعر بكجين (65,000)
export function priceForQuantity(quantity: number): number {
  if (quantity === 1) return 33_000;
  if (quantity === 3) return 65_000;
  return quantity * 33_000;
}

export interface NadharaOrder {
  orderId: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  quantity: number;
  price: number;
  notes?: string;
  receivedAt: Date;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
}

// يمنع CSV Injection (صيغة =/+/-/@ تُفسَّر كصيغة تنفيذية عند فتح الملف في Excel)
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function appendOrderToCsv(order: NadharaOrder) {
  ensureDataDir();
  const isNew = !fs.existsSync(CSV_PATH);
  if (isNew) {
    const header = "رقم الطلب,التاريخ,الاسم,الهاتف,المحافظة/المدينة,العنوان بالتفصيل,الكمية,السعر,ملاحظات\n";
    // BOM حتى يعرض Excel الحروف العربية بشكل صحيح مباشرة
    fs.writeFileSync(CSV_PATH, "﻿" + header);
  }
  const row =
    [
      order.orderId,
      order.receivedAt.toISOString(),
      order.name,
      order.phone,
      order.city,
      order.address,
      String(order.quantity),
      String(order.price),
      order.notes ?? "",
    ]
      .map(csvField)
      .join(",") + "\n";
  fs.appendFileSync(CSV_PATH, row);
}

interface TelegramApiResult {
  ok: boolean;
  result?: unknown;
}

async function callTelegram(method: string, body: Record<string, unknown>): Promise<TelegramApiResult | null> {
  if (!env.telegramBotToken) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as TelegramApiResult;
    if (!data.ok) logger.error({ method, data }, "فشل استدعاء Telegram API");
    return data;
  } catch (err) {
    logger.error({ method, err: (err as Error).message }, "خطأ شبكة أثناء استدعاء Telegram API");
    return null;
  }
}

function resolveActiveChatId(state: BotState): number | undefined {
  if (env.telegramChatId) return Number(env.telegramChatId);
  return state.chatId;
}

export async function sendOrderToTelegram(order: NadharaOrder) {
  const state = readState();
  const chatId = resolveActiveChatId(state);
  if (!chatId) {
    logger.warn("لا يوجد Telegram chat مرتبط بعد لاستقبال طلبات نضارة - أرسل /start للبوت أولاً");
    return;
  }
  const text = [
    "🌸 طلب جديد - نضارة",
    `الاسم: ${order.name}`,
    `الهاتف: ${order.phone}`,
    `المحافظة/المدينة: ${order.city}`,
    `العنوان: ${order.address}`,
    `الكمية: ${order.quantity}`,
    `السعر: ${order.price.toLocaleString("en-US")} د.ع`,
    order.notes ? `ملاحظات: ${order.notes}` : null,
    `الوقت: ${order.receivedAt.toLocaleString("ar-IQ", { timeZone: env.tz })}`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [[{ text: "✅ تأكيد الطلب (تم البيع)", callback_data: `confirm:${order.orderId}` }]],
    },
  });

  const messageId = (result?.result as { message_id?: number } | undefined)?.message_id;
  if (!messageId) return;

  const store = readOrdersStore();
  store[order.orderId] = {
    orderId: order.orderId,
    name: order.name,
    phone: order.phone,
    city: order.city,
    quantity: order.quantity,
    price: order.price,
    receivedAt: order.receivedAt.toISOString(),
    fbp: order.fbp,
    fbc: order.fbc,
    clientIp: order.clientIp,
    userAgent: order.userAgent,
    confirmed: false,
  };
  writeOrdersStore(store);
}

export async function sendOrdersCsvToTelegram(chatId: number) {
  if (!env.telegramBotToken) return;
  if (!fs.existsSync(CSV_PATH)) {
    await callTelegram("sendMessage", { chat_id: chatId, text: "لا توجد طلبات مسجّلة بعد." });
    return;
  }
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", "ملف طلبات نضارة - جاهز لرفعه لشركة التوصيل");
    form.append("document", new Blob([fs.readFileSync(CSV_PATH)]), "nadhara-orders.csv");
    const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendDocument`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as TelegramApiResult;
    if (!data.ok) logger.error({ data }, "فشل إرسال ملف الطلبات عبر Telegram");
  } catch (err) {
    logger.error({ err: (err as Error).message }, "خطأ شبكة أثناء إرسال ملف الطلبات عبر Telegram");
  }
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}

async function handleCallbackQuery(cq: NonNullable<TelegramUpdate["callback_query"]>, state: BotState) {
  const activeChatId = resolveActiveChatId(state);
  const chatId = cq.message?.chat?.id;

  if (!cq.data?.startsWith("confirm:") || !chatId || chatId !== activeChatId) {
    await callTelegram("answerCallbackQuery", { callback_query_id: cq.id });
    return;
  }

  const orderId = cq.data.slice("confirm:".length);
  const store = readOrdersStore();
  const order = store[orderId];

  if (!order) {
    await callTelegram("answerCallbackQuery", {
      callback_query_id: cq.id,
      text: "الطلب غير موجود (ربما قديم جدًا)",
      show_alert: true,
    });
    return;
  }
  if (order.confirmed) {
    await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "تم تأكيد هذا الطلب مسبقًا ✅" });
    return;
  }

  const result = await sendPurchaseEvent({
    orderId: order.orderId,
    phone: order.phone,
    value: order.price,
    quantity: order.quantity,
    eventTime: new Date(),
    fbp: order.fbp,
    fbc: order.fbc,
    clientIp: order.clientIp,
    userAgent: order.userAgent,
  });

  order.confirmed = true;
  store[orderId] = order;
  writeOrdersStore(store);

  logger.info({ orderId, sent: result.sent, reason: result.reason }, "تأكيد طلب نضارة + إرسال حدث Purchase لـMeta");

  await callTelegram("answerCallbackQuery", {
    callback_query_id: cq.id,
    text: result.sent ? "✅ تم إرسال حدث الشراء لـMeta" : "⚠️ تعذر الإرسال لـMeta (راجع اللوگ)",
    show_alert: !result.sent,
  });

  if (cq.message) {
    await callTelegram("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: cq.message.message_id,
      reply_markup: {
        inline_keyboard: [[{ text: "✅ تم التأكيد والإرسال لـMeta", callback_data: "noop" }]],
      },
    });
  }
}

export async function pollTelegramUpdates() {
  if (!env.telegramBotToken) return;
  const state = readState();
  const offset = state.lastUpdateId ? state.lastUpdateId + 1 : undefined;
  const data = await callTelegram("getUpdates", {
    offset,
    timeout: 0,
    allowed_updates: ["message", "callback_query"],
  });
  const updates = data?.result as TelegramUpdate[] | undefined;
  if (!data?.ok || !Array.isArray(updates) || updates.length === 0) return;

  for (const update of updates) {
    state.lastUpdateId = update.update_id;

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, state);
      continue;
    }

    const msg = update.message;
    const text: string | undefined = msg?.text;
    const chatId: number | undefined = msg?.chat?.id;
    if (!chatId) continue;

    if (!env.telegramChatId && !state.chatId) {
      state.chatId = chatId;
      logger.info({ chatId }, "تم ربط Telegram chat جديد لاستقبال طلبات نضارة");
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: "تم الربط بنجاح 🌸 سأرسل لك طلبات نضارة هنا فور وصولها.\nأرسل /export في أي وقت لاستلام ملف كل الطلبات لرفعه لشركة التوصيل.",
      });
      continue;
    }

    const activeChatId = resolveActiveChatId(state);
    if (text?.trim() === "/export" && chatId === activeChatId) {
      await sendOrdersCsvToTelegram(chatId);
    }
  }
  writeState(state);
}
