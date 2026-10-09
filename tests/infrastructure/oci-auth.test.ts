import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OciAuthError,
  resolveOciCredentials,
} from '../../src/infrastructure/providers/oci/oci-auth.ts';

const ENV_AUTH = {
  OCI_TENANCY_ID: 'ocid1.tenancy.oc1..tenant',
  OCI_USER_ID: 'ocid1.user.oc1..user',
  OCI_FINGERPRINT: '44:32:4f:1c',
  OCI_PRIVATE_KEY:
    '-----BEGIN PRIVATE KEY-----\\nAAA\\n-----END PRIVATE KEY-----',
  OCI_REGION: 'sa-saopaulo-1',
};

describe('resolveOciCredentials', () => {
  it('uses environment credentials when fully provided', () => {
    const credentials = resolveOciCredentials(ENV_AUTH);

    expect(credentials.mode).toBe('env');
    if (credentials.mode !== 'env') {
      return;
    }
    expect(credentials.tenancy).toBe('ocid1.tenancy.oc1..tenant');
    expect(credentials.user).toBe('ocid1.user.oc1..user');
    expect(credentials.fingerprint).toBe('44:32:4f:1c');
    expect(credentials.region).toBe('sa-saopaulo-1');
    expect(credentials.passphrase).toBeNull();
  });

  it('turns literal \\n sequences into real PEM line breaks', () => {
    const credentials = resolveOciCredentials(ENV_AUTH);

    if (credentials.mode !== 'env') {
      throw new Error('expected env mode');
    }
    expect(credentials.privateKey).toContain('\nAAA\n');
    expect(credentials.privateKey).not.toContain('\\n');
  });

  it('accepts the OCID aliases used by the www project', () => {
    const credentials = resolveOciCredentials({
      OCI_TENANCY_OCID: 'ocid1.tenancy.oc1..alias-tenant',
      OCI_USER_OCID: 'ocid1.user.oc1..alias-user',
      OCI_FINGERPRINT: 'aa:bb',
      OCI_PRIVATE_KEY: 'key-material',
    });

    if (credentials.mode !== 'env') {
      throw new Error('expected env mode');
    }
    expect(credentials.tenancy).toBe('ocid1.tenancy.oc1..alias-tenant');
    expect(credentials.user).toBe('ocid1.user.oc1..alias-user');
  });

  it('reads the private key from OCI_PRIVATE_KEY_PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cloudcost-oci-'));
    const keyPath = join(dir, 'oci-key.pem');
    writeFileSync(keyPath, '-----BEGIN PRIVATE KEY-----\nBBB\n');

    try {
      const credentials = resolveOciCredentials({
        ...ENV_AUTH,
        OCI_PRIVATE_KEY: undefined,
        OCI_PRIVATE_KEY_PATH: keyPath,
      });

      if (credentials.mode !== 'env') {
        throw new Error('expected env mode');
      }
      expect(credentials.privateKey).toContain('BBB');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prefers the inline key when both inline and path are set', () => {
    const credentials = resolveOciCredentials({
      ...ENV_AUTH,
      OCI_PRIVATE_KEY_PATH: '/definitely/missing.pem',
    });

    if (credentials.mode !== 'env') {
      throw new Error('expected env mode');
    }
    expect(credentials.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('reports a missing key file clearly', () => {
    expect(() =>
      resolveOciCredentials({
        ...ENV_AUTH,
        OCI_PRIVATE_KEY: undefined,
        OCI_PRIVATE_KEY_PATH: '/definitely/missing.pem',
      }),
    ).toThrow(OciAuthError);

    expect(() =>
      resolveOciCredentials({
        ...ENV_AUTH,
        OCI_PRIVATE_KEY: undefined,
        OCI_PRIVATE_KEY_PATH: '/definitely/missing.pem',
      }),
    ).toThrow(/cannot read OCI_PRIVATE_KEY_PATH/);
  });

  it('falls back to the config file when no OCI variables are set', () => {
    expect(resolveOciCredentials({})).toEqual({
      mode: 'config_file',
      profile: 'DEFAULT',
    });
    expect(
      resolveOciCredentials({
        OCI_PROFILE: 'PROD',
        OCI_REGION: 'us-ashburn-1',
      }),
    ).toEqual({ mode: 'config_file', profile: 'PROD' });
  });

  it('lists every missing variable when env auth is partial', () => {
    let message = '';
    try {
      resolveOciCredentials({ OCI_USER_ID: 'ocid1.user.oc1..user' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('OCI_TENANCY_ID');
    expect(message).toContain('OCI_FINGERPRINT');
    expect(message).toContain('OCI_PRIVATE_KEY');
    expect(message).not.toContain('OCI_USER_ID');
  });

  it('defaults the region to us-ashburn-1', () => {
    const credentials = resolveOciCredentials({
      OCI_TENANCY_ID: 'ocid1.tenancy.oc1..tenant',
      OCI_USER_ID: 'ocid1.user.oc1..user',
      OCI_FINGERPRINT: '44:32:4f:1c',
      OCI_PRIVATE_KEY: 'key-material',
    });

    if (credentials.mode !== 'env') {
      throw new Error('expected env mode');
    }
    expect(credentials.region).toBe('us-ashburn-1');
  });

  it('reads an optional key passphrase', () => {
    const credentials = resolveOciCredentials({
      ...ENV_AUTH,
      OCI_PRIVATE_KEY_PASSPHRASE: 'secret',
    });

    if (credentials.mode !== 'env') {
      throw new Error('expected env mode');
    }
    expect(credentials.passphrase).toBe('secret');
  });
});
