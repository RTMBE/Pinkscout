/**
 * Private offline submission queue.
 *
 * Pending scouting records live in IndexedDB only while the owner remains
 * signed in. Every item is bound to a user and team, expires after 24 hours,
 * and is refused (then discarded) if a different account attempts a sync.
 * IndexedDB is durability, not encryption; PinkScout clears this queue on
 * logout rather than retaining sensitive data on a shared scouting tablet.
 */

const DATABASE_NAME = 'pinkscout-offline';
const DATABASE_VERSION = 1;
const STORE_NAME = 'submissions';
const LEGACY_QUEUE_KEY = 'pinkscout_offline_queue';
const QUEUE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_QUEUE_ITEMS = 500;

let dbPromise;

function canUseBrowserStorage() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') || `${Date.now()}-${Math.random()}`;
}

function openDatabase() {
  if (!canUseBrowserStorage()) {
    return Promise.reject(new Error('Offline storage is unavailable on this device.'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error || new Error('Unable to open offline storage.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('ownerTeam', ['ownerUserId', 'teamId'], { unique: false });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}

async function requestResult(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    try {
      result = action(store);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.onerror = () => reject(transaction.error || new Error('Offline storage operation failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline storage operation aborted.'));
    transaction.oncomplete = () => resolve(result?.result);
  });
}

async function getAllItems() {
  return requestResult('readonly', (store) => store.getAll());
}

function validScope(scope) {
  return Boolean(scope?.userId && scope?.teamId);
}

function isExpired(item, now = Date.now()) {
  return !item?.expiresAt || new Date(item.expiresAt).getTime() <= now;
}

async function deleteItems(ids) {
  if (!ids.length) return;
  await requestResult('readwrite', (store) => {
    ids.forEach((id) => store.delete(id));
  });
}

async function purgeExpiredItems(items = null) {
  const queue = items || await getAllItems();
  const expiredIds = queue.filter((item) => isExpired(item)).map((item) => item.id);
  await deleteItems(expiredIds);
  return queue.filter((item) => !expiredIds.includes(item.id));
}

/** Check the device network status without crashing non-browser tests. */
export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/**
 * Return only current-user/current-team records. An omitted scope intentionally
 * returns no data so callers cannot accidentally expose another scout's queue.
 */
export async function getOfflineQueue(scope) {
  if (!validScope(scope)) return [];
  try {
    const queue = await purgeExpiredItems();
    return queue.filter((item) =>
      item.ownerUserId === scope.userId && item.teamId === scope.teamId
    );
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error reading offline queue:', error);
    return [];
  }
}

/**
 * Queue a record only after its active user and team have been established.
 */
export async function addToOfflineQueue(type, data, scope = {}) {
  const ownerUserId = scope.userId || data?.scouterUid;
  const teamId = scope.teamId || data?.teamId;
  if (!ownerUserId || !teamId || !['scouting', 'pit_scouting'].includes(type)) {
    return false;
  }

  try {
    const allItems = await purgeExpiredItems();
    if (allItems.length >= MAX_QUEUE_ITEMS) {
      throw new Error('Offline queue is full. Reconnect and sync before adding more entries.');
    }

    const now = new Date();
    const id = makeId();
    const idempotencyKey = typeof data?.idempotencyKey === 'string' && data.idempotencyKey.length >= 16
      ? data.idempotencyKey
      : makeId();
    const item = {
      id,
      idempotencyKey,
      schemaVersion: 1,
      type,
      // Copy so later form mutations do not alter a queued payload.
      // Keep the same key in the submitted payload. A retry after a timeout
      // must resolve to the original write instead of creating a duplicate.
      data: { ...data, teamId, idempotencyKey },
      ownerUserId,
      teamId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + QUEUE_TTL_MS).toISOString(),
      attempts: 0
    };
    await requestResult('readwrite', (store) => store.add(item));
    return true;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error adding to offline queue:', error);
    return false;
  }
}

export async function removeFromOfflineQueue(itemId) {
  try {
    await deleteItems([itemId]);
    return true;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error removing offline queue item:', error);
    return false;
  }
}

/** Clear every queued record on logout/account switch. */
export async function clearOfflineQueue() {
  try {
    if (canUseBrowserStorage()) {
      await requestResult('readwrite', (store) => store.clear());
    }
    // Remove the previous unscoped localStorage queue during the transition.
    globalThis.localStorage?.removeItem(LEGACY_QUEUE_KEY);
    return true;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error clearing offline queue:', error);
    return false;
  }
}

export async function getOfflineQueueCount(scope) {
  return (await getOfflineQueue(scope)).length;
}

/**
 * Process only the exact active owner/team queue. Mismatched or expired items
 * are deleted rather than being submitted under whoever next signs in.
 */
export async function processOfflineQueue(scoutingSubmitter, pitScoutingSubmitter, scope) {
  if (!validScope(scope)) return { success: 0, failed: 0, skipped: true };
  if (!isOnline()) return { success: 0, failed: 0, offline: true };

  let allItems;
  try {
    allItems = await purgeExpiredItems();
  } catch (error) {
    if (import.meta.env.DEV) console.error('Unable to read offline queue:', error);
    return { success: 0, failed: 0, skipped: true };
  }

  const mismatchedIds = allItems
    .filter((item) => item.ownerUserId !== scope.userId || item.teamId !== scope.teamId)
    .map((item) => item.id);
  await deleteItems(mismatchedIds);

  const queue = allItems.filter((item) =>
    item.ownerUserId === scope.userId && item.teamId === scope.teamId
  );
  if (!queue.length) return { success: 0, failed: 0, empty: true };

  let success = 0;
  let failed = 0;
  for (const item of queue) {
    try {
      if (item.type === 'scouting' && scoutingSubmitter) {
        await scoutingSubmitter({
          ...item.data,
          idempotencyKey: item.data?.idempotencyKey || item.idempotencyKey
        });
      } else if (item.type === 'pit_scouting' && pitScoutingSubmitter) {
        await pitScoutingSubmitter({
          ...item.data,
          idempotencyKey: item.data?.idempotencyKey || item.idempotencyKey
        });
      } else {
        failed += 1;
        continue;
      }
      await removeFromOfflineQueue(item.id);
      success += 1;
    } catch (error) {
      if (import.meta.env.DEV) console.error(`Failed to sync offline item ${item.id}:`, error);
      failed += 1;
    }
  }
  return { success, failed };
}

/** Remove legacy Workbox caches that could contain authenticated responses. */
export async function purgeLegacyPrivateCaches() {
  if (!('caches' in globalThis)) return;
  const privateNames = new Set(['supabase-cache', 'tba-api-cache', 'statbotics-api-cache']);
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => privateNames.has(name) || name.startsWith('pinkscout-private-'))
      .map((name) => caches.delete(name))
  );
}

export function registerNetworkListeners(onOnline, onOffline) {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
