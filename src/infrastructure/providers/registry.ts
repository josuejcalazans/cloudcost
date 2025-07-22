import { CostExplorerClient } from '@aws-sdk/client-cost-explorer';
import {
  ConfigFileAuthenticationDetailsProvider,
  ConfigFileReader,
  Region,
  SimpleAuthenticationDetailsProvider,
} from 'oci-common';
import { UsageapiClient } from 'oci-usageapi';
import type { CostProvider } from '../../application/ports/cost-provider.ts';
import type { AppConfig } from '../../config.ts';
import type { ProviderId } from '../../domain/entities/cost-record.ts';
import {
  AwsCostProvider,
  type CostExplorerLike,
} from './aws/aws-cost-provider.ts';
import {
  OciCostProvider,
  type UsageApiClientLike,
} from './oci/oci-cost-provider.ts';

type Env = Record<string, string | undefined>;

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, '\n');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createOciProvider(config: AppConfig['oci'], env: Env): CostProvider {
  const hasEnvAuth =
    (env.OCI_USER_ID ?? '') !== '' &&
    (env.OCI_FINGERPRINT ?? '') !== '' &&
    (env.OCI_PRIVATE_KEY ?? '') !== '';

  const auth = hasEnvAuth
    ? new SimpleAuthenticationDetailsProvider(
        env.OCI_TENANCY_OCID ?? env.OCI_TENANCY_ID ?? '',
        env.OCI_USER_ID ?? '',
        env.OCI_FINGERPRINT ?? '',
        normalizePrivateKey(env.OCI_PRIVATE_KEY ?? ''),
        env.OCI_PRIVATE_KEY_PASSPHRASE ?? null,
        Region.fromRegionId(env.OCI_REGION ?? 'us-ashburn-1'),
      )
    : new ConfigFileAuthenticationDetailsProvider(
        env.OCI_CONFIG_FILE,
        config.profile,
      );

  const configFileTenancy = hasEnvAuth
    ? undefined
    : (ConfigFileReader.parseDefault(config.profile).get('tenancy') ??
      undefined);
  const tenancy =
    env.OCI_TENANCY_OCID ?? env.OCI_TENANCY_ID ?? configFileTenancy;
  if (tenancy === undefined || tenancy === '') {
    throw new Error(
      'unable to resolve the OCI tenancy OCID (set OCI_TENANCY_OCID)',
    );
  }

  const client = new UsageapiClient({ authenticationDetailsProvider: auth });
  const regionProvider = auth as { getRegion?: () => unknown };
  if (typeof regionProvider.getRegion === 'function') {
    (client as { region?: unknown }).region = regionProvider.getRegion();
  }

  return new OciCostProvider(client as unknown as UsageApiClientLike, tenancy);
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
    providers.set('oci', createOciProvider(config.oci, env));
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
