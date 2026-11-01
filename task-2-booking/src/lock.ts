// @rev kc-31
const tails = new Map<string, Promise<unknown>>();

// Задачи с одним ключом идут строго по очереди. Работает только внутри одного процесса.
export async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  // Упавшая задача не должна блокировать очередь: следующая запускается в любом случае
  const run = previous.then(() => task(), () => task());
  tails.set(key, run);
  try {
    return await run;
  } finally {
    if (tails.get(key) === run) tails.delete(key);
  }
}
