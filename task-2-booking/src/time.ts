// @rev kc-31
import type { Weekday } from './types.ts';

// Казахстан живёт в одном часовом поясе
export const TZ_OFFSET = '+05:00';
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// date: 'YYYY-MM-DD'
export function weekday(date: string): Weekday {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

// Строго 'YYYY-MM-DD' и существующая дата: Date сам по себе превратит 02-31 в 03-03
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

// Момент начала местных суток даты, мс
export function dayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00${TZ_OFFSET}`);
}

// ISO-строка с обязательным часовым поясом -> мс. Без пояса Date взял бы пояс сервера.
export function parseIsoWithZone(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
  if (!isValidDate(value.slice(0, 10))) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

// Абсолютный момент -> дата и время по Алматы
export function toLocal(ms: number): { date: string; time: string } {
  const iso = new Date(ms + TZ_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export type Range = { start: number; end: number };

export function overlaps(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}
