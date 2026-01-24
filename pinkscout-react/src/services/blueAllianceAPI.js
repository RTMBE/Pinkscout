/**
 * =============================================================================
 * BLUEALLIANCEAPI.JS - The Blue Alliance API Service
 * =============================================================================
 * 
 * WHAT IS THE BLUE ALLIANCE (TBA)?
 * TBA is the primary source for FRC event data including:
 * - Event schedules and details
 * - Team rosters at events
 * - Match schedules and results
 * - Team information
 * 
 * API DOCUMENTATION: https://www.thebluealliance.com/apidocs/v3
 * 
 * AUTHENTICATION:
 * TBA requires an API key passed in the X-TBA-Auth-Key header
 * 
 * =============================================================================
 */

import { API_KEYS, API_URLS } from './supabase';

// =============================================================================
// IN-MEMORY CACHE FOR PERFORMANCE
// =============================================================================

const cache = new Map();
const CACHE_TTL = {
  events: 5 * 60 * 1000,      // 5 minutes for event list
  eventDetails: 10 * 60 * 1000, // 10 minutes for event details
  teams: 30 * 60 * 1000,      // 30 minutes for team data (rarely changes)
  matches: 2 * 60 * 1000      // 2 minutes for matches (updates during events)
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
// HELPER: Make authenticated request to TBA (with caching)
// =============================================================================

async function tbaFetch(endpoint, cacheTTL = null) {
  // Check cache first
  if (cacheTTL) {
    const cached = getFromCache(endpoint, cacheTTL);
    if (cached) {
      if (import.meta.env.DEV) {
        console.log(`📦 Cache hit: ${endpoint}`);
      }
      return cached;
    }
  }

  const response = await fetch(`${API_URLS.TBA}${endpoint}`, {
    headers: {
      'X-TBA-Auth-Key': API_KEYS.TBA
    }
  });

  if (!response.ok) {
    throw new Error(`TBA API error: ${response.status}`);
  }

  const data = await response.json();

  // Cache the response
  if (cacheTTL) {
    setCache(endpoint, data);
  }

  return data;
}

// =============================================================================
// GET EVENT LIST FOR YEAR
// =============================================================================

/**
 * Fetch all events for a given year
 * 
 * @param {number} year - The year to fetch events for
 * @returns {Array} - Array of event objects
 */
export async function getEventList(year) {
  try {
    const events = await tbaFetch(`/events/${year}`, CACHE_TTL.events);

    // Sort by start date
    return events.sort((a, b) =>
      new Date(a.start_date) - new Date(b.start_date)
    );
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching events:', error);
    }
    return [];
  }
}

// =============================================================================
// GET EVENT DETAILS
// =============================================================================

/**
 * Fetch detailed information about a specific event
 *
 * @param {string} eventKey - Event key (e.g., "2024casj")
 * @returns {Object} - Event details
 */
export async function getEventDetails(eventKey) {
  try {
    return await tbaFetch(`/event/${eventKey}`, CACHE_TTL.eventDetails);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching event details:', error);
    }
    return null;
  }
}

// =============================================================================
// GET TEAMS AT EVENT
// =============================================================================

/**
 * Fetch all teams attending an event
 *
 * @param {string} eventKey - Event key (e.g., "2024casj")
 * @returns {Array} - Array of team objects
 */
export async function getEventTeams(eventKey) {
  try {
    return await tbaFetch(`/event/${eventKey}/teams`, CACHE_TTL.teams);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching event teams:', error);
    }
    return [];
  }
}

// =============================================================================
// GET MATCHES AT EVENT
// =============================================================================

/**
 * Fetch all matches at an event
 * 
 * @param {string} eventKey - Event key (e.g., "2024casj")
 * @returns {Array} - Array of match objects
 */
export async function getEventMatches(eventKey) {
  try {
    const matches = await tbaFetch(`/event/${eventKey}/matches`, CACHE_TTL.matches);

    // Sort matches by competition level and match number
    const levelOrder = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
    return matches.sort((a, b) => {
      const levelDiff = (levelOrder[a.comp_level] || 0) - (levelOrder[b.comp_level] || 0);
      if (levelDiff !== 0) return levelDiff;

      const setDiff = (a.set_number || 0) - (b.set_number || 0);
      if (setDiff !== 0) return setDiff;

      return (a.match_number || 0) - (b.match_number || 0);
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching event matches:', error);
    }
    return [];
  }
}

// =============================================================================
// GET TEAM INFO
// =============================================================================

/**
 * Fetch information about a specific team
 *
 * @param {string|number} teamNumber - FRC team number
 * @returns {Object|null} - Team information or null if not found
 */
export async function getTeamInfo(teamNumber) {
  try {
    return await tbaFetch(`/team/frc${teamNumber}`, CACHE_TTL.teams);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching team info:', error);
    }
    return null;
  }
}

// =============================================================================
// GET EVENT RANKINGS
// =============================================================================

/**
 * Fetch qualification rankings for an event
 *
 * @param {string} eventKey - Event key (e.g., "2024casj")
 * @returns {Object} - Rankings data including team ranks
 */
export async function getEventRankings(eventKey) {
  try {
    const data = await tbaFetch(`/event/${eventKey}/rankings`, CACHE_TTL.matches);
    return data?.rankings || [];
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching event rankings:', error);
    }
    return [];
  }
}

// =============================================================================
// GET EVENT AWARDS
// =============================================================================

