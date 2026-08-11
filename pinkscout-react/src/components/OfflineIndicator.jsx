import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getOfflineQueueCount,
  isOnline,
  processOfflineQueue,
  registerNetworkListeners
} from '../services/offlineSyncService';
import { saveScoutingData } from '../services/scoutingService';
import { savePitScoutingData } from '../services/pitScoutingService';

/**
 * Syncs only the active signed-in scout's active-team queue. It intentionally
 * renders nothing on the login screen or while membership is unresolved.
 */
export default function OfflineIndicator() {
  const { user, roleContext } = useAuth();
  const scope = useMemo(() => (
    user?.id && roleContext?.activeTeamId
      ? { userId: user.id, teamId: roleContext.activeTeamId }
      : null
  ), [user?.id, roleContext?.activeTeamId]);
  const [online, setOnline] = useState(isOnline());
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  useEffect(() => {
    if (!scope) {
      setPendingCount(0);
      setSyncResult(null);
      return undefined;
    }

    let active = true;
    let clearResultTimer;
    const refreshCount = async () => {
      const count = await getOfflineQueueCount(scope);
      if (active) setPendingCount(count);
      return count;
    };

    const sync = async () => {
      const count = await refreshCount();
      if (!count || !isOnline() || !active) return;
      setSyncing(true);
      try {
        const result = await processOfflineQueue(saveScoutingData, savePitScoutingData, scope);
        if (!active) return;
        setSyncResult(result);
        await refreshCount();
        clearResultTimer = setTimeout(() => active && setSyncResult(null), 3000);
      } catch (error) {
        if (import.meta.env.DEV) console.error('Error syncing offline data:', error);
      } finally {
        if (active) setSyncing(false);
      }
    };

    const handleOnline = () => {
      setOnline(true);
      void sync();
    };
    const handleOffline = () => {
      setOnline(false);
      setSyncResult(null);
    };

    void refreshCount();
    const cleanup = registerNetworkListeners(handleOnline, handleOffline);
    const interval = setInterval(() => void refreshCount(), 5000);

    return () => {
      active = false;
      cleanup();
      clearInterval(interval);
      clearTimeout(clearResultTimer);
    };
  }, [scope]);

  if (!scope || (online && pendingCount === 0 && !syncResult && !syncing)) {
    return null;
  }

  return (
    <div className={`offline-indicator ${online ? 'online' : 'offline'}`}>
      {!online && (
        <div className="offline-banner">
          <span className="offline-icon">📴</span>
          <span className="offline-text">You're offline. Your team data will sync when connected.</span>
          {pendingCount > 0 && <span className="pending-badge">{pendingCount} pending</span>}
        </div>
      )}
      {online && syncing && (
        <div className="sync-banner syncing">
          <span className="sync-icon">🔄</span>
          <span className="sync-text">Syncing your offline data...</span>
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
