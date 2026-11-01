// @rev kc-31
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.ts';

// Тесты идут на data/*.json. Состояние общее на файл, поэтому каждый тест,
// который создаёт записи, работает со своей датой.
let base: string;

before(async () => {
  process.env.NOW = '2030-11-17T04:00:00.000Z';
  await new Promise<void>((resolve) => app.listen(0, resolve));
  base = `http://localhost:${(app.address() as AddressInfo).port}`;
});

after(() => {
  delete process.env.NOW;
  app.close();
});

async function slots(masterId: string, query: string) {
  const res = await fetch(`${base}/masters/${masterId}/slots?${query}`);
  return { status: res.status, body: await res.json() };
}

test('GET slots: занятое, перерыв и отменённые записи на данных из задания', async () => {
  const res = await slots('m-1', 'serviceId=s-cut&date=2030-11-18');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    masterId: 'm-1',
    serviceId: 's-cut',
    date: '2030-11-18',
    // 10:00–11:00 и 12:30–13:00 заняты, 14:00–15:00 перерыв, запись на 16:00 отменена
    slots: ['11:00', '11:15', '11:30', '13:00', '15:00', '15:15', '15:30', '15:45', '16:00', '16:15', '16:30', '16:45', '17:00', '17:15', '17:30', '17:45', '18:00'],
  });
});

test('GET slots: нет параметров или некорректная дата — 400', async () => {
  const queries = [
    'date=2030-11-18',
    'serviceId=s-cut',
    'serviceId=s-cut&date=abc',
    'serviceId=s-cut&date=2030-02-31',
    'serviceId=s-cut&date=2030-13-01',
  ];
  for (const query of queries) {
    assert.equal((await slots('m-1', query)).status, 400, query);
  }
});

test('GET slots: мастер не оказывает услугу — 400', async () => {
  assert.equal((await slots('m-1', 'serviceId=s-mani&date=2030-11-18')).status, 400);
});

test('GET slots: нет мастера или услуги — 404', async () => {
  assert.equal((await slots('m-404', 'serviceId=s-cut&date=2030-11-18')).status, 404);
  assert.equal((await slots('m-1', 'serviceId=s-404&date=2030-11-18')).status, 404);
});

const request = (over: Record<string, unknown>) => ({
  masterId: 'm-1',
  serviceId: 's-cut',
  start: '2030-11-19T15:00:00+05:00',
  clientPhone: '8 (701) 234-56-78',
  ...over,
});

