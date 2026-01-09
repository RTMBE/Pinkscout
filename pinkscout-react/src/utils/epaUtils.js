/**
 * =============================================================================
 * EPAUTILS.JS - EPA Scaling and Classification Utilities
 * =============================================================================
 * 
 * WHAT IS EPA?
 * EPA (Expected Points Added) is a metric from Statbotics that measures
 * how many points a team contributes to their alliance per match.
 * 
 * CLASSIFICATION THRESHOLDS:
 * - Elite: Top 10% of teams (percentile >= 90)
 * - Top Tier: Next 25% (percentile >= 65)
 * - Normal: Middle 45% (percentile >= 20)
 * - Below Average: Bottom 20% (percentile < 20)
 * 
 * These functions are ported directly from the vanilla JS app.js
 * 
 * =============================================================================
 */

/**
 * SCALE STATBOTICS EPA
 * --------------------
 * Returns the EPA rating value from Statbotics data.
 *
 * Statbotics API formats:
 * - /team/{team}: Returns norm_epa.mean (Elo-like rating, 1000-2000 range)
 * - /team_event/{team}/{event}: Returns epa.total_points.mean (actual points)
 *
 * @param {Object|number} statboticsData - The Statbotics data object or percentile
 * @returns {number} - EPA rating value
 */
export function scaleStatboticsEPA(statboticsData) {
  if (!statboticsData) return 0;

  // If it's a number (percentile), return it as-is for backwards compatibility
  if (typeof statboticsData === 'number') {
    return statboticsData;
  }

  // Get actual EPA total points (from team_event endpoint)
  if (statboticsData.epa?.total_points?.mean) {
    return statboticsData.epa.total_points.mean;
  }

  // Get norm_epa from team endpoint (Elo-like rating)
  if (statboticsData.norm_epa?.mean) {
    return statboticsData.norm_epa.mean;
  }

  // Fallback to older API format
  if (typeof statboticsData.epa_end === 'number') {
    return statboticsData.epa_end;
  }

  return 0;
}

/**
 * CLASSIFY EPA
 * ------------
 * Classifies a team based on their EPA percentile.
 * 
 * CLASSIFICATION LOGIC:
 * - Elite: >= 90th percentile (top 10%)
 * - Top Tier: >= 65th percentile (next 25%)
 * - Normal: >= 20th percentile (middle 45%)
 * - Below Average: < 20th percentile (bottom 20%)
 * 
 * @param {number} epaPercentile - Team's EPA percentile (0-100)
 * @param {Array} allTeamEPAs - Optional: Array of all team EPAs for relative ranking
 * @returns {Object} - { classification, color, emoji, description }
 */
export function classifyEPA(epaPercentile, allTeamEPAs = null) {
  // If allTeamEPAs provided, calculate actual percentile
  let percentile = epaPercentile;

  if (allTeamEPAs && allTeamEPAs.length > 0 && typeof epaPercentile === 'number') {
    // Calculate what percentile this EPA falls into
    const sorted = [...allTeamEPAs].sort((a, b) => a - b);
    const rank = sorted.findIndex(epa => epa >= epaPercentile);
    percentile = ((rank === -1 ? sorted.length : rank) / sorted.length) * 100;
  }

  // Classification thresholds
  if (percentile >= 90) {
    return {
      classification: 'Elite',
      label: 'Elite',
      color: '#FFD700',  // Gold
      emoji: '🏆',
      description: 'Top 10% of teams'
    };
  } else if (percentile >= 65) {
    return {
      classification: 'Top Tier',
      label: 'Top Tier',
      color: '#4CAF50',  // Green
      emoji: '⭐',
      description: 'Top 35% of teams'
    };
  } else if (percentile >= 20) {
    return {
      classification: 'Normal',
      label: 'Normal',
      color: '#2196F3',  // Blue
      emoji: '🔵',
      description: 'Average performance'
    };
  } else {
    return {
      classification: 'Below Average',
      label: 'Below Average',
      color: '#9E9E9E',  // Gray
      emoji: '📈',
      description: 'Developing team'
    };
  }
}

/**
 * GET EPA PERCENTILE FROM STATBOTICS DATA
 * ----------------------------------------
 * Extracts or calculates the EPA percentile from Statbotics response.
 *
 * Statbotics API formats:
 * - /team_event: epa.unitless (0-1 range, represents percentile)
 * - /team: norm_epa.mean (Elo-like rating, 1000-2000 range, 1500 = average)
 *
 * For norm_epa (Elo ratings):
 * - 1500 = 50th percentile (average)
 * - 1600 = ~84th percentile
 * - 1700 = ~98th percentile
 * - 1400 = ~16th percentile
 *
 * @param {Object} statboticsData - Raw Statbotics API response
 * @returns {number} - EPA percentile (0-100)
 */
export function getEPAPercentile(statboticsData) {
  if (!statboticsData) return 0;

  // Statbotics provides epa.unitless which is 0-1 range (percentile)
  if (statboticsData.epa?.unitless !== undefined) {
    return statboticsData.epa.unitless * 100;
  }

  // Fallback: calculate from EPA percentile if available
  if (statboticsData.epa_percentile) {
    return statboticsData.epa_percentile;
  }

  // Convert norm_epa (Elo rating) to percentile
  // Using standard Elo distribution: 1500 = 50%, std dev ~100
  if (statboticsData.norm_epa && typeof statboticsData.norm_epa.mean === 'number') {
    const eloRating = statboticsData.norm_epa.mean;
    // Convert Elo to percentile using normal distribution approximation
    // z-score = (rating - 1500) / 100
    const zScore = (eloRating - 1500) / 100;
    // Approximate percentile using sigmoid function
    const percentile = 100 / (1 + Math.exp(-0.7 * zScore));
    return Math.min(Math.max(percentile, 1), 99);
  }

  // Default if no data
  return 50;
}

/**
 * CALCULATE AUTO POINTS FROM SCOUTING ENTRY
 * ------------------------------------------
 * 2024 game scoring: Speaker = 5pts, Amp = 2pts, Mobility = 2pts
 * 
 * @param {Object} entry - Scouting data entry
 * @returns {number} - Total auto points
 */
export function calculateAutoPoints(entry) {
  if (!entry) return 0;
  const speaker = (entry.autoSpeaker || 0) * 5;
  const amp = (entry.autoAmp || 0) * 2;
  const mobility = entry.autoMobility ? 2 : 0;
  return speaker + amp + mobility;
}

/**
 * CALCULATE TELEOP POINTS FROM SCOUTING ENTRY
 * --------------------------------------------
 * 2024 game scoring: Speaker = 2pts, Amp = 1pt, Amplified = 5pts
 * 
 * @param {Object} entry - Scouting data entry
 * @returns {number} - Total teleop points
 */
export function calculateTeleopPoints(entry) {
  if (!entry) return 0;
  const speaker = (entry.teleopSpeaker || 0) * 2;
  const amp = (entry.teleopAmp || 0) * 1;
  const amplified = (entry.amplifiedScored || 0) * 5;
  return speaker + amp + amplified;
}

