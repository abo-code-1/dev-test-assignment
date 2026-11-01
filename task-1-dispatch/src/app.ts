// @rev kc-31
import { createServer, type ServerResponse } from 'node:http';
import { assignedCount, assignOrder } from './dispatch.ts';
import { branches, orders } from './store.ts';
import { isValidDate } from './time.ts';

export const app = createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/branches') {
      return send(res, 200, branches);
    }

    if (req.method === 'GET' && parts[0] === 'orders' && parts.length === 2) {
      const order = orders.find((o) => o.id === parts[1]);
      if (!order) return send(res, 404, { error: 'order_not_found' });
      return send(res, 200, order);
    }

    if (req.method === 'POST' && parts[0] === 'orders' && parts[2] === 'assign' && parts.length === 3) {
      const order = orders.find((o) => o.id === parts[1]);
      if (!order) return send(res, 404, { error: 'order_not_found' });
      return send(res, 200, assignOrder(order));
    }

    if (req.method === 'GET' && parts[0] === 'branches' && parts[2] === 'load' && parts.length === 3) {
      const date = url.searchParams.get('date');
      if (!date || !isValidDate(date)) return send(res, 400, { error: 'invalid_date' });

      const branch = branches.find((b) => b.id === parts[1]);
      if (!branch) return send(res, 404, { error: 'branch_not_found' });

      return send(res, 200, {
        branchId: branch.id,
        date,
        assigned: assignedCount(branch.id, date),
        limit: branch.dailyLimit,
      });
    }

    send(res, 404, { error: 'not_found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'internal' });
  }
});

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
