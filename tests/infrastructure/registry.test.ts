import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.ts';
import { AwsCostProvider } from '../../src/infrastructure/providers/aws/aws-cost-provider.ts';
import { buildProviders } from '../../src/infrastructure/providers/registry.ts';

describe('buildProviders', () => {
  it('always registers the AWS provider and never throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const providers = buildProviders(loadConfig({}), {});

    expect(providers).toBeInstanceOf(Map);
    expect(providers.get('aws')).toBeInstanceOf(AwsCostProvider);
    expect(providers.get('aws')?.id).toBe('aws');
    warn.mockRestore();
  });

  it('warns instead of crashing when OCI cannot be constructed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const providers = buildProviders(loadConfig({}), {
      OCI_USER_ID: 'ocid1.user..x',
      OCI_FINGERPRINT: 'aa:bb',
      OCI_PRIVATE_KEY: 'not-a-key',
      OCI_TENANCY_OCID: '',
    });

    expect(providers.has('oci')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('OCI provider disabled'),
    );
    warn.mockRestore();
  });
});
