import type { Order } from "@prisma/client";
import { normalizeHeader } from "./importColumns.js";

// عند وجود أكثر من طلب مرشّح بنفس رقم الهاتف لمحادثة واحدة، لا نختار "الأحدث" فقط - نُسجّل نقاطًا
// لكل مرشّح من عدة إشارات (تاريخ الطلب/المحادثة، حالة الطلب، تطابق الإعلان المرجعي، ذكر الاسم أو
// المحافظة داخل نص الرسالة نفسها فقط)، وإن لم يكن هناك فائز واضح نضع النتيجة NEEDS_REVIEW بدل
// الربط التلقائي الخاطئ. لا نقرأ أبدًا نص أي رسالة قديمة غير الرسالة الحالية التي وصلت للتو.

export interface ConversationMatchContext {
  conversationFirstMessageAt: Date;
  matchWindowHours: number;
  messageText?: string | null; // نص الرسالة الجديدة الحالية فقط - وليس أي تاريخ محادثة سابق
  conversationPageId?: string | null;
  referralResolvedAdMetaId?: string | null; // metaAdId للإعلان الذي حُلّ من referral.ad_id
  referralResolvedCampaignMetaId?: string | null;
}

export interface ScoredCandidate {
  orderId: string;
  score: number;
  reasons: string[];
}

export interface CandidateOrderLike extends Pick<Order, "id" | "orderDate" | "orderStatus" | "customerName" | "governorate" | "adIdRaw" | "campaignIdRaw"> {
  attributionPageId?: string | null;
  attributionMatchStatus?: string | null;
}

const CANCELLED_KEYWORDS = ["الغ", "لغي", "مرتجع", "رفض"];

function scoreCandidate(order: CandidateOrderLike, ctx: ConversationMatchContext): ScoredCandidate {
  let score = 0;
  const reasons: string[] = [];

  if (order.orderDate) {
    const diffHours = Math.abs(order.orderDate.getTime() - ctx.conversationFirstMessageAt.getTime()) / 3_600_000;
    if (diffHours <= ctx.matchWindowHours) {
      score += 3;
      reasons.push(`تاريخ الطلب ضمن نافذة المطابقة (${Math.round(diffHours)} ساعة)`);
    } else if (diffHours <= ctx.matchWindowHours * 3) {
      score += 1;
      reasons.push(`تاريخ الطلب قريب نسبيًا (${Math.round(diffHours)} ساعة، خارج النافذة الأساسية)`);
    }
  }

  if (order.orderStatus && !CANCELLED_KEYWORDS.some((k) => order.orderStatus!.includes(k))) {
    score += 1;
    reasons.push("حالة الطلب ليست ملغاة/مرتجعة");
  }

  if (ctx.referralResolvedAdMetaId && order.adIdRaw === ctx.referralResolvedAdMetaId) {
    score += 5;
    reasons.push("الإعلان المرجعي للمحادثة يطابق ad_id المُسجَّل على الطلب");
  } else if (ctx.referralResolvedCampaignMetaId && order.campaignIdRaw === ctx.referralResolvedCampaignMetaId) {
    score += 3;
    reasons.push("حملة الإعلان المرجعي تطابق campaign_id المُسجَّل على الطلب");
  }

  const text = ctx.messageText ? normalizeHeader(ctx.messageText) : "";
  if (text && order.customerName) {
    const name = normalizeHeader(order.customerName);
    if (name.length >= 3 && text.includes(name)) {
      score += 2;
      reasons.push("اسم العميل مذكور في نص الرسالة الجديدة نفسها");
    }
  }
  if (text && order.governorate) {
    const gov = normalizeHeader(order.governorate);
    if (gov.length >= 2 && text.includes(gov)) {
      score += 2;
      reasons.push("المحافظة مذكورة في نص الرسالة الجديدة نفسها");
    }
  }

  if (ctx.conversationPageId && order.attributionPageId && order.attributionPageId === ctx.conversationPageId) {
    score += 1;
    reasons.push("نفس الصفحة مرتبطة مسبقًا بهذا الطلب");
  }

  return { orderId: order.id, score, reasons };
}

export type ConversationOrderMatchResult =
  | { outcome: "MATCHED"; orderId: string; scored: ScoredCandidate[] }
  | { outcome: "NEEDS_REVIEW"; scored: ScoredCandidate[] }
  | { outcome: "NONE"; scored: ScoredCandidate[] };

/** يختار أفضل طلب مرشّح من بين عدة طلبات بنفس رقم الهاتف، أو يضع النتيجة NEEDS_REVIEW عند التعادل.
 * لا يُقصي أبدًا مرشحًا خارج النافذة الزمنية تمامًا - فقط يمنحه نقاطًا أقل، لأن بعض الطلبات تُسجَّل
 * بعد عدة أيام من بداية المحادثة (راجع طلب المستخدم). لا يُعيد أبدًا مرشحًا مطابَقًا يدويًا (MANUAL). */
export function pickBestOrderCandidate(
  candidates: CandidateOrderLike[],
  ctx: ConversationMatchContext,
): ConversationOrderMatchResult {
  const eligible = candidates.filter((c) => c.attributionMatchStatus !== "MANUAL");
  if (eligible.length === 0) return { outcome: "NONE", scored: [] };

  const scored = eligible.map((c) => scoreCandidate(c, ctx)).sort((a, b) => b.score - a.score);

  if (scored.length === 1) {
    return { outcome: "MATCHED", orderId: scored[0].orderId, scored };
  }

  const top = scored[0];
  const second = scored[1];
  const clearWinner = top.score > 0 && top.score - second.score >= 2;

  if (clearWinner) {
    return { outcome: "MATCHED", orderId: top.orderId, scored };
  }
  return { outcome: "NEEDS_REVIEW", scored };
}
