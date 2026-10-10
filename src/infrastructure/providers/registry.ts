import { CostExplorerClient } from '@aws-sdk/client-cost-explorer';
import { AuditClient } from 'oci-audit';
import {
  type AuthenticationDetailsProvider,
  ConfigFileAuthenticationDetailsProvider,
  ConfigFileReader,
  Region,
  SimpleAuthenticationDetailsProvider,
} from 'oci-common';
import { UsageapiClient } from 'oci-usageapi';
import type { AuditPort } from '../../application/ports/audit.ts';
import type { CostProvider } from '../../application/ports/cost-provider.ts';
import type { AppConfig } from '../../config.ts';
import type { ProviderId } from '../../domain/entities/cost-record.ts';
import {
  AwsCostProvider,
  type CostExplorerLike,
} from './aws/aws-cost-provider.ts';
import {
  type AuditClientLike,
  OciAuditProvider,
} from './oci/oci-audit-provider.ts';
import { resolveOciCredentials } from './oci/oci-auth.ts';
import {
  OciCostProvider,
  type UsageApiClientLike,
} from './oci/oci-cost-provider.ts';

type Env = Record<string, string | undefined>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setRegion<T extends { region?: unknown }>(
  client: T,
  auth: AuthenticationDetailsProvider,
): T {
  const regionProvider = auth as { getRegion?: () => unknown };
  if (typeof regionProvider.getRegion === 'function') {
    client.region = regionProvider.getRegion();
  }
  return client;
}

function createOciAuth(env: Env): {
  auth: AuthenticationDetailsProvider;
  tenancy: string;
} {
  const credentials = resolveOciCredentials(env);

  const auth =
    credentials.mode === 'env'
      ? new SimpleAuthenticationDetailsProvider(
          credentials.tenancy,
          credentials.user,
          credentials.fingerprint,
          credentials.privateKey,
          credentials.passphrase,
          Region.fromRegionId(credentials.region),
        )
      : new ConfigFileAuthenticationDetailsProvider(
          env.OCI_CONFIG_FILE,
          credentials.profile,
        );

  const tenancy =
    credentials.mode === 'env'
      ? credentials.tenancy
      : (ConfigFileReader.parseDefault(credentials.profile).get('tenancy') ??
        undefined);
  if (tenancy === undefined || tenancy === '') {
    throw new Error(
      'unable to resolve the OCI tenancy OCID (set OCI_TENANCY_ID)',
    );
  }

  return { auth, tenancy };
}

function createOciProvider(env: Env): CostProvider {
  const { auth, tenancy } = createOciAuth(env);
  const client = setRegion(
    new UsageapiClient({ authenticationDetailsProvider: auth }),
    auth,
  );
  return new OciCostProvider(client as unknown as UsageApiClientLike, tenancy);
}

function createOciAuditProvider(env: Env): AuditPort {
  const { auth } = createOciAuth(env);
  const client = setRegion(
    new AuditClient({ authenticationDetailsProvider: auth }),
    auth,
  );
  return new OciAuditProvider(client as unknown as AuditClientLike);
}

function createAwsProvider(config: AppConfig['aws']): CostProvider {
  const client = new CostExplorerClient({ region: config.region });
  return new AwsCostProvider(client as unknown as CostExplorerLike);
}

/**
 * Builds every provider the environment can support. Providers that
 * cannot be constructed (missing credentials/config file) are skipped
 * with a warning instead of crashing the process.
 */
export function buildProviders(
  config: AppConfig,
  env: Env = process.env,
): Map<ProviderId, CostProvider> {
  const providers = new Map<ProviderId, CostProvider>();

  try {
    providers.set('oci', createOciProvider(env));
  } catch (error) {
    console.warn(`[cloudcost] OCI provider disabled: ${errorMessage(error)}`);
  }

  try {
    providers.set('aws', createAwsProvider(config.aws));
  } catch (error) {
    console.warn(`[cloudcost] AWS provider disabled: ${errorMessage(error)}`);
  }

  return providers;
}

/**
 * Builds the OCI audit adapter. Audit uses different credentials from
 * billing only in the sense that it needs `read audit-event`; when the
 * caller lacks that permission the returned port rejects at search time
 * with the OCI error rather than silently returning nothing.
 */
export function buildAuditProvider(env: Env = process.env): AuditPort | null {
  try {
    return createOciAuditProvider(env);
  } catch (error) {
    console.warn(`[cloudcost] audit disabled: ${errorMessage(error)}`);
    return null;
  }
}
