import { createTown } from './town.js';

// `npm start` serves the built frontend and the town from this one process.
// `npm run server -- --dev` pairs it with a separate Vite dev server instead.
const dev = process.argv.includes('--dev');
// In --dev, a production PUBLIC_ORIGIN copied from .env.example never points
// the local town at the live site; only a loopback origin is honoured.
const configured = process.env.PUBLIC_ORIGIN;
const loopback = value => { try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname); } catch { return false; } };
const origin = dev ? (loopback(configured) ? configured : 'http://127.0.0.1:5173') : configured ?? 'http://localhost:8787';
const town = await createTown({ origin });
const port = Number(process.env.PORT ?? 8787);
town.server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  const signIn = town.auth === 'local' ? 'local development identities (no WorkOS)' : 'WorkOS';
  console.log(`River Oaks multiplayer listening on port ${port}; public origin ${origin}; sign-in: ${signIn}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => town.close().then(() => process.exit(0)));
