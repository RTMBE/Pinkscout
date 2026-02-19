/**
 * =============================================================================
 * OFFLINE INDICATOR COMPONENT
 * =============================================================================
 * 
 * PURPOSE:
 * Shows a banner when the device is offline and displays count of pending
 * submissions waiting to sync.
 * 
 * PLACEMENT:
 * Should be placed at the top of the app layout, visible on all pages.
 * 
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { 
  isOnline, 
  getOfflineQueueCount, 
  registerNetworkListeners,
  processOfflineQueue 
} from '../services/offlineSyncService';
import { saveScoutingData } from '../services/scoutingService';
import { savePitScoutingData } from '../services/pitScoutingService';

export default function OfflineIndicator() {
  const [online, setOnline] = useState(isOnline());
  const [pendingCount, setPendingCount] = useState(getOfflineQueueCount());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  useEffect(() => {
    // Handle coming back online - auto-sync
    const handleOnline = async () => {
      setOnline(true);
      const count = getOfflineQueueCount();
      setPendingCount(count);
      
      if (count > 0) {
        setSyncing(true);
        try {
          const result = await processOfflineQueue(saveScoutingData, savePitScoutingData);
          setSyncResult(result);
          setPendingCount(getOfflineQueueCount());
          // Clear result after 3 seconds
          setTimeout(() => setSyncResult(null), 3000);
        } catch (error) {
          console.error('Error syncing offline data:', error);
        } finally {
          setSyncing(false);
        }
      }
    };

    const handleOffline = () => {
      setOnline(false);
      setSyncResult(null);
    };

    // Register event listeners
    const cleanup = registerNetworkListeners(handleOnline, handleOffline);

    // Check pending count periodically when offline
    const interval = setInterval(() => {
      setPendingCount(getOfflineQueueCount());
    }, 5000);

    return () => {
      cleanup();
      clearInterval(interval);
    };
  }, []);

  // Don't render if online and no pending items and no sync result
  if (online && pendingCount === 0 && !syncResult && !syncing) {
    return null;
  }

  return (
    <div className={`offline-indicator ${online ? 'online' : 'offline'}`}>
      {!online && (
        <div className="offline-banner">
          <span className="offline-icon">📴</span>
          <span className="offline-text">
            You're offline. Data will sync when connected.
          </span>
          {pendingCount > 0 && (
            <span className="pending-badge">{pendingCount} pending</span>
          )}
        </div>
      )}
      
      {online && syncing && (
        <div className="sync-banner syncing">
          <span className="sync-icon">🔄</span>
          <span className="sync-text">Syncing offline data...</span>
        </div>
      )}
      
      {online && syncResult && !syncing && (
        <div className="sync-banner sync-complete">
          <span className="sync-icon">✅</span>
          <span className="sync-text">
            Synced {syncResult.success} item{syncResult.success !== 1 ? 's' : ''}
            {syncResult.failed > 0 && ` (${syncResult.failed} failed)`}
          </span>
        </div>
      )}
    </div>
  );
}

