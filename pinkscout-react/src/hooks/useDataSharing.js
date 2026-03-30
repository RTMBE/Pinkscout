/**
 * =============================================================================
 * USE DATA SHARING HOOK
 * =============================================================================
 * 
 * Custom hook to fetch the user's data sharing preference.
 * Used by pages that need to pass the useAllEventData option to scouting services.
 * 
 * Returns:
 * - useAllEventData: boolean - Whether to fetch data from all teams (default: true)
 * - loading: boolean - Whether the setting is still loading
 * 
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getDataSharingSetting } from '../services/scoutingConfigService';

/**
 * Hook to get the user's data sharing preference
 * @returns {{ useAllEventData: boolean, loading: boolean }}
 */
export function useDataSharing() {
  const { roleContext } = useAuth();
  const [useAllEventData, setUseAllEventData] = useState(true); // Default: use all data
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSetting() {
      // Only team leads can have this setting
      if (!roleContext?.teamLeadUid) {
        setLoading(false);
        return;
      }

      try {
        const setting = await getDataSharingSetting(roleContext.teamLeadUid);
        setUseAllEventData(setting);
      } catch (error) {
        console.error('Error loading data sharing setting:', error);
        // Default to true on error
        setUseAllEventData(true);
      } finally {
        setLoading(false);
      }
    }

    loadSetting();
  }, [roleContext?.teamLeadUid]);

  return { useAllEventData, loading };
}

export default useDataSharing;

