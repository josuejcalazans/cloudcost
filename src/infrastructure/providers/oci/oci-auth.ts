import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

export class OciAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OciAuthError';
  }
}

export type OciCredentials =
  | {
      mode: 'env';
      tenancy: string;
      user: string;
      fingerprint: string;
      privateKey: string;
      passphrase: string | null;
      region: string;
    }
  | { mode: 'config_file'; profile: string };

const DEFAULT_REGION = 'us-ashburn-1';
const DEFAULT_PROFILE = 'DEFAULT';

function first(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') {
      return value.trim();
    }
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function expandHome(path: string): string {
  return path.replace(/^~(?=\/|$)/, homedir());
}

export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n');
}

function readPrivateKeyFile(path: string): string {
  try {
    return readFileSync(expandHome(path), 'utf8');
  } catch (error) {
    throw new OciAuthError(
      `cannot read OCI_PRIVATE_KEY_PATH "${path}": ${errorMessage(error)}`,
    );
  }
}

/**
 * Resolves OCI authentication from environment variables first (the same
 * style used by the springbot/www project: tenancy/user/fingerprint/key
 * inline or in a file), falling back to an OCI config-file profile only
 * when none of those variables are set.
 */
export function resolveOciCredentials(
  env: Record<string, string | undefined>,
): OciCredentials {
  const tenancy = first(env.OCI_TENANCY_ID, env.OCI_TENANCY_OCID);
  const user = first(env.OCI_USER_ID, env.OCI_USER_OCID);
  const fingerprint = first(env.OCI_FINGERPRINT);
  const inlineKey = first(env.OCI_PRIVATE_KEY);
  const keyPath = first(env.OCI_PRIVATE_KEY_PATH);

  const hasEnvAuthAttempt =
    [tenancy, user, fingerprint, inlineKey, keyPath].filter(
      (value) => value !== undefined,
    ).length > 0;
  if (!hasEnvAuthAttempt) {
    return {
      mode: 'config_file',
      profile: first(env.OCI_PROFILE) ?? DEFAULT_PROFILE,
    };
  }

  const missing: string[] = [];
  if (tenancy === undefined) {
    missing.push('OCI_TENANCY_ID');
  }
  if (user === undefined) {
    missing.push('OCI_USER_ID');
  }
  if (fingerprint === undefined) {
    missing.push('OCI_FINGERPRINT');
  }

  let privateKey: string | undefined;
  if (inlineKey !== undefined) {
    privateKey = normalizePrivateKey(inlineKey);
  } else if (keyPath !== undefined) {
    privateKey = readPrivateKeyFile(keyPath);
  }
  if (privateKey === undefined || privateKey.trim() === '') {
    missing.push('OCI_PRIVATE_KEY or OCI_PRIVATE_KEY_PATH');
  }

  if (
    missing.length > 0 ||
    tenancy === undefined ||
    user === undefined ||
    fingerprint === undefined ||
    privateKey === undefined
  ) {
    throw new OciAuthError(
      `OCI environment credentials are incomplete — missing ${missing.join(', ')}`,
    );
  }

  return {
    mode: 'env',
    tenancy,
    user,
    fingerprint,
    privateKey,
    passphrase: first(env.OCI_PRIVATE_KEY_PASSPHRASE) ?? null,
    region: first(env.OCI_REGION) ?? DEFAULT_REGION,
  };
}
