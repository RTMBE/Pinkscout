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

// Cache TTL - Reduced for real-time updates during competitions
const CACHE_TTL = {
  events: 5 * 60 * 1000,       // 5 minutes for event list
  eventDetails: 5 * 60 * 1000, // 5 minutes for event details
  teams: 15 * 60 * 1000,       // 15 minutes for team data (rarely changes)
  matches: 15 * 1000,          // 15 seconds for matches (near real-time during events)
  rankings: 30 * 1000,         // 30 seconds for rankings
  liveMatches: 10 * 1000       // 10 seconds for live match data
};

// Last-Modified tracking for conditional requests
const lastModified = new Map();

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
// HELPER: Make authenticated request to TBA (with caching & conditional requests)
// =============================================================================

async function tbaFetch(endpoint, cacheTTL = null, forceRefresh = false) {
  // Check cache first (unless force refresh)
  if (cacheTTL && !forceRefresh) {
    const cached = getFromCache(endpoint, cacheTTL);
    if (cached) {
      if (import.meta.env.DEV) {
        console.log(`📦 Cache hit: ${endpoint}`);
      }
      return cached;
    }
  }

  // Build headers with If-Modified-Since for conditional requests
  const headers = {
    'X-TBA-Auth-Key': API_KEYS.TBA
  };

  // Use Last-Modified for conditional requests (saves bandwidth)
  const lastMod = lastModified.get(endpoint);
  if (lastMod && !forceRefresh) {
    headers['If-Modified-Since'] = lastMod;
  }

  const response = await fetch(`${API_URLS.TBA}${endpoint}`, { headers });

  // 304 Not Modified - return cached data
  if (response.status === 304) {
    const cached = cache.get(endpoint);
    if (cached) {
      // Refresh cache timestamp
      cached.timestamp = Date.now();
      return cached.data;
    }
  }

  if (!response.ok) {
    throw new Error(`TBA API error: ${response.status}`);
  }

  const data = await response.json();

  // Store Last-Modified header for future requests
  const modHeader = response.headers.get('Last-Modified');
  if (modHeader) {
    lastModified.set(endpoint, modHeader);
  }

  // Cache the response
  if (cacheTTL) {
    setCache(endpoint, data);
  }

  return data;
}

/**
 * Force refresh data from TBA (bypasses cache)
 * Use for real-time updates during competitions
 */
export async function forceRefreshMatches(eventKey) {
  clearCache(`/event/${eventKey}/matches`);
  return getEventMatches(eventKey, true);
}

