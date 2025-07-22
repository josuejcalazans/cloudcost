import type { CachePort } from './application/ports/cache.ts';
import type { CostProvider } from './application/ports/cost-provider.ts';
import type {
  ReportExporter,
  ReportFormat,
} from './application/ports/exporter.ts';
import type { Notifier } from './application/ports/notifier.ts';
import { GenerateReport } from './application/use-cases/generate-report.ts';
import { GetCosts } from './application/use-cases/get-costs.ts';
import { SendReport } from './application/use-cases/send-report.ts';
import { type AppConfig, loadConfig } from './config.ts';
import type { ProviderId } from './domain/entities/cost-record.ts';
import { MemoryCache } from './infrastructure/cache/memory-cache.ts';
import { createDefaultExporters } from './infrastructure/exporters/registry.ts';
import { SmtpMailer } from './infrastructure/mailer/smtp-mailer.ts';
import { buildProviders } from './infrastructure/providers/registry.ts';
import { NodeCronScheduler } from './infrastructure/scheduler/node-cron-scheduler.ts';

export interface CreateCloudCostOptions {
  config?: AppConfig;
  providers?: Map<ProviderId, CostProvider>;
  cache?: CachePort;
  exporters?: Map<ReportFormat, ReportExporter>;
  notifier?: Notifier;
}

/**
 * Composition root: wires ports to adapters and returns the use cases.
 * Every dependency can be overridden for tests or custom integrations.
 */
export function createCloudCost(options: CreateCloudCostOptions = {}) {
  const config = options.config ?? loadConfig();
  const providers = options.providers ?? buildProviders(config);
  const cache = options.cache ?? new MemoryCache();
  const exporters = options.exporters ?? createDefaultExporters();
  const notifier = options.notifier ?? SmtpMailer.fromConfig(config.smtp);

  const getCosts = new GetCosts(
    providers,
    cache,
    config.cacheTtlSeconds * 1000,
  );
  const generateReport = new GenerateReport(getCosts, exporters);
  const sendReport = new SendReport(generateReport, notifier, {
    from: config.mail.from,
    recipients: config.mail.recipients,
  });
  const scheduler = new NodeCronScheduler();

  return {
    config,
    providers,
    cache,
    exporters,
    notifier,
    getCosts,
    generateReport,
    sendReport,
    scheduler,
  };
}

export type CloudCost = ReturnType<typeof createCloudCost>;

export {
  ApplicationError,
  InvalidQueryError,
  MissingRecipientsError,
  ProviderNotConfiguredError,
  UnsupportedFormatError,
} from './application/errors.ts';
export type { CachePort } from './application/ports/cache.ts';
export type {
  CostProvider,
  CostQuery,
} from './application/ports/cost-provider.ts';
export {
  isReportFormat,
  REPORT_FORMATS,
  type ReportExporter,
  type ReportFormat,
} from './application/ports/exporter.ts';
export type {
  Notification,
  Notifier,
} from './application/ports/notifier.ts';
export {
  type GeneratedReport,
  GenerateReport,
  type GenerateReportInput,
} from './application/use-cases/generate-report.ts';
export { GetCosts } from './application/use-cases/get-costs.ts';
export {
  SendReport,
  type SendReportInput,
} from './application/use-cases/send-report.ts';
export { type AppConfig, loadConfig } from './config.ts';
export {
  buildReport,
  type CostReport,
  GROUP_KEYS,
  type GroupKey,
  type ReportGroup,
} from './domain/aggregates/cost-report.ts';
export {
  type CostRecord,
  createCostRecord,
  isProviderId,
  PROVIDER_IDS,
  type ProviderId,
} from './domain/entities/cost-record.ts';
export * from './domain/errors.ts';
export { DateRange } from './domain/value-objects/date-range.ts';
export { Money } from './domain/value-objects/money.ts';
export { MemoryCache } from './infrastructure/cache/memory-cache.ts';
export { createDefaultExporters } from './infrastructure/exporters/registry.ts';
export { SmtpMailer } from './infrastructure/mailer/smtp-mailer.ts';
export { buildProviders } from './infrastructure/providers/registry.ts';
export { NodeCronScheduler } from './infrastructure/scheduler/node-cron-scheduler.ts';
export { type CliDeps, createProgram } from './interfaces/cli/program.ts';
export { type AppDependencies, createApp } from './interfaces/http/app.ts';
