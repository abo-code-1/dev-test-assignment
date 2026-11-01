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
