// @rev kc-31
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.ts';
import { assignments, dailyLoad } from '../src/store.ts';

// Тесты идут на data/*.json: у b-ala-1 лимит 3 заказа в сутки
let base: string;

before(async () => {
  await new Promise<void>((resolve) => app.listen(0, resolve));
  base = `http://localhost:${(app.address() as AddressInfo).port}`;
});

after(() => {
  app.close();
});

beforeEach(() => {
  assignments.clear();
  dailyLoad.clear();
});

async function assign(id: string) {
  const res = await fetch(`${base}/orders/${id}/assign`, { method: 'POST' });
  return { status: res.status, body: await res.json() };
}

async function load(id: string, date: string) {
  const res = await fetch(`${base}/branches/${id}/load?date=${date}`);
  return { status: res.status, body: await res.json() };
}

test('POST assign: ответ по формату из задания', async () => {
  const res = await assign('o-101');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { orderId: 'o-101', branchId: 'b-ala-1', rule: 'pickup_point' });
});

test('POST assign: все правила на тестовых данных', async () => {
  const cases: [string, string | null, string][] = [
    ['o-102', 'b-ast-1', 'manual'],
    ['o-103', 'b-ast-1', 'city'],
    ['o-104', 'b-ala-2', 'geo'],
    ['o-105', 'b-shy-1', 'single'],
    ['o-106', null, 'unassigned'],
    ['o-107', 'b-ala-2', 'geo'],
    // manual и пункт выдачи указывают на закрытый филиал
    ['o-108', 'b-ala-1', 'geo'],
  ];
  for (const [orderId, branchId, rule] of cases) {
    const res = await assign(orderId);
    assert.deepEqual(res.body, { orderId, branchId, rule });
  }
});

test('POST assign: нет заказа — 404', async () => {
  const res = await assign('o-404');
  assert.equal(res.status, 404);
});

test('POST assign: повторный вызов не занимает лимит', async () => {
  const first = await assign('o-101');
  const second = await assign('o-101');
  assert.deepEqual(second.body, first.body);
  assert.equal((await load('b-ala-1', '2026-11-16')).body.assigned, 1);
});

test('POST assign: повтор unassigned тоже возвращает то же самое', async () => {
  const first = await assign('o-106');
  const second = await assign('o-106');
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
});

test('POST assign: одновременные дубли дают одно распределение', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => assign('o-101')));
  for (const res of results) assert.deepEqual(res.body, results[0].body);
  assert.equal((await load('b-ala-1', '2026-11-16')).body.assigned, 1);
});

test('лимит: сверх лимита заказ уходит в ближайший незаполненный', async () => {
  await assign('o-101');
  await assign('o-109');
  await assign('o-110');
  const res = await assign('o-111');
  assert.deepEqual(res.body, { orderId: 'o-111', branchId: 'b-ala-2', rule: 'geo' });
  assert.deepEqual((await load('b-ala-1', '2026-11-16')).body, {
    branchId: 'b-ala-1',
    date: '2026-11-16',
    assigned: 3,
    limit: 3,
  });
});

test('лимит: сутки считаются по Алматы, а не по UTC', async () => {
  await assign('o-101'); // 15.11 19:30 UTC — уже 16.11 в Алматы
  await assign('o-113'); // 15.11 18:50 UTC — ещё 15.11 в Алматы
  await assign('o-112'); // 16.11 19:10 UTC — уже 17.11 в Алматы
  assert.equal((await load('b-ala-1', '2026-11-15')).body.assigned, 1);
  assert.equal((await load('b-ala-1', '2026-11-16')).body.assigned, 1);
  assert.equal((await load('b-ala-1', '2026-11-17')).body.assigned, 1);
});

test('лимит: заполненный день не мешает следующему', async () => {
  await assign('o-101');
  await assign('o-109');
  await assign('o-110');
  const res = await assign('o-112');
  assert.deepEqual(res.body, { orderId: 'o-112', branchId: 'b-ala-1', rule: 'pickup_point' });
});

test('GET load: день без заказов', async () => {
  const res = await load('b-ala-2', '2026-11-20');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { branchId: 'b-ala-2', date: '2026-11-20', assigned: 0, limit: 40 });
});

test('GET load: нет или некорректная дата — 400', async () => {
  const noDate = await fetch(`${base}/branches/b-ala-1/load`);
  assert.equal(noDate.status, 400);
  await noDate.body?.cancel();

  for (const date of ['', 'abc', '2026-13-01', '2026-02-31', '2026-2-3', '2026-11-16T00:00:00Z']) {
    assert.equal((await load('b-ala-1', date)).status, 400, date);
  }
});

test('GET load: нет филиала — 404', async () => {
  assert.equal((await load('b-404', '2026-11-16')).status, 404);
});
