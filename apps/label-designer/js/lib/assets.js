/**
 * Asset Storage Utilities
 * Manages image assets using IndexedDB for large storage capacity (GBs)
 */

const DB_NAME = 'label-designer-db';
const DB_VERSION = 1;
const METADATA_STORE = 'assets-metadata';
const BLOB_STORE = 'assets-blobs';
const ASSETS_STORAGE_KEY = 'label-designer-assets'; // For localStorage migration

// Cache for database instance
let dbInstance = null;

/**
 * Initialize IndexedDB database
 */
async function initDB() {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB not available in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create metadata store if it doesn't exist
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        const metadataStore = db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
        metadataStore.createIndex('name', 'name', { unique: false });
        metadataStore.createIndex('uploadedAt', 'uploadedAt', { unique: false });
      }

      // Create blob store if it doesn't exist
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: 'assetId' });
      }
    };
  });
}

/**
 * Convert data URL to Blob
 */
function dataURLtoBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Convert Blob to data URL
 */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Store asset blob separately from metadata
 */
async function saveAssetBlob(assetId, blob) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([BLOB_STORE], 'readwrite');
    const store = transaction.objectStore(BLOB_STORE);
    const request = store.put({ assetId, blob });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to save blob: ${request.error?.message}`));
  });
}

/**
 * Get asset blob by asset ID
 */
async function getAssetBlob(assetId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([BLOB_STORE], 'readonly');
    const store = transaction.objectStore(BLOB_STORE);
    const request = store.get(assetId);

    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.blob : null);
    };
    request.onerror = () => reject(new Error(`Failed to get blob: ${request.error?.message}`));
  });
}

/**
 * Delete asset blob
 */
async function deleteAssetBlob(assetId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([BLOB_STORE], 'readwrite');
    const store = transaction.objectStore(BLOB_STORE);
    const request = store.delete(assetId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to delete blob: ${request.error?.message}`));
  });
}

/**
 * Get all stored assets (async)
 */
export async function getAllAssets() {
  if (typeof window === 'undefined') return [];

  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([METADATA_STORE], 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => {
        console.error('Failed to load assets:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    return [];
  }
}

/**
 * Save an asset (async)
 */
export async function saveAsset(asset) {
  if (typeof window === 'undefined') return;

  try {
    const db = await initDB();

    // Store metadata
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.put(asset);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to save asset: ${request.error?.message}`));
    });

    // Store blob separately if we have a dataUrl and it's not already stored
    if (asset.dataUrl && !asset.blobStored) {
      try {
        const blob = dataURLtoBlob(asset.dataUrl);
        await saveAssetBlob(asset.id, blob);

        // Update metadata to mark blob as stored
        const updatedAsset = { ...asset, blobStored: true };
        await new Promise((resolve, reject) => {
          const transaction = db.transaction([METADATA_STORE], 'readwrite');
          const store = transaction.objectStore(METADATA_STORE);
          const request = store.put(updatedAsset);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(new Error(`Failed to update asset: ${request.error?.message}`));
        });
      } catch (blobError) {
        console.warn('Failed to store blob, keeping dataUrl:', blobError);
        // Continue without blob storage
      }
    }
  } catch (error) {
    console.error('Failed to save asset:', error);
    throw error;
  }
}

/**
 * Delete an asset (async)
 */
export async function deleteAsset(assetId) {
  if (typeof window === 'undefined') return;

  try {
    const db = await initDB();

    // Delete metadata
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.delete(assetId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to delete asset: ${request.error?.message}`));
    });

    // Delete blob
    try {
      await deleteAssetBlob(assetId);
    } catch (blobError) {
      console.warn('Failed to delete blob:', blobError);
      // Continue even if blob deletion fails
    }
  } catch (error) {
    console.error('Failed to delete asset:', error);
    throw error;
  }
}

/**
 * Get an asset by ID (async)
 */
export async function getAsset(assetId) {
  if (typeof window === 'undefined') return null;

  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([METADATA_STORE], 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.get(assetId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => {
        console.error('Failed to get asset:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Failed to get asset:', error);
    return null;
  }
}

/**
 * Get asset data URL (loads from blob if stored, otherwise uses dataUrl)
 */
export async function getAssetDataUrl(asset) {
  // If blob is stored, load it and convert to data URL
  if (asset.blobStored) {
    try {
      const blob = await getAssetBlob(asset.id);
      if (blob) {
        return await blobToDataURL(blob);
      }
    } catch (error) {
      console.warn('Failed to load blob, falling back to dataUrl:', error);
    }
  }

  // Fallback to dataUrl
  return asset.dataUrl;
}

/**
 * Migrate assets from localStorage to IndexedDB
 */
export async function migrateFromLocalStorage() {
  if (typeof window === 'undefined') return 0;

  try {
    // Check if localStorage has assets
    const stored = localStorage.getItem(ASSETS_STORAGE_KEY);
    if (!stored) {
      return 0;
    }

    const assets = JSON.parse(stored);
    if (assets.length === 0) {
      return 0;
    }

    // Check if already migrated
    const db = await initDB();
    const existingAssets = await getAllAssets();
    if (existingAssets.length > 0) {
      // Already have assets in IndexedDB, skip migration
      return 0;
    }

    // Migrate each asset
    let migratedCount = 0;
    for (const asset of assets) {
      try {
        // Convert dataUrl to blob and store separately
        if (asset.dataUrl) {
          const blob = dataURLtoBlob(asset.dataUrl);
          await saveAssetBlob(asset.id, blob);

          // Mark as blob stored
          const migratedAsset = { ...asset, blobStored: true };
          await saveAsset(migratedAsset);
          migratedCount++;
        } else {
          // No dataUrl, just save metadata
          await saveAsset(asset);
          migratedCount++;
        }
      } catch (error) {
        console.error(`Failed to migrate asset ${asset.id}:`, error);
        // Continue with next asset
      }
    }

    // Clear localStorage after successful migration
    if (migratedCount > 0) {
      localStorage.removeItem(ASSETS_STORAGE_KEY);
    }

    return migratedCount;
  } catch (error) {
    console.error('Failed to migrate from localStorage:', error);
    return 0;
  }
}

/**
 * Process uploaded image file
 */
export async function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      const dataUrl = e.target?.result;
      const img = new Image();

      img.onload = async () => {
        // Estimate DPI (default to 72 if unknown)
        const dpi = 72; // Could be improved with EXIF data

        const asset = {
          id: crypto.randomUUID(),
          name: file.name,
          dataUrl, // Keep for backward compatibility
          width: img.width,
          height: img.height,
          dpi,
          size: file.size,
          uploadedAt: Date.now(),
          blobStored: false, // Will be set to true when saved
        };

        resolve(asset);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = dataUrl;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Get total storage size used
 */
export async function getStorageSize() {
  const assets = await getAllAssets();
  return assets.reduce((total, asset) => total + asset.size, 0);
}

/**
 * Initialize database and run migration on first load
 */
let migrationPromise = null;

export async function initializeAssets() {
  if (migrationPromise) {
    await migrationPromise;
    return;
  }

  migrationPromise = (async () => {
    try {
      // Initialize database
      await initDB();

      // Run migration from localStorage if needed
      const migrated = await migrateFromLocalStorage();
      if (migrated > 0) {
        console.log(`Migrated ${migrated} assets from localStorage to IndexedDB`);
      }

      return migrated;
    } catch (error) {
      console.error('Failed to initialize assets:', error);
      return 0;
    }
  })();

  await migrationPromise;
}
