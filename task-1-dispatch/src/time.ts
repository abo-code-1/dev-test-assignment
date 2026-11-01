// @rev kc-31
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;

// Календарная дата по Алматы (UTC+5) для момента в ISO, 'YYYY-MM-DD'
export function almatyDate(iso: string): string {
  return new Date(new Date(iso).getTime() + ALMATY_OFFSET_MS).toISOString().slice(0, 10);
}

// Строго 'YYYY-MM-DD' и существующая дата: Date сам по себе превратит 02-31 в 03-03
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
