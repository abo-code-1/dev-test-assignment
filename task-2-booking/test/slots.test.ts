// @rev kc-31
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { getSlots } from '../src/slots.ts';
import { overlaps, toMinutes } from '../src/time.ts';
import type { Booking, Master, Service } from '../src/types.ts';

const day = { from: '10:00', to: '13:00', breaks: [] };

const master: Master = {
  id: 'm-1',
  name: 'Тест',
  schedule: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: null, sun: null },
};

const cut: Service = { id: 's-cut', name: 'Стрижка', durationMin: 60, masterIds: ['m-1'] };

const brows: Service = { id: 's-brows', name: 'Брови', durationMin: 30, masterIds: ['m-1'] };

const withBreak: Master = {
  ...master,
  schedule: { ...master.schedule, mon: { from: '10:00', to: '13:00', breaks: [{ from: '11:00', to: '11:30' }] } },
};

const booking = (over: Partial<Booking>): Booking => ({
  id: 'bk-1',
  masterId: 'm-1',
  serviceId: 's-cut',
  start: '2030-11-18T06:00:00.000Z', // 11:00 по Алматы
  end: '2030-11-18T07:00:00.000Z',
  clientPhone: '+77012345678',
  status: 'active',
  ...over,
});

afterEach(() => {
  delete process.env.NOW;
});

const range = (from: string, to: string) => ({ start: toMinutes(from), end: toMinutes(to) });

test('overlaps: пересекающиеся интервалы', () => {
  assert.equal(overlaps(range('10:00', '11:00'), range('10:30', '11:30')), true);
});

test('overlaps: запись сразу после другой не пересекается', () => {
  assert.equal(overlaps(range('10:00', '11:00'), range('11:00', '12:00')), false);
});

test('getSlots: свободный день', () => {
  // 2030-11-18 — понедельник
  const slots = getSlots(master, cut, '2030-11-18', []);
  assert.deepEqual(slots, ['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00']);
});

test('getSlots: выходной', () => {
  assert.deepEqual(getSlots(master, cut, '2030-11-23', []), []);
});

test('getSlots: слот не пересекает перерыв', () => {
  const slots = getSlots(withBreak, brows, '2030-11-18', []);
  assert.deepEqual(slots, ['10:00', '10:15', '10:30', '11:30', '11:45', '12:00', '12:15', '12:30']);
});

test('getSlots: занятое время не выдаётся, отменённые записи не мешают', () => {
  const slots = getSlots(master, cut, '2030-11-18', [
    booking({}),
    booking({ id: 'bk-2', start: '2030-11-18T05:00:00.000Z', end: '2030-11-18T05:30:00.000Z', status: 'cancelled' }),
  ]);
  // запись 11:00–12:00: подходят слоты встык до неё и встык после
  assert.deepEqual(slots, ['10:00', '12:00']);
});

test('getSlots: записи другого мастера не мешают', () => {
  const slots = getSlots(master, brows, '2030-11-18', [booking({ masterId: 'm-2' })]);
  assert.equal(slots.includes('11:00'), true);
});

test('getSlots: запись другого дня не мешает', () => {
  const nextDay = booking({ start: '2030-11-19T06:00:00.000Z', end: '2030-11-19T07:00:00.000Z' });
  assert.equal(getSlots(master, cut, '2030-11-18', [nextDay]).length, 9);
});

test('getSlots: прошедшее время не выдаётся', () => {
  process.env.NOW = '2030-11-18T06:20:00.000Z'; // 11:20 по Алматы
  assert.deepEqual(getSlots(master, cut, '2030-11-18', []), ['11:30', '11:45', '12:00']);
});

test('getSlots: слот ровно в текущий момент уже не выдаётся', () => {
  process.env.NOW = '2030-11-18T06:30:00.000Z'; // 11:30 по Алматы
  assert.deepEqual(getSlots(master, cut, '2030-11-18', []), ['11:45', '12:00']);
});

test('getSlots: день считается по Алматы, а не по UTC', () => {
  process.env.NOW = '2030-11-17T19:30:00.000Z'; // уже 00:30 понедельника в Алматы
  assert.equal(getSlots(master, cut, '2030-11-18', []).length, 9);
  process.env.NOW = '2030-11-18T08:00:00.000Z'; // 13:00 в Алматы, день кончился
  assert.deepEqual(getSlots(master, cut, '2030-11-18', []), []);
});
