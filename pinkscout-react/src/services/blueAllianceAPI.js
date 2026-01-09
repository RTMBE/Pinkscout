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

import { API_KEYS, API_URLS } from './firebase';

// =============================================================================
// HELPER: Make authenticated request to TBA
// =============================================================================

async function tbaFetch(endpoint) {
  const response = await fetch(`${API_URLS.TBA}${endpoint}`, {
    headers: {
      'X-TBA-Auth-Key': API_KEYS.TBA
    }
  });
  
  if (!response.ok) {
    throw new Error(`TBA API error: ${response.status}`);
  }
  
  return response.json();
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
    const events = await tbaFetch(`/events/${year}`);
    
    // Sort by start date
    return events.sort((a, b) => 
      new Date(a.start_date) - new Date(b.start_date)
    );
  } catch (error) {
    console.error('Error fetching events:', error);
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
    return await tbaFetch(`/event/${eventKey}`);
  } catch (error) {
    console.error('Error fetching event details:', error);
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
    return await tbaFetch(`/event/${eventKey}/teams`);
  } catch (error) {
    console.error('Error fetching event teams:', error);
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
    const matches = await tbaFetch(`/event/${eventKey}/matches`);
    
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
    console.error('Error fetching event matches:', error);
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
    return await tbaFetch(`/team/frc${teamNumber}`);
  } catch (error) {
    console.error('Error fetching team info:', error);
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
    const data = await tbaFetch(`/event/${eventKey}/rankings`);
    return data?.rankings || [];
  } catch (error) {
    console.error('Error fetching event rankings:', error);
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
    return await tbaFetch(`/event/${eventKey}/awards`);
  } catch (error) {
    console.error('Error fetching event awards:', error);
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
    const events = await tbaFetch(`/team/frc${teamNumber}/events/${year}`);

    // Sort by start date
    return events.sort((a, b) =>
      new Date(a.start_date) - new Date(b.start_date)
    );
  } catch (error) {
    console.error('Error fetching team events:', error);
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
    const matches = await tbaFetch(`/team/frc${teamNumber}/event/${eventKey}/matches`);

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
    console.error('Error fetching team event matches:', error);
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
    console.error('Error fetching full event data:', error);
    return { event: null, teams: [], matches: [], rankings: [] };
  }
}

