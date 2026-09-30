import { createDemoServer } from './src/web-server.js';

const server = createDemoServer();
server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
