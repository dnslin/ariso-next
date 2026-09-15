import { createServer } from 'node:http';
import { GET } from '../../../src/app/api/health/route.ts';
import { startServer } from '../../../src/server/startup/server-start.ts';

// 仅由集成测试启动；故障控制走 IPC，不向生产应用添加路由。
const state = startServer();
const server = createServer(async (_request, response) => {
  const health = GET();
  response.writeHead(health.status, Object.fromEntries(health.headers));
  response.end(await health.text());
});
process.on('message', (message) => {
  if (message === 'close-database') {
    state.connection.close();
    process.send?.('database-closed');
  }
});
server.listen(Number(process.env.PORT), '127.0.0.1');
