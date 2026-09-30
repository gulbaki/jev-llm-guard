#!/usr/bin/env node
import { config } from 'dotenv';
import { createDemoServer } from '../src/web-server.js';

config({ quiet: true });

const port = Number.parseInt(process.env.PORT ?? '4173', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write('PORT 1 ile 65535 arasında olmalı.\n');
  process.exitCode = 1;
} else {
  const server = createDemoServer();
  server.on('error', (error) => {
    process.stderr.write(`Demo başlatılamadı: ${error.code ?? 'sunucu hatası'}\n`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Jev Guard demo: http://127.0.0.1:${port}\n`);
  });
}
