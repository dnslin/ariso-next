import type { IncomingMessage } from 'node:http';
import { BlockList, isIP, SocketAddress } from 'node:net';

const addressHeader = 'x-ariso-client-ip';
const errorHeader = 'x-ariso-client-ip-error';
const reasons = {
  'not-configured':
    '尚未确认真实访客 IP。请配置 ARISO_TRUSTED_PROXIES 后再启用拦截。',
  'peer-unavailable': '无法读取连接来源，请核对 HTTP 启动入口。',
  'forwarded-missing': '可信代理未提供访客 IP，请核对 X-Forwarded-For 配置。',
  'forwarded-invalid':
    '可信代理提供的访客 IP 无效，请核对 X-Forwarded-For 配置。',
} as const;
type Resolution = { ip: string | null; reason: keyof typeof reasons | null };
type Resolver = (
  peer: string | undefined,
  forwarded: string | string[] | undefined,
) => Resolution;

function normalizeAddress(address: string | undefined): string | null {
  if (!address || !isIP(address)) return null;
  const normalized = new SocketAddress({
    address,
    family: isIP(address) === 6 ? 'ipv6' : 'ipv4',
  }).address;
  return normalized.startsWith('::ffff:') && isIP(normalized.slice(7)) === 4
    ? normalized.slice(7)
    : normalized;
}

/** Mirrors the established nearest-untrusted-hop rule, using Node's IP primitives. */
export function createClientIpResolver(value: string | undefined): Resolver {
  value = value?.trim();
  if (!value) return () => ({ ip: null, reason: 'not-configured' });
  const trusted = new BlockList();
  if (value !== 'none') {
    for (const item of value.split(',')) {
      const [address, prefix, extra] = item.trim().split('/');
      const family = isIP(address);
      if (
        !family ||
        extra !== undefined ||
        (prefix !== undefined && !/^\d+$/.test(prefix))
      )
        throw new Error(
          'ARISO_TRUSTED_PROXIES: 请填写 none 或逗号分隔的代理 IP/CIDR',
        );
      if (prefix !== undefined) {
        const bits = Number(prefix);
        if (bits > (family === 4 ? 32 : 128))
          throw new Error('ARISO_TRUSTED_PROXIES: CIDR 前缀超出地址范围');
        trusted.addSubnet(address, bits, family === 4 ? 'ipv4' : 'ipv6');
      } else trusted.addAddress(address, family === 4 ? 'ipv4' : 'ipv6');
    }
  }
  const isTrusted = (ip: string) =>
    trusted.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
  return (peer, forwarded) => {
    let current = normalizeAddress(peer);
    if (!current) return { ip: null, reason: 'peer-unavailable' };
    if (value === 'none' || !isTrusted(current))
      return { ip: current, reason: null };
    const header = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
    if (!header) return { ip: null, reason: 'forwarded-missing' };
    const hops = header.split(',');
    for (let index = hops.length - 1; index >= 0; index--) {
      if (!isTrusted(current)) break;
      const hop = normalizeAddress(hops[index].trim());
      if (!hop) return { ip: null, reason: 'forwarded-invalid' };
      current = hop;
    }
    return { ip: current, reason: null };
  };
}

/** Called before Next handles HTTP: visitors cannot supply these internal headers. */
export function stampClientIp(request: IncomingMessage, resolve: Resolver) {
  delete request.headers[addressHeader];
  delete request.headers[errorHeader];
  const result = resolve(
    request.socket.remoteAddress,
    request.headers['x-forwarded-for'],
  );
  if (result.ip) request.headers[addressHeader] = result.ip;
  else if (result.reason) request.headers[errorHeader] = result.reason;
}

/** Only the controlled HTTP adapter writes this header; never read X-Forwarded-For here. */
export function readClientIp(request: Request) {
  return normalizeAddress(request.headers.get(addressHeader) ?? undefined);
}

export function clientIpStatus(request: Request): {
  ready: boolean;
  message: string | null;
} {
  if (readClientIp(request)) return { ready: true, message: null };
  const reason = request.headers.get(errorHeader);
  return {
    ready: false,
    message:
      reason && Object.hasOwn(reasons, reason)
        ? reasons[reason as keyof typeof reasons]
        : '无法确认真实访客 IP，请通过标准启动入口运行并核对代理配置。',
  };
}
