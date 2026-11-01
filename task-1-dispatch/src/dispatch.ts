// @rev kc-31
import { assignBranch } from './router.ts';
import { assignments, branches, dailyLoad } from './store.ts';
import { almatyDate } from './time.ts';
import type { Assignment, Order } from './types.ts';

const loadKey = (branchId: string, date: string) => `${branchId}|${date}`;

export function assignedCount(branchId: string, date: string): number {
  return dailyLoad.get(loadKey(branchId, date)) ?? 0;
}

// Без await внутри: между проверкой лимита и записью никто не вклинится
export function assignOrder(order: Order): Assignment {
  const existing = assignments.get(order.id);
  if (existing) return existing;

  const date = almatyDate(order.createdAt);
  const assignment = assignBranch(order, branches, (branchId) => assignedCount(branchId, date));

  assignments.set(order.id, assignment);
  if (assignment.branchId) {
    const key = loadKey(assignment.branchId, date);
    dailyLoad.set(key, (dailyLoad.get(key) ?? 0) + 1);
  }
  return assignment;
}
