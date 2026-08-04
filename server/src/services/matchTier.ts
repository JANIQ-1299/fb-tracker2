// تصنيف عرضي (Presentational) رباعي المستويات فوق نتيجة محرك المطابقة الحتمي - لا يُغيّر
// matchStatus/confidence نفسها، فقط يُترجمها لتصنيف مفهوم لصاحب العمل: مؤكد/قوي/تقريبي/غير معروف.
// راجع attributionEngine.ts للمصدر الحقيقي للثقة والحالة.

export type MatchTierKey = "CONFIRMED" | "STRONG" | "APPROXIMATE" | "NEEDS_REVIEW" | "UNKNOWN";

export interface MatchTier {
  key: MatchTierKey;
  label: string;
}

const TIERS: Record<MatchTierKey, MatchTier> = {
  CONFIRMED: { key: "CONFIRMED", label: "مؤكد" },
  STRONG: { key: "STRONG", label: "قوي" },
  APPROXIMATE: { key: "APPROXIMATE", label: "تقريبي" },
  NEEDS_REVIEW: { key: "NEEDS_REVIEW", label: "يحتاج مراجعة" },
  UNKNOWN: { key: "UNKNOWN", label: "غير معروف" },
};

export function getMatchTier(matchStatus: string | null | undefined, confidence: number | null | undefined): MatchTier {
  const c = confidence ?? 0;
  if (matchStatus === "NEEDS_REVIEW") return TIERS.NEEDS_REVIEW;
  if (matchStatus === "EXACT") return TIERS.CONFIRMED;
  if (matchStatus === "MANUAL") return c >= 0.9 ? TIERS.CONFIRMED : TIERS.STRONG;
  if (matchStatus === "PROBABLE") return c >= 0.6 ? TIERS.STRONG : TIERS.APPROXIMATE;
  return TIERS.UNKNOWN; // UNMATCHED أو لا يوجد سجل مطابقة بعد
}
