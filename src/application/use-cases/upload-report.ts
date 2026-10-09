import type { CostReport } from '../../domain/aggregates/cost-report.ts';
import { ObjectStorageNotConfiguredError } from '../errors.ts';
import type { StoragePort } from '../ports/storage.ts';
import type { GenerateReport, GenerateReportInput } from './generate-report.ts';

export interface UploadReportInput extends GenerateReportInput {
  /** Object key prefix inside the bucket (default: "cloudcost"). */
  prefix?: string;
}

export interface UploadedReport {
  url: string;
  key: string;
  filename: string;
  report: CostReport;
}

/**
 * Orchestrates: generate report -> upload the buffer to object storage.
 *
 * Complexity: dominated by GenerateReport; the upload adds one network
 * round trip.
 */
export class UploadReport {
  private readonly generateReport: GenerateReport;
  private readonly storage: StoragePort | null;
  private readonly defaultPrefix: string;

  constructor(
    generateReport: GenerateReport,
    storage: StoragePort | null,
    defaultPrefix = 'cloudcost',
  ) {
    this.generateReport = generateReport;
    this.storage = storage;
    this.defaultPrefix = defaultPrefix;
  }

  async execute(input: UploadReportInput): Promise<UploadedReport> {
    if (this.storage === null) {
      throw new ObjectStorageNotConfiguredError();
    }

    const generated = await this.generateReport.execute(input);

    const rawPrefix = input.prefix ?? this.defaultPrefix;
    const prefix = rawPrefix.replace(/^\/+|\/+$/g, '') || this.defaultPrefix;
    const key = `${prefix}/${generated.filename}`;
    const url = await this.storage.upload(
      key,
      generated.buffer,
      generated.mimeType,
    );

    return {
      url,
      key,
      filename: generated.filename,
      report: generated.report,
    };
  }
}
