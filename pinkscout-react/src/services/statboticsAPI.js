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
 * SECURITY:
 * PinkScout reaches Statbotics through its authenticated server gateway. This
 * centralizes validation, caching, abuse controls, and source availability.
 * 
 * =============================================================================
 */

import { getCompetitionData } from './competitionApi';

// =============================================================================
// IN-MEMORY CACHE FOR PERFORMANCE
// =============================================================================

const cache = new Map();
const CACHE_TTL = {
  team: 30 * 60 * 1000,       // 30 minutes for team data
  teamEvent: 5 * 60 * 1000,   // 5 minutes for team-event data (updates during events)
  eventStats: 10 * 60 * 1000, // 10 minutes for event stats (EPA updates slowly)
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
// SCALING FIX: Retry configuration and rate limiting
// =============================================================================

/**
 * Make an authenticated request through the PinkScout competition gateway.
 */
async function fetchWithRetry(operation, params, cacheKey, cacheTTL) {
  try {
    const data = await getCompetitionData('statbotics', operation, params);
    if (cacheTTL) setCache(cacheKey, data);
    return data;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Statbotics API error:', error);
    return null;
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

  return fetchWithRetry(
    'team',
    { teamNumber },
    cacheKey,
    CACHE_TTL.team
  );
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

  return fetchWithRetry(
    'teamEvent',
    { teamNumber, eventKey },
    cacheKey,
    CACHE_TTL.teamEvent
  );
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

  // Use fetchWithRetry but handle the transformation separately
  const data = await fetchWithRetry(
    'eventTeamStats',
    { eventKey },
    null, // Don't cache raw data
    null
  );

  if (!data || !Array.isArray(data)) {
    return [];
  }

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

  return fetchWithRetry(
    'teamYear',
    { teamNumber, year },
    cacheKey,
    CACHE_TTL.teamYear
  );
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
  // SCALING FIX: Cap limit to prevent excessive data fetching
  const cappedLimit = Math.min(limit, 100);
  const cacheKey = `top_teams/${year}/${cappedLimit}`;
  const cached = getFromCache(cacheKey, CACHE_TTL.topTeams);
  if (cached !== null) return cached;

  const data = await fetchWithRetry(
    'topTeams',
    { year, limit: cappedLimit },
    cacheKey,
    CACHE_TTL.topTeams
  );

  return data || [];
}
