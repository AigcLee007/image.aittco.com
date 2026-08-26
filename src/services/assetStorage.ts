import { get, set, del, keys } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import { del, get, keys, set } from 'idb-keyval';

const ASSET_STORE_PREFIX = 'asset-';
const ASSET_META_PREFIX = 'asset-meta-';
export const ASSET_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface AssetMetadata {
  createdAt: number;
}

const assetKey = (assetId: string) => `${ASSET_STORE_PREFIX}${assetId}`;
const metadataKey = (assetId: string) => `${ASSET_META_PREFIX}${assetId}`;

export const assetStorage = {
  /**
   * Stores a blob in IndexedDB and returns a unique asset ID.
   */
  async storeBlob(blob: Blob): Promise<string> {
    const assetId = uuidv4();
    await set(assetKey(assetId), blob);
    await set(metadataKey(assetId), { createdAt: Date.now() } satisfies AssetMetadata);
    return assetId;
  },

  /**
   * Retrieves a blob by asset ID.
   */
  async getBlob(assetId: string): Promise<Blob | undefined> {
    return await get(assetKey(assetId));
  },

  /**
   * Removes a blob by asset ID.
   */
  async deleteBlob(assetId: string): Promise<void> {
    await Promise.all([
      del(assetKey(assetId)),
      del(metadataKey(assetId)),
    ]);
  },

  /** Delete every locally cached asset and its TTL metadata. */
  async clearAll(): Promise<number> {
    const allKeys = await keys();
    const assetKeys = allKeys.filter(
      (key): key is string =>
        typeof key === 'string' &&
        (key.startsWith(ASSET_STORE_PREFIX) || key.startsWith(ASSET_META_PREFIX)),
    );
    await Promise.all([
      ...assetKeys.map((key) => del(key)),
      del('infinitemuse-storage'),
    ]);
    return assetKeys.filter((key) => key.startsWith(ASSET_STORE_PREFIX)).length;
  },

  /** Remove assets older than the local retention window. */
  async cleanupExpiredAssets(now = Date.now()): Promise<number> {
    const allKeys = await keys();
    const metadataKeys = allKeys.filter(
      (key): key is string => typeof key === 'string' && key.startsWith(ASSET_META_PREFIX),
    );
    let removed = 0;

    await Promise.all(metadataKeys.map(async (key) => {
      const assetId = key.slice(ASSET_META_PREFIX.length);
      const metadata = await get<AssetMetadata>(key);
      if (!metadata?.createdAt || now - metadata.createdAt < ASSET_TTL_MS) return;
      await this.deleteBlob(assetId);
      removed += 1;
    }));

    if (removed > 0) {
      console.info(`[AssetStorage] Removed ${removed} expired asset(s)`);
    }
    return removed;
  },

  /**
   * Creates an Object URL for the given asset ID.
   * This handles fetching the blob and creating the URL.
   * Note: The caller is responsible for revoking the URL if needed, 
   * though typically we reuse these for the session lifetime.
   */
  async getAssetUrl(assetId: string): Promise<string | null> {
    const blob = await this.getBlob(assetId);
    if (blob) {
      return URL.createObjectURL(blob);
    }
    return null;
  },

  async getAssetDataUrl(assetId: string): Promise<string | null> {
    const blob = await this.getBlob(assetId);
    if (!blob) return null;

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob as data URL'));
      reader.readAsDataURL(blob);
    });
  },

  async storeDataUrl(dataUrl: string): Promise<string> {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return await this.storeBlob(blob);
  },

};
