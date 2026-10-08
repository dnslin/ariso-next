import { expect, it } from 'vitest';
import { startProtocolEndpoint } from '../delivery/s3-endpoint.ts';
import { verifyReportDelivery } from '../../verification/analytics/report-delivery.ts';

it('serves owner reports over real standalone HTTP and combines local bytes with S3 signed redirects', async () => {
  const endpoint = await startProtocolEndpoint();
  try {
    const result = await verifyReportDelivery(endpoint.target);
    expect(result).toMatchObject({
      status: 'passed',
      cumulative: { original: 2, compressed: 2, watermark: 2, total: 6 },
    });
    expect(endpoint.objects.size).toBe(0);
  } finally {
    await endpoint.close();
  }
}, 45000);