async function post(body: unknown) {
  const res = await fetch(`${base}/bookings`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('POST bookings: создаёт запись в UTC с нормализованным телефоном', async () => {
  const res = await post(request({}));
  assert.equal(res.status, 201);
  assert.match(res.body.id, /^bk-/);
  assert.deepEqual({ ...res.body, id: '' }, {
    id: '',
    masterId: 'm-1',
    serviceId: 's-cut',
    start: '2030-11-19T10:00:00.000Z',
    end: '2030-11-19T11:00:00.000Z',
    clientPhone: '+77012345678',
    status: 'active',
  });

  const after = await slots('m-1', 'serviceId=s-cut&date=2030-11-19');
  assert.equal(after.body.slots.includes('15:00'), false);
  assert.equal(after.body.slots.includes('16:00'), true);
});

test('POST bookings: дата берётся по Алматы при любом часовом поясе', async () => {
  // 20.11 23:00 в UTC-9 — это четверг 21.11 13:00 по Алматы
  const res = await post(request({ start: '2030-11-20T23:00:00-09:00' }));
  assert.equal(res.status, 201);
  assert.equal(res.body.start, '2030-11-21T08:00:00.000Z');
});

test('POST bookings: некорректные данные — 400', async () => {
  const bad = [
    'не json',
    '[]',
    '',
    { serviceId: 's-cut', start: '2030-11-22T10:00:00Z', clientPhone: '87012345678' },
    request({ start: undefined }),
    request({ start: 123 }),
    request({ start: 'завтра' }),
    request({ start: '2030-11-22T10:00:00' }), // без часового пояса
    request({ start: '2030-02-31T10:00:00Z' }),
    request({ clientPhone: undefined }),
    request({ clientPhone: 12345 }),
    request({ clientPhone: '12345' }),
    request({ serviceId: 's-mani' }), // m-1 не оказывает эту услугу
  ];
  for (const body of bad) {
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('POST bookings: нет мастера или услуги — 404', async () => {
  assert.equal((await post(request({ masterId: 'm-404' }))).status, 404);
  assert.equal((await post(request({ serviceId: 's-404' }))).status, 404);
});

test('POST bookings: время вне свободных слотов — 409 slot_unavailable', async () => {
  const taken = [
    '2030-11-18T10:00:00+05:00', // занято записью bk-1
    '2030-11-22T10:05:00+05:00', // не кратно шагу
    '2030-11-22T10:00:30+05:00', // секунды
    '2030-11-22T14:00:00+05:00', // перерыв
    '2030-11-22T18:30:00+05:00', // не помещается в рабочий день
    '2030-11-22T08:00:00+05:00', // до открытия
    '2030-11-24T12:00:00+05:00', // воскресенье
    '2030-11-13T12:00:00+05:00', // прошлое
  ];
  for (const start of taken) {
    const res = await post(request({ start }));
    assert.equal(res.status, 409, start);
    assert.deepEqual(res.body, { error: 'slot_unavailable' });
  }
});

test('POST bookings: из одновременных запросов на одно время создаётся одна запись', async () => {
  const body = request({ start: '2030-11-25T11:00:00+05:00' });
  const results = await Promise.all(Array.from({ length: 10 }, () => post(body)));

  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 9);
});

test('POST bookings: разные услуги с разным началом тоже не накладываются', async () => {
  const results = await Promise.all([
    post(request({ start: '2030-11-26T11:00:00+05:00' })), // 11:00–12:00
    post(request({ start: '2030-11-26T11:30:00+05:00', serviceId: 's-brows' })), // 11:30–12:00
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});

test('POST bookings: разные мастера не мешают друг другу', async () => {
  const results = await Promise.all([
    post(request({ masterId: 'm-1', start: '2030-11-27T11:00:00+05:00' })),
    post(request({ masterId: 'm-2', start: '2030-11-27T11:00:00+05:00' })),
  ]);
  assert.deepEqual(results.map((r) => r.status), [201, 201]);
});

async function cancel(id: string) {
  const res = await fetch(`${base}/bookings/${id}`, { method: 'DELETE' });
  return { status: res.status, body: await res.json() };
}

async function atTime<T>(iso: string, action: () => Promise<T>): Promise<T> {
  const previous = process.env.NOW;
  process.env.NOW = iso;
  try {
    return await action();
  } finally {
    process.env.NOW = previous;
  }
}

test('DELETE bookings: отмена освобождает время', async () => {
  const body = request({ start: '2030-11-28T11:00:00+05:00' });
  const created = await post(body);

  const res = await cancel(created.body.id);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ...created.body, status: 'cancelled' });

  assert.equal((await post(body)).status, 201);
});

test('DELETE bookings: нет записи — 404', async () => {
  assert.equal((await cancel('bk-404')).status, 404);
});

test('DELETE bookings: меньше чем за 2 часа — 409 too_late, запись не меняется', async () => {
  // начало записи: 2030-12-02 06:00 UTC
  const created = await post(request({ start: '2030-12-02T11:00:00+05:00' }));

  const res = await atTime('2030-12-02T04:00:00.001Z', () => cancel(created.body.id));
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'too_late' });

  const after = await slots('m-1', 'serviceId=s-cut&date=2030-12-02');
  assert.equal(after.body.slots.includes('11:00'), false);
});

test('DELETE bookings: ровно за 2 часа ещё можно', async () => {
  const created = await post(request({ start: '2030-12-03T11:00:00+05:00' }));
  const res = await atTime('2030-12-03T04:00:00.000Z', () => cancel(created.body.id));
  assert.equal(res.status, 200);
});

test('DELETE bookings: уже прошедшую запись отменить нельзя', async () => {
  const created = await post(request({ start: '2030-12-04T11:00:00+05:00' }));
  const res = await atTime('2030-12-05T00:00:00.000Z', () => cancel(created.body.id));
  assert.equal(res.status, 409);
});

test('DELETE bookings: повторная отмена — 200, даже когда уже поздно', async () => {
  const created = await post(request({ start: '2030-12-05T11:00:00+05:00' }));
  assert.equal((await cancel(created.body.id)).status, 200);

  const again = await atTime('2030-12-05T05:59:00.000Z', () => cancel(created.body.id));
  assert.equal(again.status, 200);
  assert.equal(again.body.status, 'cancelled');
});
