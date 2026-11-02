// Run the server suite as one of N equal shards (Node's --test-shard), for hosted jobs that
// must finish under their 20-minute cap. `RIVER_OAKS_TEST_SHARD=1/2` runs the first half of
// the files by sorted order; unset, it runs them all, exactly like `pnpm run test:server`.
import { spawnSync } from 'node:child_process';
const shard = process.env.RIVER_OAKS_TEST_SHARD ?? '';
if (shard && !/^[1-9]\d*\/[1-9]\d*$/.test(shard)) { console.error(`RIVER_OAKS_TEST_SHARD must look like 1/2, got ${JSON.stringify(shard)}`); process.exit(2); }
const args = ['--test', ...(shard ? [`--test-shard=${shard}`] : []), 'server/tests/*.test.js'];
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
