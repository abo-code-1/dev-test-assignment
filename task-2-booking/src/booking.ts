// @rev kc-31
import { randomUUID } from 'node:crypto';
import { withLock } from './lock.ts';
import { normalizePhone } from './phone.ts';
import { getSlots } from './slots.ts';
import { bookingRepo, masters, services } from './store.ts';
import { parseIsoWithZone, toLocal } from './time.ts';
import type { Booking } from './types.ts';

export type BookingResult =
  | { ok: true; booking: Booking }
  | { ok: false; status: number; error: string };

const MINUTE_MS = 60_000;

const fail = (status: number, error: string): BookingResult => ({ ok: false, status, error });

export async function createBooking(input: unknown): Promise<BookingResult> {
  if (typeof input !== 'object' || input === null) return fail(400, 'invalid_body');
  const { masterId, serviceId, start, clientPhone } = input as Record<string, unknown>;
  if (typeof masterId !== 'string' || typeof serviceId !== 'string') return fail(400, 'invalid_body');

  const startMs = typeof start === 'string' ? parseIsoWithZone(start) : null;
  if (startMs === null) return fail(400, 'invalid_start');

  const phone = typeof clientPhone === 'string' ? normalizePhone(clientPhone) : null;
  if (!phone) return fail(400, 'invalid_phone');

  const master = masters.find((m) => m.id === masterId);
  if (!master) return fail(404, 'master_not_found');

  const service = services.find((s) => s.id === serviceId);
  if (!service) return fail(404, 'service_not_found');

  if (!service.masterIds.includes(master.id)) return fail(400, 'service_not_offered');

  // Между чтением записей и вставкой есть await: без очереди два запроса увидят
  // одно время свободным. Ключ — мастер, а не слот: услуги разной длины могут
  // пересечься, начинаясь в разное время.
  return withLock(master.id, async () => {
    const bookings = await bookingRepo.listByMaster(master.id);
    const { date, time } = toLocal(startMs);
    const isFree = startMs % MINUTE_MS === 0 && getSlots(master, service, date, bookings).includes(time);
    if (!isFree) return fail(409, 'slot_unavailable');

    const booking: Booking = {
      id: `bk-${randomUUID()}`,
      masterId: master.id,
      serviceId: service.id,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + service.durationMin * MINUTE_MS).toISOString(),
      clientPhone: phone,
      status: 'active',
    };
    await bookingRepo.insert(booking);
    return { ok: true, booking };
  });
}
