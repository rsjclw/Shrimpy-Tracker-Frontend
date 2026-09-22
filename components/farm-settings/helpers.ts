// Small local helpers shared by the farm settings sections. Kept here rather
// than in lib/* since they are specific to this page's presentation.

/** "7.989°S, 110.225°E" or "No location" when either coordinate is missing. */
export function formatCoords(lat: string | null, lng: string | null): string {
  if (lat == null || lng == null) return "No location";
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return "No location";
  const latDir = latNum >= 0 ? "N" : "S";
  const lngDir = lngNum >= 0 ? "E" : "W";
  return `${Math.abs(latNum).toFixed(3)}°${latDir}, ${Math.abs(lngNum).toFixed(3)}°${lngDir}`;
}

/** Typing helper for lat/lng: digits, one dot, and an optional leading minus sign. */
export function coordInput(value: string): string {
  const negative = value.trim().startsWith("-");
  let v = value.replace(/[^0-9.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
  return negative ? `-${v}` : v;
}

/** "Weather synced 3 h ago" / "Weather synced just now" / "Weather not synced yet". */
export function weatherSyncedText(iso: string | null): string {
  if (!iso) return "Weather not synced yet";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Weather not synced yet";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "Weather synced just now";
  if (minutes < 60) return `Weather synced ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Weather synced ${hours} h ago`;
  const days = Math.round(hours / 24);
  return `Weather synced ${days} d ago`;
}
