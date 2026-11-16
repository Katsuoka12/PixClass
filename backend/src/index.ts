import { loadConfig } from './config.js';
import { createPool, createUserStore } from './db.js';
import { createApp } from './app.js';
import { createClassStore } from './class-db.js';
import { createAssignmentStore } from './assignment-db.js';

async function main() {
  const config = loadConfig();
  const pool = createPool(config);
  try {
    await pool.execute('SELECT 1');
  } catch {
    await pool.end();
    throw new Error('Cannot connect to MariaDB. Check DB settings and import schema.sql first.');
  }
  const server = createApp(config, createUserStore(pool), createClassStore(pool), createAssignmentStore(pool)).listen(config.API_PORT, '127.0.0.1', () => {
    console.info(`Student Tag API listening on port ${config.API_PORT}`);
  });
  const shutdown = () => {
    server.close(() => { void pool.end().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'API startup failed');
  process.exitCode = 1;
});
