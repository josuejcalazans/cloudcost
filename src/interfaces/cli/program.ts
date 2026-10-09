import { Command } from 'commander';
import { isReportFormat } from '../../application/ports/exporter.ts';
import type {
  GeneratedReport,
  GenerateReportInput,
} from '../../application/use-cases/generate-report.ts';
import type { SendReportInput } from '../../application/use-cases/send-report.ts';
import type {
  UploadedReport,
  UploadReportInput,
} from '../../application/use-cases/upload-report.ts';
import {
  type GroupKey,
  isGroupKey,
} from '../../domain/aggregates/cost-report.ts';
import {
  isProviderId,
  type ProviderId,
} from '../../domain/entities/cost-record.ts';
import { DateRange } from '../../domain/value-objects/date-range.ts';

export interface CliDeps {
  generateReport(input: GenerateReportInput): Promise<GeneratedReport>;
  sendReportEmail(input: SendReportInput): Promise<GeneratedReport>;
  uploadReport(input: UploadReportInput): Promise<UploadedReport>;
  startServer(port?: number): void;
  scheduleReports(options: {
    cron: string;
    timezone: string;
    provider: ProviderId;
    days: number;
  }): void;
  writeFile(path: string, buffer: Buffer): void;
  print(text: string): void;
  printBuffer(buffer: Buffer): void;
}

function requireProvider(value: string): ProviderId {
  if (!isProviderId(value)) {
    throw new Error(`unknown provider "${value}" (expected oci or aws)`);
  }
  return value;
}

function requireGroupKey(value: string): GroupKey {
  if (!isGroupKey(value)) {
    throw new Error(
      `unknown group_by "${value}" (expected service, region, day or provider)`,
    );
  }
  return value;
}

function requireFormat(value: string) {
  if (!isReportFormat(value)) {
    throw new Error(
      `unknown format "${value}" (expected json, csv, xlsx, zip or pdf)`,
    );
  }
  return value;
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`expected a number, received "${value}"`);
  }
  return parsed;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function requireCompareRange(options: {
  compareFrom?: string;
  compareTo?: string;
}): DateRange | undefined {
  const { compareFrom, compareTo } = options;
  if (compareFrom === undefined && compareTo === undefined) {
    return undefined;
  }
  if (compareFrom === undefined || compareTo === undefined) {
    throw new Error('use --compare-from and --compare-to together');
  }
  return DateRange.of(compareFrom, compareTo);
}

export function createProgram(deps: CliDeps): Command {
  const program = new Command();
  program
    .name('cloudcost')
    .description(
      'Multi-cloud cost intelligence for OCI and AWS: reports, exports and schedules',
    )
    .version('0.1.0');

  program
    .command('costs')
    .description('fetch costs and export a report')
    .requiredOption('--provider <id>', 'cloud provider: oci or aws')
    .requiredOption('--from <date>', 'start date, YYYY-MM-DD (inclusive)')
    .requiredOption('--to <date>', 'end date, YYYY-MM-DD (exclusive)')
    .option('--group-by <key>', 'service | region | day | provider', 'service')
    .option('--format <format>', 'json | csv | xlsx | zip | pdf', 'json')
    .option('--out <file>', 'write the report to a file instead of stdout')
    .option('--title <text>', 'report title rendered by rich formats')
    .option(
      '--compare-from <date>',
      'comparison start date, YYYY-MM-DD (inclusive)',
    )
    .option(
      '--compare-to <date>',
      'comparison end date, YYYY-MM-DD (exclusive)',
    )
    .option('--upload', 'upload the report to object storage')
    .option('--prefix <prefix>', 'object storage key prefix', 'cloudcost')
    .action(async (options: Record<string, string | boolean>) => {
      if (options.upload !== undefined && options.out !== undefined) {
        throw new Error('use either --out or --upload, not both');
      }

      const compareRange = requireCompareRange({
        compareFrom: options.compareFrom as string | undefined,
        compareTo: options.compareTo as string | undefined,
      });
      const common = {
        provider: requireProvider(options.provider as string),
        range: DateRange.of(options.from as string, options.to as string),
        groupBy: requireGroupKey(options.groupBy as string),
        format: requireFormat(options.format as string),
        ...(options.title !== undefined
          ? { title: options.title as string }
          : {}),
        ...(compareRange !== undefined ? { compareRange } : {}),
      };

      if (options.upload !== undefined) {
        const uploaded = await deps.uploadReport({
          ...common,
          prefix: options.prefix as string,
        });
        deps.print(`uploaded ${uploaded.url}`);
        return;
      }

      const generated = await deps.generateReport(common);
      if (options.out !== undefined) {
        deps.writeFile(options.out as string, generated.buffer);
        deps.print(
          `wrote ${options.out} (${generated.report.total} ${generated.report.currency})`,
        );
      } else {
        deps.printBuffer(generated.buffer);
      }
    });

  program
    .command('report')
    .description('report commands')
    .command('email')
    .description('generate a report and email it as an attachment')
    .requiredOption('--provider <id>', 'cloud provider: oci or aws')
    .requiredOption('--from <date>', 'start date, YYYY-MM-DD (inclusive)')
    .requiredOption('--to <date>', 'end date, YYYY-MM-DD (exclusive)')
    .option('--group-by <key>', 'service | region | day | provider', 'service')
    .option('--format <format>', 'json | csv | xlsx | zip | pdf', 'csv')
    .option(
      '--recipient <email>',
      'recipient address (repeatable)',
      collect,
      [] as string[],
    )
    .action(async (options: Record<string, string | string[]>) => {
      const recipients = options.recipient as string[];
      const generated = await deps.sendReportEmail({
        provider: requireProvider(options.provider as string),
        range: DateRange.of(options.from as string, options.to as string),
        groupBy: requireGroupKey(options.groupBy as string),
        format: requireFormat(options.format as string),
        ...(recipients.length > 0 ? { recipients } : {}),
      });
      deps.print(
        `report sent: ${generated.filename} (${generated.report.total} ${generated.report.currency})`,
      );
    });

  program
    .command('schedule')
    .description('run recurring email reports on a cron schedule')
    .option('--provider <id>', 'cloud provider: oci or aws', 'oci')
    .option('--cron <expression>', 'cron expression', '0 7 * * 1')
    .option('--timezone <timezone>', 'IANA timezone', 'America/Sao_Paulo')
    .option('--days <n>', 'rolling window in days', parseIntOption, 30)
    .action((options: Record<string, string | number>) => {
      const provider = requireProvider(options.provider as string);
      deps.scheduleReports({
        cron: options.cron as string,
        timezone: options.timezone as string,
        provider,
        days: options.days as number,
      });
      deps.print(
        `scheduled "${options.cron}" (${options.timezone}) for ${provider}, last ${options.days} days`,
      );
    });

  program
    .command('serve')
    .description('start the HTTP API')
    .option('--port <port>', 'HTTP port', parseIntOption)
    .action((options: Record<string, number | undefined>) => {
      deps.startServer(options.port);
    });

  return program;
}
