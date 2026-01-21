/**
 * =============================================================================
 * EPAUTILS.JS - EPA Scaling and Classification Utilities
 * =============================================================================
 *
 * WHAT IS EPA?
 * EPA (Expected Points Added) is a metric from Statbotics that measures
 * how many points a team contributes to their alliance per match.
 *
 * CLASSIFICATION THRESHOLDS (7 tiers):
 * - Elite: Top 5% (percentile >= 95)
 * - Great: Top 10% (percentile >= 90, < 95)
 * - Good: Top 20% (percentile >= 80, < 90)
 * - Above Average: 60-80th percentile
 * - Average: 40-60th percentile
 * - Below Average: 20-40th percentile
 * - Developing: Bottom 20% (percentile < 20)
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
 * CLASSIFICATION LOGIC (7 tiers):
 * - Elite: >= 95th percentile (top 5%)
 * - Great: >= 90th percentile (top 10%)
 * - Good: >= 80th percentile (top 20%)
 * - Above Average: >= 60th percentile (60-80%)
 * - Average: >= 40th percentile (40-60%)
 * - Below Average: >= 20th percentile (20-40%)
 * - Developing: < 20th percentile (bottom 20%)
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

  // Classification thresholds (7 tiers)
  if (percentile >= 95) {
    return {
      classification: 'Elite',
      label: 'Elite',
      color: '#FFD700',  // Gold
      emoji: '🏆',
      description: 'Top 5% of teams'
    };
  } else if (percentile >= 90) {
    return {
      classification: 'Great',
      label: 'Great',
      color: '#FF6B00',  // Orange
      emoji: '🔥',
      description: 'Top 10% of teams'
    };
  } else if (percentile >= 80) {
    return {
      classification: 'Good',
      label: 'Good',
      color: '#4CAF50',  // Green
      emoji: '⭐',
      description: 'Top 20% of teams'
    };
  } else if (percentile >= 60) {
    return {
      classification: 'Above Average',
      label: 'Above Average',
      color: '#8BC34A',  // Light Green
      emoji: '✅',
      description: '60-80th percentile'
    };
  } else if (percentile >= 40) {
    return {
      classification: 'Average',
      label: 'Average',
      color: '#2196F3',  // Blue
      emoji: '🔵',
      description: '40-60th percentile'
    };
  } else if (percentile >= 20) {
    return {
      classification: 'Below Average',
      label: 'Below Average',
      color: '#9E9E9E',  // Gray
      emoji: '📊',
      description: '20-40th percentile'
    };
  } else {
    return {
      classification: 'Developing',
      label: 'Developing',
      color: '#607D8B',  // Blue Gray
      emoji: '📈',
      description: 'Bottom 20% - Room to grow'
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
 * 2026 REBUILT™ scoring:
 * - Fuel in active Hub: 1 pt each
 * - Tower Level 1: 15 pts, Level 3: 30 pts
 *
 * Also supports 2024 Crescendo for backwards compatibility:
 * - Speaker = 5pts, Amp = 2pts, Mobility = 2pts
 *
 * @param {Object} entry - Scouting data entry
 * @returns {number} - Total auto points
 */
export function calculateAutoPoints(entry) {
  if (!entry) return 0;

  // 2026 REBUILT™ scoring
  if (entry.autoFuelScored !== undefined || entry.autoTowerClimb !== undefined) {
    const fuel = (entry.autoFuelScored || 0) * 1;
    let tower = 0;
    switch (entry.autoTowerClimb) {
      case 'level1': tower = 15; break;
      case 'level3': tower = 30; break;
      default: tower = 0;
    }
    return fuel + tower;
  }

  // 2024 Crescendo scoring (backwards compatibility)
  const speaker = (entry.autoSpeaker || 0) * 5;
  const amp = (entry.autoAmp || 0) * 2;
  const mobility = entry.autoMobility ? 2 : 0;
  return speaker + amp + mobility;
}

/**
 * CALCULATE TELEOP POINTS FROM SCOUTING ENTRY
 * --------------------------------------------
 * 2026 REBUILT™ scoring:
 * - Fuel in active Hub: 1 pt each
 * - Fuel in inactive Hub: 0 pts (tracked for strategy)
 *
 * Also supports 2024 Crescendo for backwards compatibility:
 * - Speaker = 2pts, Amp = 1pt, Amplified = 5pts
 *
 * @param {Object} entry - Scouting data entry
 * @returns {number} - Total teleop points
 */
export function calculateTeleopPoints(entry) {
  if (!entry) return 0;

  // 2026 REBUILT™ scoring
  if (entry.teleopFuelActive !== undefined) {
    return (entry.teleopFuelActive || 0) * 1;
    // Note: teleopFuelInactive doesn't score but is tracked
  }

  // 2024 Crescendo scoring (backwards compatibility)
  const speaker = (entry.teleopSpeaker || 0) * 2;
  const amp = (entry.teleopAmp || 0) * 1;
  const amplified = (entry.amplifiedScored || 0) * 5;
  return speaker + amp + amplified;
}

/**
 * CALCULATE ENDGAME POINTS FROM SCOUTING ENTRY
 * ---------------------------------------------
 * 2026 REBUILT™ scoring:
 * - Tower Level 1 (off carpet): 15 pts
 * - Tower Level 2 (above low rung): 0 pts match, 20 RP
 * - Tower Level 3 (above mid rung): 30 pts
 *
 * Also supports 2024 Crescendo for backwards compatibility:
 * - Parked: 1 pt, Onstage: 3 pts, Spotlit: 4 pts
 * - Trap: 5 pts, Harmony: 2 pts
 *
 * @param {Object} entry - Scouting data entry
 * @returns {number} - Total endgame points
 */
export function calculateEndgamePoints(entry) {
  if (!entry) return 0;

  // 2026 REBUILT™ scoring
  if (entry.endgameTowerLevel !== undefined) {
    switch (entry.endgameTowerLevel) {
      case 'level1': return 15;
      case 'level2': return 0; // Only gives RP, not match points
      case 'level3': return 30;
      default: return 0;
    }
  }

  // 2024 Crescendo scoring (backwards compatibility)
  let points = 0;
  switch (entry.climbStatus) {
    case 'parked': points = 1; break;
    case 'onstage': points = 3; break;
    case 'spotlit': points = 4; break;
    default: points = 0;
  }
  if (entry.trapScored) points += 5;
  if (entry.harmony) points += 2;
  return points;
}

/**
 * CALCULATE RANKING POINTS CONTRIBUTION FROM SCOUTING ENTRY
 * ----------------------------------------------------------
 * 2026 REBUILT™ RP from tower:
 * - Tower Level 1: 10 RP
 * - Tower Level 2: 20 RP
 *
 * @param {Object} entry - Scouting data entry
 * @returns {number} - RP contribution from this robot
 */
export function calculateTowerRP(entry) {
  if (!entry || !entry.endgameTowerLevel) return 0;

  switch (entry.endgameTowerLevel) {
    case 'level1': return 10;
    case 'level2': return 20;
    default: return 0;
  }
}

