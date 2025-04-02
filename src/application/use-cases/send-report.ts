import type { GroupKey } from '../../domain/aggregates/cost-report.ts';
import type { ProviderId } from '../../domain/entities/cost-record.ts';
import type { DateRange } from '../../domain/value-objects/date-range.ts';
import { MissingRecipientsError } from '../errors.ts';
import type { ReportFormat } from '../ports/exporter.ts';
import type { Notification, Notifier } from '../ports/notifier.ts';
import type { GeneratedReport, GenerateReport } from './generate-report.ts';

export interface SendReportInput {
  provider: ProviderId;
  range: DateRange;
  groupBy?: GroupKey;
  format?: ReportFormat;
  recipients?: string[];
}

export interface MailDefaults {
  from: string;
  recipients: string[];
}

function money(currency: string, amount: number): string {
  return `${currency} ${amount.toFixed(2)}`;
}

/**
 * Generates a report and delivers it by email as an attachment.
 *
 * Complexity: O(n + k log k) inherited from report generation; the body
 * only renders the top 5 groups (O(1)).
 */
export class SendReport {
  private readonly generateReport: GenerateReport;
  private readonly notifier: Notifier;
  private readonly defaults: MailDefaults;

  constructor(
    generateReport: GenerateReport,
    notifier: Notifier,
    defaults: MailDefaults,
  ) {
    this.generateReport = generateReport;
    this.notifier = notifier;
    this.defaults = defaults;
  }

  async execute(input: SendReportInput): Promise<GeneratedReport> {
    const recipients =
      input.recipients && input.recipients.length > 0
        ? input.recipients
        : this.defaults.recipients;
    if (recipients.length === 0) {
      throw new MissingRecipientsError();
    }

    const generated = await this.generateReport.execute(input);
    const { report } = generated;
    const total = money(report.currency, report.total);

    const topGroups = report.groups
      .slice(0, 5)
      .map(
        (group) =>
          `- ${group.key}: ${money(report.currency, group.amount)} (${(group.share * 100).toFixed(1)}%)`,
      )
      .join('\n');

    const notification: Notification = {
      from: this.defaults.from,
      to: recipients,
      subject: `cloudcost report · ${input.provider} · ${report.range.from}..${report.range.to} · ${total}`,
      text: [
        `Provider: ${input.provider}`,
        `Range: ${report.range.from}..${report.range.to}`,
        `Currency: ${report.currency}`,
        `Total: ${total}`,
        '',
        'Top costs:',
        topGroups || '- (no usage in this range)',
      ].join('\n'),
      attachments: [
        {
          filename: generated.filename,
          content: generated.buffer,
          contentType: generated.mimeType,
        },
      ],
    };

    await this.notifier.send(notification);
    return generated;
  }
}
