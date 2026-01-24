/**
 * =============================================================================
 * STATBOTICSAPI.JS - Statbotics API Service
 * =============================================================================
 * 
 * WHAT IS STATBOTICS?
 * Statbotics provides statistical analysis for FRC teams including:
 * - EPA (Expected Points Added) ratings
 * - Team rankings
 * - Historical performance data
 * 
 * API DOCUMENTATION: https://api.statbotics.io/
 * 
 * NOTE: Statbotics is a public API - no authentication required
 * 
 * =============================================================================
 */

import { API_URLS } from './supabase';

// =============================================================================
// IN-MEMORY CACHE FOR PERFORMANCE
// =============================================================================

const cache = new Map();
const CACHE_TTL = {
  team: 30 * 60 * 1000,       // 30 minutes for team data
  teamEvent: 5 * 60 * 1000,   // 5 minutes for team-event data (updates during events)
  eventStats: 5 * 60 * 1000,  // 5 minutes for event stats
  teamYear: 60 * 60 * 1000,   // 1 hour for yearly stats (historical)
  topTeams: 30 * 60 * 1000    // 30 minutes for world rankings
};

/**
 * Get cached data or null if expired/missing
 */
function getFromCache(key, ttl) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }
  return null;
}

/**
 * Store data in cache with timestamp
 */
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Clear specific cache key or all cache
 */
export function clearCache(key = null) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

// =============================================================================
// GET TEAM DATA
// =============================================================================

/**
 * Fetch team data from Statbotics
 *
 * @param {string|number} teamNumber - FRC team number
 * @returns {Object|null} - Team data or null if not found
 */
export async function getStatboticsTeam(teamNumber) {
  const cacheKey = `team/${teamNumber}`;
  const cached = getFromCache(cacheKey, CACHE_TTL.team);
  if (cached !== null) return cached;

  try {
    const response = await fetch(`${API_URLS.STATBOTICS}/team/${teamNumber}`);

    if (!response.ok) {
      if (response.status === 404) {
        if (import.meta.env.DEV) {
          console.log(`Team ${teamNumber} not found in Statbotics`);
        }
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Statbotics API error:', error);
    }
    return null;
  }
}

// =============================================================================
// GET TEAM EVENT DATA
// =============================================================================

/**
 * Fetch team's data for a specific event from Statbotics
 *
 * @param {string|number} teamNumber - FRC team number
 * @param {string} eventKey - Event key (e.g., "2024casj")
 * @returns {Object|null} - Team event data or null if not found
 */
export async function getTeamEventStats(teamNumber, eventKey) {
  const cacheKey = `team_event/${teamNumber}/${eventKey}`;
  const cached = getFromCache(cacheKey, CACHE_TTL.teamEvent);
  if (cached !== null) return cached;

  try {
    const response = await fetch(
      `${API_URLS.STATBOTICS}/team_event/${teamNumber}/${eventKey}`
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Statbotics team event error:', error);
    }
    return null;
  }
}

// =============================================================================
// GET EVENT TEAM STATS (BULK)
// =============================================================================

/**
 * Fetch stats for all teams at an event
 * Uses the team_events endpoint filtered by event
 *
 * @param {string} eventKey - Event key (e.g., "2024casj")
 * @returns {Array} - Array of team stats for the event
 */
export async function getEventTeamStats(eventKey) {
  const cacheKey = `event_stats/${eventKey}`;
  const cached = getFromCache(cacheKey, CACHE_TTL.eventStats);
  if (cached !== null) return cached;

  try {
    const response = await fetch(
      `${API_URLS.STATBOTICS}/team_events?event=${eventKey}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Transform data to match expected format
    const result = data.map(teamEvent => ({
      team_number: teamEvent.team,
      nickname: teamEvent.team_name || `Team ${teamEvent.team}`,
      epa_raw: teamEvent.epa?.total_points?.mean || 0,
      epa_total: teamEvent.epa?.breakdown?.total_points || 0,
      epa_teleop: teamEvent.epa?.breakdown?.teleop_points || 0,
      epa_auto: teamEvent.epa?.breakdown?.auto_points || 0,
      epa_endgame: teamEvent.epa?.breakdown?.endgame_points || 0,
      epa_percentile: (teamEvent.epa?.unitless || 0) * 100,
      wins: teamEvent.record?.wins || 0,
      losses: teamEvent.record?.losses || 0,
      rank: teamEvent.rank || null
    }));

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Statbotics event stats error:', error);
    }
    return [];
  }
}

// =============================================================================
// GET YEAR STATS
// =============================================================================

/**
 * Fetch team stats for a specific year
 *
 * @param {string|number} teamNumber - FRC team number
 * @param {number} year - Year to fetch stats for
 * @returns {Object|null} - Team year stats or null if not found
 */
export async function getTeamYearStats(teamNumber, year) {
  const cacheKey = `team_year/${teamNumber}/${year}`;
  const cached = getFromCache(cacheKey, CACHE_TTL.teamYear);
  if (cached !== null) return cached;

  try {
    const response = await fetch(
      `${API_URLS.STATBOTICS}/team_year/${teamNumber}/${year}`
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Statbotics team year error:', error);
    }
    return null;
  }
}

// =============================================================================
// GET TOP TEAMS (WORLD RANKINGS)
// =============================================================================

/**
 * Fetch top teams globally for a specific year
 *
 * @param {number} year - Year to fetch rankings for
 * @param {number} limit - Number of teams to fetch (default 20)
 * @returns {Array} - Array of top teams sorted by EPA
 */
export async function getTopTeams(year, limit = 20) {
  const cacheKey = `top_teams/${year}/${limit}`;
  const cached = getFromCache(cacheKey, CACHE_TTL.topTeams);
  if (cached !== null) return cached;

  try {
    const response = await fetch(
      `${API_URLS.STATBOTICS}/team_years?year=${year}&limit=${limit}&metric=epa_end&ascending=false`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Statbotics top teams error:', error);
    }
    return [];
  }
}

