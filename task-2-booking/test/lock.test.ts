// @rev kc-31
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { withLock } from '../src/lock.ts';

test('withLock: задачи с одним ключом идут по очереди', async () => {
  const log: string[] = [];
  const task = (name: string, ms: number) => async () => {
    log.push(`${name}:start`);
    await sleep(ms);
    log.push(`${name}:end`);
  };

  await Promise.all([withLock('k', task('a', 15)), withLock('k', task('b', 1))]);
  assert.deepEqual(log, ['a:start', 'a:end', 'b:start', 'b:end']);
});

test('withLock: разные ключи друг друга не ждут', async () => {
  const log: string[] = [];
  await Promise.all([
    withLock('a', async () => {
      await sleep(15);
      log.push('slow');
    }),
    withLock('b', async () => {
      log.push('fast');
    }),
  ]);
  assert.deepEqual(log, ['fast', 'slow']);
});

test('withLock: упавшая задача не блокирует очередь', async () => {
  const failed = withLock('k', async () => {
    throw new Error('boom');
  });
  const next = withLock('k', async () => 'ok');

  await assert.rejects(failed, /boom/);
  assert.equal(await next, 'ok');
});
