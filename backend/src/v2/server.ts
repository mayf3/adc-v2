import { createV2App } from './app.js';
import { loadV2Config } from './config.js';

const config = loadV2Config();
const app = createV2App({ config });
const server = app.listen(config.port, '127.0.0.1', () => {
  console.info(`ADC V2 listening on http://127.0.0.1:${config.port}`);
});

function shutdown(signal: string) {
  console.info(`ADC V2 received ${signal}, shutting down`);
  server.close((error) => {
    if (error) {
      console.error('ADC V2 shutdown failed', error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
