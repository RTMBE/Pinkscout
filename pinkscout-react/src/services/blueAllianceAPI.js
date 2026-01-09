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
// GET FULL EVENT DATA (COMBINED)
// =============================================================================

/**
 * Fetch all data for an event in parallel (event details, teams, matches)
 * 
 * @param {string} eventKey - Event key (e.g., "2024casj")
 * @returns {Object} - { event, teams, matches }
 */
export async function getFullEventData(eventKey) {
  try {
    const [event, teams, matches] = await Promise.all([
      getEventDetails(eventKey),
      getEventTeams(eventKey),
      getEventMatches(eventKey)
    ]);
    
    return { event, teams, matches };
  } catch (error) {
    console.error('Error fetching full event data:', error);
    return { event: null, teams: [], matches: [] };
  }
}

