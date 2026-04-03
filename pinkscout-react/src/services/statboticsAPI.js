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

const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  timeoutMs: 15000
};

let rateLimitedUntil = 0;

/**
 * Make a fetch request with retry logic and timeout
 */
async function fetchWithRetry(url, cacheKey, cacheTTL) {
  // Check if we're rate limited
  if (Date.now() < rateLimitedUntil) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached.data;
    }
    return null;
  }

  let lastError = null;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RETRY_CONFIG.timeoutMs);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        rateLimitedUntil = Date.now() + (retryAfter * 1000);
        const cached = cache.get(cacheKey);
        return cached ? cached.data : null;
      }

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (cacheTTL) {
        setCache(cacheKey, data);
      }
      return data;
    } catch (error) {
      lastError = error;

      // Don't retry abort errors
      if (error.name === 'AbortError') {
        if (import.meta.env.DEV) {
          console.warn('Statbotics request timed out');
        }
        return null;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = Math.min(
          RETRY_CONFIG.initialDelayMs * Math.pow(2, attempt - 1),
          RETRY_CONFIG.maxDelayMs
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  if (import.meta.env.DEV) {
    console.error('Statbotics API error after retries:', lastError);
  }
  return null;
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
    `${API_URLS.STATBOTICS}/team/${teamNumber}`,
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
    `${API_URLS.STATBOTICS}/team_event/${teamNumber}/${eventKey}`,
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
    `${API_URLS.STATBOTICS}/team_events?event=${eventKey}`,
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
    `${API_URLS.STATBOTICS}/team_year/${teamNumber}/${year}`,
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
    `${API_URLS.STATBOTICS}/team_years?year=${year}&limit=${cappedLimit}&metric=epa_end&ascending=false`,
    cacheKey,
    CACHE_TTL.topTeams
  );

  return data || [];
}

