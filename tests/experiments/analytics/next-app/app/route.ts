import { getExperiment } from '../../runtime.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Loopback-only experiment controls; never packaged into the product application.
export async function GET(request: Request) {
  const experiment = getExperiment();
  const query = new URL(request.url).searchParams;
  switch (query.get('action')) {
    case 'fault':
      experiment.database.pragma(
        `query_only = ${query.get('enabled') === '1' ? 'ON' : 'OFF'}`,
      );
      return Response.json(experiment.collector.snapshot());
    case 'record': {
      const count = Number(query.get('count') ?? 1);
      if (!Number.isInteger(count) || count < 1 || count > 20001)
        return new Response('Invalid count', { status: 400 });
      for (let index = 0; index < count; index++) {
        experiment.record(`${query.get('prefix') ?? 'image'}-${index}`);
      }
      return Response.json(experiment.collector.snapshot());
    }
    case 'stream': {
      experiment.log('request-start');
      // A real pending HTTP request whose first bytes arrive after SIGTERM.
      await new Promise((resolve) => setTimeout(resolve, 500));
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('first\n'));
            experiment.log('first-byte');
            experiment.record('in-flight');
            setTimeout(() => {
              controller.enqueue(new TextEncoder().encode('last\n'));
              controller.close();
              experiment.log('stream-complete');
            }, 500);
          },
        }),
        { headers: { 'Content-Type': 'text/plain' } },
      );
    }
    default:
      return Response.json(experiment.collector.snapshot());
  }
}
