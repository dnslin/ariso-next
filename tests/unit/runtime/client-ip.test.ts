import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  clientIpStatus,
  createClientIpResolver,
  readClientIp,
  stampClientIp,
} from '../../../src/server/http/client-ip.ts';

describe('media request client address', () => {
  it.each([undefined, '', '  '])(
    'requires a deployment choice instead of grouping unidentified visitors (%s)',
    (value) => {
      const resolve = createClientIpResolver(value);
      expect(resolve('127.0.0.1', '203.0.113.1')).toEqual({
        ip: null,
        reason: 'not-configured',
      });
    },
  );

  it('uses the socket in direct mode, ignoring visitor-supplied forwarding headers', () => {
    const resolve = createClientIpResolver('none');
    expect(resolve('::ffff:192.0.2.1', '198.51.100.7')).toEqual({
      ip: '192.0.2.1',
      reason: null,
    });
    expect(resolve('::ffff:c000:201', 'malformed')).toEqual(
      resolve('192.0.2.1', undefined),
    );
    expect(resolve('2001:0DB8:0:0::1', undefined).ip).toBe('2001:db8::1');
  });

  it('walks a trusted proxy chain from the nearest hop and stops at the first client', () => {
    const resolve = createClientIpResolver('127.0.0.1/32, ::1/128, 10.0.0.0/8');
    expect(
      resolve('::ffff:127.0.0.1', '198.51.100.99, 203.0.113.8, 10.2.3.4').ip,
    ).toBe('203.0.113.8');
    expect(resolve('::1', '2001:db8:0:0::2').ip).toBe('2001:db8::2');
  });

  it('does not trust forwarding headers from an unlisted peer', () => {
    const resolve = createClientIpResolver('127.0.0.1/32');
    expect(resolve('192.0.2.5', '198.51.100.1').ip).toBe('192.0.2.5');
  });

  it('does not inspect forged entries beyond the first untrusted hop', () => {
    const resolve = createClientIpResolver('127.0.0.1/32');
    expect(resolve('127.0.0.1', 'not-an-ip, 203.0.113.8').ip).toBe(
      '203.0.113.8',
    );
  });

  it.each([undefined, ''])(
    'reports a missing trusted-proxy forwarding address (%s)',
    (header) => {
      expect(createClientIpResolver('127.0.0.1')('127.0.0.1', header)).toEqual({
        ip: null,
        reason: 'forwarded-missing',
      });
    },
  );

  it.each(['not-an-ip', '192.0.2.1:1234', '203.0.113.8, unknown'])(
    'reports an invalid trusted hop (%s)',
    (header) => {
      expect(createClientIpResolver('127.0.0.1')('127.0.0.1', header)).toEqual({
        ip: null,
        reason: 'forwarded-invalid',
      });
    },
  );

  it('accepts the left-most address if every presented hop is explicitly trusted', () => {
    expect(
      createClientIpResolver('10.0.0.0/8')('10.0.0.1', '10.0.0.9, 10.0.0.2').ip,
    ).toBe('10.0.0.9');
  });

  it.each([
    'true',
    '*',
    'loopback',
    '127.0.0.1/33',
    '::1/129',
    '127.0.0.1,',
    'none,127.0.0.1',
  ])('rejects invalid deployment settings (%s)', (value) => {
    expect(() => createClientIpResolver(value)).toThrow(
      'ARISO_TRUSTED_PROXIES',
    );
  });

  it('overwrites internal address headers at the HTTP boundary', () => {
    const request = {
      headers: {
        'x-ariso-client-ip': '203.0.113.7',
        'x-ariso-client-ip-error': 'not-configured',
        'x-forwarded-for': '198.51.100.5',
      },
      socket: { remoteAddress: '::ffff:192.0.2.4' },
    } as unknown as IncomingMessage;
    stampClientIp(request, createClientIpResolver('none'));
    const web = new Request('http://localhost/i/image', {
      headers: request.headers as Record<string, string>,
    });
    expect(readClientIp(web)).toBe('192.0.2.4');
    expect(clientIpStatus(web)).toEqual({ ready: true, message: null });
    expect(request.headers['x-ariso-client-ip-error']).toBeUndefined();
  });

  it('clears forged identities when deployment is not configured', () => {
    const request = {
      headers: { 'x-ariso-client-ip': '203.0.113.7' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as IncomingMessage;
    stampClientIp(request, createClientIpResolver(undefined));
    const web = new Request('http://localhost', {
      headers: request.headers as Record<string, string>,
    });
    expect(readClientIp(web)).toBeNull();
    expect(clientIpStatus(web).ready).toBe(false);
    expect(clientIpStatus(web).message).toContain('ARISO_TRUSTED_PROXIES');
  });

  it('reports an unavailable adapter or socket without inventing an address', () => {
    expect(readClientIp(new Request('http://localhost'))).toBeNull();
    expect(clientIpStatus(new Request('http://localhost')).ready).toBe(false);
    expect(createClientIpResolver('none')(undefined, undefined)).toEqual({
      ip: null,
      reason: 'peer-unavailable',
    });
  });
});
