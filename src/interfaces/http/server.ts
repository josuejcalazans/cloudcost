import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { createCloudCost } from '../../index.ts';
import { createApp } from './app.ts';

export function startServer(port?: number): void {
  const cloudcost = createCloudCost();
  const app = createApp({
    generateReport: cloudcost.generateReport,
    sendReport: cloudcost.sendReport,
    providers: [...cloudcost.providers.keys()],
    apiKey: cloudcost.config.apiKey,
  });

  const listenPort = port ?? cloudcost.config.port;
  app.listen(listenPort, () => {
    console.log(`cloudcost API listening on http://localhost:${listenPort}`);
  });
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) {
  startServer();
}
