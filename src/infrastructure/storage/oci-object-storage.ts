import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { StoragePort } from '../../application/ports/storage.ts';

export interface ObjectStorageConfig {
  namespace: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Structural subset of the AWS S3 client needed for uploads. */
export interface S3ClientLike {
  send(command: PutObjectCommand): Promise<unknown>;
}

export function isObjectStorageConfigured(
  config: ObjectStorageConfig,
): boolean {
  return Boolean(
    config.namespace &&
      config.bucket &&
      config.accessKeyId &&
      config.secretAccessKey,
  );
}

export function objectStorageUrl(
  config: ObjectStorageConfig,
  key: string,
): string {
  return `https://${config.namespace}.compat.objectstorage.${config.region}.oraclecloud.com/${config.bucket}/${key}`;
}

/**
 * Mirrors the sanitize rules used by springbot saas-lead-backend-resolution
 * (spaces to underscore, strip accents, drop unsafe characters), while
 * keeping "/", "-", "." and "_" so keys stay readable and keep extensions.
 * Repeated separators collapse and leading "."/"-" segments are dropped so
 * keys can never escape the bucket root.
 */
export function sanitizeObjectName(name: string): string {
  return name
    .replace(/\s/g, '_')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9_./-]/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/\/{2,}/g, '/')
    .replace(/^[./]+/, '');
}

export class OciObjectStorage implements StoragePort {
  private readonly config: ObjectStorageConfig;
  private readonly client: S3ClientLike;

  constructor(config: ObjectStorageConfig, client: S3ClientLike) {
    this.config = config;
    this.client = client;
  }

  async upload(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    const safeKey = sanitizeObjectName(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: safeKey,
        Body: body,
        ContentType: contentType,
      }),
    );
    return objectStorageUrl(this.config, safeKey);
  }
}
