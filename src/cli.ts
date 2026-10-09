#!/usr/bin/env node
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { createCloudCost, DateRange } from './index.ts';
import { createProgram } from './interfaces/cli/program.ts';
import { startServer } from './interfaces/http/server.ts';

const cloudcost = createCloudCost();

const program = createProgram({
  generateReport: (input) => cloudcost.generateReport.execute(input),
  sendReportEmail: (input) => cloudcost.sendReport.execute(input),
  uploadReport: (input) => cloudcost.uploadReport.execute(input),
  startServer: (port) => startServer(port),
  scheduleReports: ({ cron, timezone, provider, days }) => {
    cloudcost.scheduler.schedule(cron, timezone, () =>
      cloudcost.sendReport.execute({
        provider,
        range: DateRange.lastDays(days),
        format: 'xlsx',
      }),
    );
  },
  writeFile: (path, buffer) => writeFileSync(path, buffer),
  print: (text) => console.log(text),
  printBuffer: (buffer) => process.stdout.write(buffer),
});

await program.parseAsync(process.argv);
