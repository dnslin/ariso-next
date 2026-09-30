import type {
  CorsBrowserResult,
  CorsTestSession,
} from '../../server/storage/cors-types.ts';

/** Runs in the owner browser. A server request cannot supply CORS evidence. */
export async function runCorsSample(
  session: CorsTestSession,
  signal: AbortSignal,
): Promise<CorsBrowserResult[]> {
  const results: CorsBrowserResult[] = [];
  let failed = false;
  for (const signed of [session.upload, session.get, session.head]) {
    const result: CorsBrowserResult = {
      method: signed.method,
      status: 0,
      responseType: 'error',
    };
    if (failed) {
      result.error = '前一步未通过，本步未执行';
    } else {
      try {
        signal.throwIfAborted();
        const response = await fetch(signed.url, {
          method: signed.method,
          headers: signed.headers,
          body: signed.method === 'PUT' ? session.payload : undefined,
          mode: 'cors',
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          signal,
        });
        result.status = response.status;
        result.responseType =
          response.type === 'cors' || response.type === 'basic'
            ? response.type
            : 'opaque';
        if (result.responseType === 'opaque') {
          result.error = '浏览器响应不可读，无法证明跨域请求成功';
          await response.body?.cancel();
        } else if (!response.ok) {
          result.error = `${signed.method} 请求失败（HTTP ${response.status}）`;
          await response.body?.cancel();
        } else if (signed.method === 'GET') {
          if ((await response.text()) !== session.payload)
            result.error = '浏览器读取的样本内容不一致';
        } else {
          await response.body?.cancel();
        }
      } catch {
        result.error = signal.aborted
          ? '浏览器检测已中断或超时，服务器将继续清理测试对象'
          : '请检查 CORS 与浏览器网络；可能是跨域规则、DNS 或连接失败';
      }
      failed = !!result.error;
    }
    results.push(result);
  }
  return results;
}
