/**
 * =============================================================================
 * OFFLINE SYNC SERVICE
 * =============================================================================
 * 
 * PURPOSE:
 * Handles offline scouting data submission when the device has no internet.
 * Data is stored in localStorage and synced when back online.
 * 
 * HOW IT WORKS:
 * 1. When submitting scouting data, check if online
 * 2. If offline, store in localStorage queue
 * 3. When online, process the queue and submit to Supabase
 * 4. Clear items from queue after successful submission
 * 
 * =============================================================================
 */

// Queue key in localStorage
const OFFLINE_QUEUE_KEY = 'pinkscout_offline_queue';

/**
 * Check if the device is currently online
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Get all queued offline submissions
 */
export function getOfflineQueue() {
  try {
    const queue = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
  } catch (error) {
    console.error('Error reading offline queue:', error);
    return [];
  }
}

/**
 * Add an item to the offline queue
 * @param {string} type - Type of submission ('scouting', 'pit_scouting')
 * @param {object} data - The data to submit
 */
export function addToOfflineQueue(type, data) {
  try {
    const queue = getOfflineQueue();
    queue.push({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      type,
      data,
      timestamp: new Date().toISOString(),
      attempts: 0
    });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch (error) {
    console.error('Error adding to offline queue:', error);
    return false;
  }
}

/**
 * Remove an item from the offline queue by ID
 */
export function removeFromOfflineQueue(itemId) {
  try {
    const queue = getOfflineQueue();
    const filteredQueue = queue.filter(item => item.id !== itemId);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filteredQueue));
    return true;
  } catch (error) {
    console.error('Error removing from offline queue:', error);
    return false;
  }
}

/**
 * Clear the entire offline queue
 */
export function clearOfflineQueue() {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing offline queue:', error);
    return false;
  }
}

/**
 * Get the count of pending offline submissions
 */
export function getOfflineQueueCount() {
  return getOfflineQueue().length;
}

/**
 * Process the offline queue when back online
 * @param {function} scoutingSubmitter - Function to submit scouting data
 * @param {function} pitScoutingSubmitter - Function to submit pit scouting data
 * @returns {object} Results of sync { success: number, failed: number }
 */
export async function processOfflineQueue(scoutingSubmitter, pitScoutingSubmitter) {
  if (!isOnline()) {
    return { success: 0, failed: 0, offline: true };
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { success: 0, failed: 0, empty: true };
  }

  let success = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      if (item.type === 'scouting' && scoutingSubmitter) {
        await scoutingSubmitter(item.data);
        removeFromOfflineQueue(item.id);
        success++;
      } else if (item.type === 'pit_scouting' && pitScoutingSubmitter) {
        await pitScoutingSubmitter(item.data);
        removeFromOfflineQueue(item.id);
        success++;
      } else {
        // Unknown type, mark as failed but keep in queue
        failed++;
      }
    } catch (error) {
      console.error(`Failed to sync offline item ${item.id}:`, error);
      failed++;
      // Keep failed items in queue for retry
    }
  }

  return { success, failed };
}

/**
 * Register online/offline event listeners
 * @param {function} onOnline - Callback when device comes online
 * @param {function} onOffline - Callback when device goes offline
 */
export function registerNetworkListeners(onOnline, onOffline) {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

