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

export function formatFeedTypeName(feedType: Pick<FeedingFeedType, "brand" | "type">): string {
  return `${feedType.brand} ${feedType.type}`.trim();
}

export function feedTypeTotal(feedTypes: FeedingFeedType[]): number {
  return feedTypes.reduce((sum, item) => sum + Number(item.percentage), 0);
}

export function validFeedTypeMix(feedTypes: FeedingFeedType[]): boolean {
  return feedTypes.length === 0 || Math.abs(feedTypeTotal(feedTypes) - 100) < 0.001;
}
