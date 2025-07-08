import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import {
  ApplicationError,
  InvalidQueryError,
  ProviderNotConfiguredError,
} from '../../application/errors.ts';
import { isReportFormat } from '../../application/ports/exporter.ts';
import type { GenerateReport } from '../../application/use-cases/generate-report.ts';
import type { SendReport } from '../../application/use-cases/send-report.ts';
import {
  type GroupKey,
  isGroupKey,
} from '../../domain/aggregates/cost-report.ts';
import {
  isProviderId,
  type ProviderId,
} from '../../domain/entities/cost-record.ts';
import { DomainError } from '../../domain/errors.ts';
import { DateRange } from '../../domain/value-objects/date-range.ts';

export interface AppDependencies {
  generateReport: GenerateReport;
  sendReport: SendReport;
  providers: readonly ProviderId[];
  apiKey?: string | undefined;
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

interface ReportQuery {
  provider: ProviderId;
  range: DateRange;
  groupBy: GroupKey;
  format: ReturnType<typeof normalizeFormat>;
}

function normalizeFormat(value: string | undefined, fallback = 'json') {
  const format = value ?? fallback;
  if (!isReportFormat(format)) {
    throw new InvalidQueryError(
      `unknown format "${format}" (expected json, csv, xlsx or zip)`,
    );
  }
  return format;
}

function parseReportQuery(
  source: Record<string, unknown>,
  providers: readonly ProviderId[],
  fallbackFormat?: 'csv',
): ReportQuery {
  const provider = queryString(source.provider);
  if (provider === undefined || !isProviderId(provider)) {
    throw new InvalidQueryError(
      `unknown provider "${String(provider)}" (expected oci or aws)`,
    );
  }
  if (!providers.includes(provider)) {
    throw new ProviderNotConfiguredError(provider);
  }

  const from = queryString(source.from);
  const to = queryString(source.to);
  if (from === undefined || to === undefined) {
    throw new InvalidQueryError('from and to are required (YYYY-MM-DD)');
  }

  const groupBy = queryString(source.group_by) ?? 'service';
  if (!isGroupKey(groupBy)) {
    throw new InvalidQueryError(
      `unknown group_by "${groupBy}" (expected service, region, day or provider)`,
    );
  }

  return {
    provider,
    range: DateRange.of(from, to),
    groupBy,
    format: normalizeFormat(queryString(source.format), fallbackFormat),
  };
}

function statusFor(error: unknown): number {
  if (error instanceof ProviderNotConfiguredError) {
    return 404;
  }
  if (error instanceof DomainError || error instanceof ApplicationError) {
    return 400;
  }
  return 500;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  if (deps.apiKey !== undefined) {
    app.use('/api', (req, res, next) => {
      if (req.header('x-api-key') === deps.apiKey) {
        next();
        return;
      }
      res.status(401).json({ error: 'unauthorized' });
    });
  }

  app.get(
    '/api/v1/costs',
    asyncHandler(async (req, res) => {
      const query = parseReportQuery(req.query, deps.providers);
      const generated = await deps.generateReport.execute(query);
      res
        .status(200)
        .set({
          'Content-Type': generated.mimeType,
          'Content-Disposition': `attachment; filename="${generated.filename}"`,
        })
        .send(generated.buffer);
    }),
  );

  app.post(
    '/api/v1/reports/email',
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const query = parseReportQuery(body, deps.providers, 'csv');
      const recipients = Array.isArray(body.recipients)
        ? body.recipients.filter(
            (recipient): recipient is string => typeof recipient === 'string',
          )
        : undefined;

      const generated = await deps.sendReport.execute({
        ...query,
        ...(recipients !== undefined && recipients.length > 0
          ? { recipients }
          : {}),
      });

      res.status(200).json({
        status: 'sent',
        filename: generated.filename,
        total: generated.report.total,
        currency: generated.report.currency,
      });
    }),
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const status = statusFor(error);
      const message =
        error instanceof Error ? error.message : 'internal server error';
      if (status === 500) {
        console.error('[cloudcost] request failed:', error);
      }
      res.status(status).json({ error: message });
    },
  );

  return app;
}
