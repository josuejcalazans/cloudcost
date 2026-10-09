export interface AppConfig {
  port: number;
  apiKey: string | undefined;
  cacheTtlSeconds: number;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
  };
  mail: {
    from: string;
    recipients: string[];
  };
  report: {
    cron: string;
    timezone: string;
  };
  oci: {
    profile: string;
  };
  objectStorage: {
    namespace: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  aws: {
    region: string;
    accountIds: string[];
  };
}

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function parseIntOr(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  return {
    port: parseIntOr(env.PORT, 3000),
    apiKey: env.API_KEY || undefined,
    cacheTtlSeconds: parseIntOr(env.CACHE_TTL_SECONDS, 300),
    smtp: {
      host: env.SMTP_HOST ?? 'localhost',
      port: parseIntOr(env.SMTP_PORT, 587),
      secure: (env.SMTP_SECURE ?? 'false') === 'true',
      user: env.SMTP_USER || undefined,
      pass: env.SMTP_PASS || undefined,
    },
    mail: {
      from: env.MAIL_FROM ?? 'cloudcost@example.com',
      recipients: parseList(env.MAIL_TO),
    },
    report: {
      cron: env.REPORT_CRON ?? '0 7 * * 1',
      timezone: env.REPORT_TIMEZONE ?? 'America/Sao_Paulo',
    },
    oci: {
      profile: env.OCI_PROFILE ?? 'DEFAULT',
    },
    objectStorage: {
      namespace: env.OCI_NAMESPACE ?? '',
      bucket: env.OCI_BUCKET ?? '',
      region: env.OCI_REGION ?? 'us-ashburn-1',
      accessKeyId: env.OCI_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.OCI_SECRET_ACCESS_KEY ?? '',
    },
    aws: {
      region: env.AWS_REGION ?? 'us-east-1',
      accountIds: parseList(env.AWS_ACCOUNT_IDS),
    },
  };
}
