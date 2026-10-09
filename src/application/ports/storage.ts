/**
 * Minimal object storage contract used to publish generated reports
 * (PDF, CSV, ...) to an external bucket such as OCI Object Storage.
 */
export interface StoragePort {
  /**
   * Uploads the body under the given object key and returns the public
   * (or presigned) URL of the stored object.
   */
  upload(key: string, body: Buffer, contentType: string): Promise<string>;
}
