import { sql } from 'drizzle-orm';
import pino from 'pino';
import { getServerRuntime } from '../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = pino({ name: 'runtime.health' });

export function GET() {
  try {
    getServerRuntime().connection.db.get(sql`SELECT 1`);
    return Response.json(
      { status: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    logger.error({ err, phase: 'health' }, 'Database health check failed');
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
