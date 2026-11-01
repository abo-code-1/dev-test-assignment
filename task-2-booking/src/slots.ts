// @rev kc-31
import { now } from './clock.ts';
import type { Booking, Master, Service } from './types.ts';
import { dayStartMs, fromMinutes, overlaps, toMinutes, weekday } from './time.ts';

export const SLOT_STEP_MIN = 15;

const MINUTE_MS = 60_000;

// Свободные слоты мастера на дату, 'HH:mm' по Алматы
export function getSlots(master: Master, service: Service, date: string, bookings: Booking[]): string[] {
  const day = master.schedule[weekday(date)];
  if (!day) return [];

  const breaks = day.breaks.map((b) => ({ start: toMinutes(b.from), end: toMinutes(b.to) }));

  // Записи лежат в UTC, поэтому сравниваем абсолютное время, а не минуты суток
  const busy = bookings
    .filter((b) => b.masterId === master.id && b.status === 'active')
    .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));

  const dayStart = dayStartMs(date);
  const nowMs = now().getTime();

  const result: string[] = [];
  const end = toMinutes(day.to);
  for (let t = toMinutes(day.from); t + service.durationMin <= end; t += SLOT_STEP_MIN) {
    const local = { start: t, end: t + service.durationMin };
    const absolute = {
      start: dayStart + local.start * MINUTE_MS,
      end: dayStart + local.end * MINUTE_MS,
    };

    if (absolute.start <= nowMs) continue;
    if (breaks.some((b) => overlaps(local, b))) continue;
    if (busy.some((b) => overlaps(absolute, b))) continue;
    result.push(fromMinutes(t));
  }
  return result;
}