export async function forceRefreshRankings(eventKey) {
  clearCache(`/event/${eventKey}/rankings`);
  return getEventRankings(eventKey, true);
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
 * @param {boolean} forceRefresh - Skip cache and fetch fresh data
 * @returns {Array} - Array of match objects
 */
export async function getEventMatches(eventKey, forceRefresh = false) {
  try {
    const matches = await tbaFetch(`/event/${eventKey}/matches`, CACHE_TTL.matches, forceRefresh);

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
// GET ALL TEAMS FOR SEARCH (using paginated TBA API)
// =============================================================================

// In-memory team cache for search
let allTeamsCache = null;
let allTeamsCacheTime = 0;
const ALL_TEAMS_CACHE_TTL = 60 * 60 * 1000; // 1 hour cache for all teams

/**
 * Fetch all teams from TBA (paginated)
 * Caches results for 1 hour to avoid repeated large fetches
 *
 * @returns {Array} - Array of all teams [{key, nickname, team_number}]
 */
async function getAllTeamsForSearch() {
  // Check cache first
  if (allTeamsCache && Date.now() - allTeamsCacheTime < ALL_TEAMS_CACHE_TTL) {
    return allTeamsCache;
  }

  try {
    // TBA API v3 returns teams in pages of ~500 teams each
    // There are typically 20+ pages of teams
    const allTeams = [];
    const currentYear = new Date().getFullYear();

    // Fetch all pages in parallel (up to 20 pages should cover all teams)
    const pagePromises = [];
    for (let page = 0; page < 20; page++) {
      pagePromises.push(
        tbaFetch(`/teams/${currentYear}/${page}`, CACHE_TTL.teams)
          .catch(() => []) // Return empty array on error
      );
    }

    const pages = await Promise.all(pagePromises);

    for (const page of pages) {
      if (Array.isArray(page)) {
        allTeams.push(...page);
      }
    }

    // Cache the results
    allTeamsCache = allTeams;
    allTeamsCacheTime = Date.now();

    if (import.meta.env.DEV) {
      console.log(`📋 Loaded ${allTeams.length} teams for search`);
    }

    return allTeams;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching all teams:', error);
    }
    return allTeamsCache || []; // Return cached data if available
  }
}

/**
 * Search teams by name or number
 * Returns ranked results: exact team number match first, then partial number, then name matches
 *
 * @param {string} query - Search query (team number or team name)
 * @param {number} maxResults - Maximum number of results to return (default: 10)
 * @returns {Array} - Array of { teamNumber, nickname, matchType } sorted by relevance
 */
export async function searchTeams(query, maxResults = 10) {
  if (!query || !query.trim()) return [];

  const searchQuery = query.trim().toLowerCase();
  const isNumeric = /^\d+$/.test(searchQuery);

  // Get all teams for search
  const allTeams = await getAllTeamsForSearch();
  if (!allTeams || allTeams.length === 0) {
    // Fallback: try direct team lookup for numeric queries
    if (isNumeric) {
      try {
        const teamInfo = await getTeamInfo(searchQuery);
        if (teamInfo) {
          return [{
            teamNumber: searchQuery,
            nickname: teamInfo.nickname || `Team ${searchQuery}`,
            matchType: 'direct_lookup',
            score: 100
          }];
        }
      } catch (err) {
        // Ignore errors
      }
    }
    return [];
  }

  const results = [];

  for (const team of allTeams) {
    // Extract team number from key (e.g., "frc254" -> "254") or use team_number
    const teamNumber = String(team.team_number || team.key?.replace('frc', '') || '');
    const nickname = team.nickname || '';

    let matchType = null;
    let score = 0;

    if (isNumeric) {
      // Numeric search - prioritize team number matches
      if (teamNumber === searchQuery) {
        matchType = 'exact_number';
        score = 100;
      } else if (teamNumber.startsWith(searchQuery)) {
        matchType = 'partial_number_start';
        score = 80;
      } else if (teamNumber.includes(searchQuery)) {
        matchType = 'partial_number';
        score = 60;
      }
    } else {
      // Text search - search by team name (case-insensitive)
      const nicknameLower = nickname.toLowerCase();
      if (nicknameLower === searchQuery) {
        matchType = 'exact_name';
        score = 90;
      } else if (nicknameLower.startsWith(searchQuery)) {
        matchType = 'partial_name_start';
        score = 70;
      } else if (nicknameLower.includes(searchQuery)) {
        matchType = 'partial_name';
        score = 50;
      }
    }

    if (matchType) {
      results.push({
        teamNumber,
        nickname,
        matchType,
        score
      });
    }
  }

  // Sort by score (descending), then by team number (ascending)
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return parseInt(a.teamNumber) - parseInt(b.teamNumber);
  });

  return results.slice(0, maxResults);
}

// =============================================================================
// GET EVENT RANKINGS
// =============================================================================

/**
 * Fetch qualification rankings for an event
 *
 * @param {string} eventKey - Event key (e.g., "2024casj")
 * @param {boolean} forceRefresh - Skip cache and fetch fresh data
 * @returns {Object} - Rankings data including team ranks
 */
export async function getEventRankings(eventKey, forceRefresh = false) {
  try {
    const data = await tbaFetch(`/event/${eventKey}/rankings`, CACHE_TTL.rankings, forceRefresh);
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

