import { createServer } from 'node:http';
import { GET } from '../../../src/app/api/health/route.ts';
import { startServer } from '../../../src/server/startup/server-start.ts';

// 仅由集成测试启动；故障控制走 IPC，不向生产应用添加路由。
const state = startServer();
let stall: 'headers' | 'body' | undefined;
const server = createServer(async (_request, response) => {
  if (stall === 'headers') return;
  const health = GET();
  response.writeHead(health.status, Object.fromEntries(health.headers));
  if (stall === 'body') {
    response.write('{"status":');
    return;
  }
  response.end(await health.text());
});
process.on('message', (message) => {
  if (message === 'close-database') {
    state.connection.close();
  } else if (message === 'stall-headers') {
    stall = 'headers';
  } else if (message === 'stall-body') {
    stall = 'body';
  } else {
    return;
  }
  process.send?.(message);
});
server.listen(Number(process.env.PORT), '127.0.0.1');
