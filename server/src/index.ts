import { createApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db';

function main(): void {
  const config = loadConfig(process.env);
  const prisma = createDb(config.databaseUrl);
  const app = createApp({ prisma, jwtSecret: config.jwtSecret, cookieSecure: config.cookieSecure });

  const server = app.listen(config.port, () => {
    console.log(`API listening on port ${config.port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
