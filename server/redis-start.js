import { createRedisBackend } from './redis-backend.js';
const backend = await createRedisBackend();
const port = Number(process.env.PORT ?? 8787);
backend.server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`River Oaks shared API listening on port ${port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => backend.close().then(() => process.exit(0)));
