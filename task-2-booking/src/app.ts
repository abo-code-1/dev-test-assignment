// @rev kc-31
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createBooking } from './booking.ts';
import { getSlots } from './slots.ts';
import { bookingRepo, masters, services } from './store.ts';
import { isValidDate } from './time.ts';

export const app = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/masters') {
      return send(res, 200, masters);
    }

    if (req.method === 'GET' && url.pathname === '/services') {
      return send(res, 200, services);
    }

    if (req.method === 'GET' && parts[0] === 'masters' && parts[2] === 'slots' && parts.length === 3) {
      const serviceId = url.searchParams.get('serviceId');
      const date = url.searchParams.get('date');
      if (!serviceId) return send(res, 400, { error: 'service_required' });
      if (!date || !isValidDate(date)) return send(res, 400, { error: 'invalid_date' });

      const master = masters.find((m) => m.id === parts[1]);
      if (!master) return send(res, 404, { error: 'master_not_found' });

      const service = services.find((s) => s.id === serviceId);
      if (!service) return send(res, 404, { error: 'service_not_found' });

      if (!service.masterIds.includes(master.id)) {
        return send(res, 400, { error: 'service_not_offered' });
      }

      const bookings = await bookingRepo.listByMaster(master.id);
      return send(res, 200, {
        masterId: master.id,
        serviceId: service.id,
        date,
        slots: getSlots(master, service, date, bookings),
      });
    }

    if (req.method === 'POST' && url.pathname === '/bookings') {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (err) {
        if (err instanceof SyntaxError) return send(res, 400, { error: 'invalid_json' });
        throw err;
      }

      const result = await createBooking(body);
      return result.ok ? send(res, 201, result.booking) : send(res, result.status, { error: result.error });
    }

    send(res, 404, { error: 'not_found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'internal' });
  }
});

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : null;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
