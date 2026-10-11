import type { FeedingFeedType } from "@/lib/api";

export function formatNumber(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "NaN";
}

export function roundFeedKg(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatFeedKg(value: string | number): string {
  return Number(value).toFixed(1);
}

// `name` is the current shape. Feedings saved before the catalogs merged carry
// `brand` and `type` instead, and the current shape leaves those null.
export function formatFeedTypeName(feedType: Pick<FeedingFeedType, "name" | "brand" | "type">): string {
  return feedType.name || [feedType.brand, feedType.type].filter(Boolean).join(" ");
}

export function feedTypeTotal(feedTypes: FeedingFeedType[]): number {
  return feedTypes.reduce((sum, item) => sum + Number(item.percentage), 0);
}

export function validFeedTypeMix(feedTypes: FeedingFeedType[]): boolean {
  return feedTypes.length === 0 || Math.abs(feedTypeTotal(feedTypes) - 100) < 0.001;
}