/**
 * Fetch all awards given at an event
 *
 * @param {string} eventKey - Event key (e.g., "2024casj")
 * @returns {Array} - Array of award objects
 *
 * Award object structure:
 * - award_type: number (0 = Chairman's, 1 = Winner, 2 = Finalist, etc.)
 * - event_key: string
 * - name: string (human-readable award name)
 * - recipient_list: Array of { team_key, awardee } objects
 * - year: number
 */
export async function getEventAwards(eventKey) {
  try {
    return await tbaFetch(`/event/${eventKey}/awards`, CACHE_TTL.eventDetails);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching event awards:', error);
    }
    return [];
  }
}

// =============================================================================
// GET TEAM EVENTS FOR YEAR
// =============================================================================

/**
 * Fetch all events a team is attending in a given year
 *
 * @param {string|number} teamNumber - FRC team number
 * @param {number} year - The year to fetch events for
 * @returns {Array} - Array of event objects sorted by date
 */
export async function getTeamEvents(teamNumber, year) {
  try {
    const events = await tbaFetch(`/team/frc${teamNumber}/events/${year}`, CACHE_TTL.events);

    // Sort by start date
    return events.sort((a, b) =>
      new Date(a.start_date) - new Date(b.start_date)
    );
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching team events:', error);
    }
    return [];
  }
}

// =============================================================================
// GET TEAM MATCHES AT EVENT
// =============================================================================

/**
 * Fetch all matches for a specific team at an event
 *
 * @param {string|number} teamNumber - FRC team number
 * @param {string} eventKey - Event key (e.g., "2024casj")
 * @returns {Array} - Array of match objects sorted by time/number
 */
export async function getTeamEventMatches(teamNumber, eventKey) {
  try {
    const matches = await tbaFetch(`/team/frc${teamNumber}/event/${eventKey}/matches`, CACHE_TTL.matches);

    // Sort matches by competition level and match number
    const levelOrder = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
    return matches.sort((a, b) => {
      const levelDiff = (levelOrder[a.comp_level] || 0) - (levelOrder[b.comp_level] || 0);
      if (levelDiff !== 0) return levelDiff;

      const setDiff = (a.set_number || 0) - (b.set_number || 0);
      if (setDiff !== 0) return setDiff;

      return (a.match_number || 0) - (b.match_number || 0);
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching team event matches:', error);
    }
    return [];
  }
}

// =============================================================================
// GET TEAM AWARDS FOR YEAR
// =============================================================================

/**
 * Fetch all awards a team won in a specific year
 *
 * @param {string|number} teamNumber - FRC team number
 * @param {number} year - The year to fetch awards for
 * @returns {Array} - Array of award objects
 *
 * Award object structure:
 * - award_type: number (0 = Chairman's, 1 = Winner, 2 = Finalist, etc.)
 * - event_key: string
 * - name: string (human-readable award name)
 * - recipient_list: Array of { team_key, awardee } objects
 * - year: number
 */
export async function getTeamAwardsForYear(teamNumber, year) {
  try {
    return await tbaFetch(`/team/frc${teamNumber}/awards/${year}`, CACHE_TTL.eventDetails);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching team awards for year:', error);
    }
    return [];
  }
}

// =============================================================================
// GET ALL TEAM AWARDS
// =============================================================================

/**
 * Fetch all awards a team has ever won
 *
 * @param {string|number} teamNumber - FRC team number
 * @returns {Array} - Array of award objects sorted by year (newest first)
 */
export async function getTeamAllAwards(teamNumber) {
  try {
    const awards = await tbaFetch(`/team/frc${teamNumber}/awards`, CACHE_TTL.teams);
    // Sort by year descending
    return awards.sort((a, b) => b.year - a.year);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching all team awards:', error);
    }
    return [];
  }
}

// =============================================================================
// GET TEAM MATCHES FOR YEAR
// =============================================================================

/**
 * Fetch all matches a team played in a specific year
 *
 * @param {string|number} teamNumber - FRC team number
 * @param {number} year - The year to fetch matches for
 * @returns {Array} - Array of match objects sorted by time
 */
export async function getTeamMatchesForYear(teamNumber, year) {
  try {
    const matches = await tbaFetch(`/team/frc${teamNumber}/matches/${year}`, CACHE_TTL.matches);
    // Sort by actual_time or predicted_time
    return matches.sort((a, b) => (a.actual_time || a.predicted_time || 0) - (b.actual_time || b.predicted_time || 0));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching team matches for year:', error);
    }
    return [];
  }
}

// =============================================================================
// GET TEAM YEARS PARTICIPATED
// =============================================================================

/**
 * Fetch all years a team has participated in
 *
 * @param {string|number} teamNumber - FRC team number
 * @returns {Array} - Array of years (numbers) sorted descending
 */
export async function getTeamYearsParticipated(teamNumber) {
  try {
    const years = await tbaFetch(`/team/frc${teamNumber}/years_participated`, CACHE_TTL.teams);
    return years.sort((a, b) => b - a);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching team years participated:', error);
    }
    return [];
  }
}

// =============================================================================
// GET FULL EVENT DATA (COMBINED)
// =============================================================================

/**
 * Fetch all data for an event in parallel (event details, teams, matches, rankings)
 *
 * @param {string} eventKey - Event key (e.g., "2024casj")
 * @returns {Object} - { event, teams, matches, rankings }
 */
export async function getFullEventData(eventKey) {
  try {
    const [event, teams, matches, rankings] = await Promise.all([
      getEventDetails(eventKey),
      getEventTeams(eventKey),
      getEventMatches(eventKey),
      getEventRankings(eventKey)
    ]);

    return { event, teams, matches, rankings };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching full event data:', error);
    }
    return { event: null, teams: [], matches: [], rankings: [] };
  }
}

