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

import { API_URLS } from './firebase';

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
  try {
    const response = await fetch(`${API_URLS.STATBOTICS}/team/${teamNumber}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Team ${teamNumber} not found in Statbotics`);
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Statbotics API error:', error);
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
  try {
    const response = await fetch(
      `${API_URLS.STATBOTICS}/team_event/${teamNumber}/${eventKey}`
    );
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Statbotics team event error:', error);
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
  try {
    const response = await fetch(
      `${API_URLS.STATBOTICS}/team_events?event=${eventKey}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // Transform data to match expected format
    return data.map(teamEvent => ({
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
  } catch (error) {
    console.error('Statbotics event stats error:', error);
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
  try {
    const response = await fetch(
      `${API_URLS.STATBOTICS}/team_year/${teamNumber}/${year}`
    );
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Statbotics team year error:', error);
    return null;
  }
}

