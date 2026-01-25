/**
 * =============================================================================
 * PREDICTIONUTILS.JS - Match Prediction System
 * =============================================================================
 *
 * Scouting-First, Synergy-Aware Match Prediction System
 *
 * FEATURES:
 * - Dynamic weighting between scouting and Statbotics data
 * - Phase-based scoring (Auto 40%, Teleop 35%, Endgame 25%)
 * - Synergy modifiers for autonomous, offense, and defense
 * - Confidence indicators based on scouting coverage
 *
 * =============================================================================
 */

import { calculateAutoPoints, calculateTeleopPoints, calculateEndgamePoints } from './epaUtils';

// =============================================================================
// CONSTANTS
// =============================================================================

// Data source weighting based on scouted matches
export const SCOUTING_WEIGHTS = {
  0: { scouting: 0, statbotics: 1 },      // No scouting data
  1: { scouting: 0.6, statbotics: 0.4 },  // 1-3 matches
  4: { scouting: 0.75, statbotics: 0.25 }, // 4-7 matches
  8: { scouting: 0.9, statbotics: 0.1 }   // 8+ matches
};

// Phase weights for alliance score calculation
export const PHASE_WEIGHTS = {
  auto: 0.40,
  teleop: 0.35,
  endgame: 0.25
};

// Synergy modifiers
export const SYNERGY = {
  AUTO_CONGESTION_PENALTY: 0.92,    // 2+ teams same auto objective
  AUTO_COMPLEMENTARY_BONUS: 1.05,   // Complementary auto roles
  SHOOTER_CYCLER_BONUS: 1.08,       // Shooter + Cycler pairing
  MULTIPLE_SHOOTERS_PENALTY: 0.95,  // Multiple shooters, no cycler
  CYCLER_NO_SHOOTER_PENALTY: 0.90,  // Cycler but no shooter
  DEFENSE_REDUCTION: 0.95,          // Per defensive robot
  MAX_DEFENSE_REDUCTION: 0.88       // Cap at 12% reduction
};

// Confidence thresholds
export const CONFIDENCE = {
  HIGH: { minMatches: 8, label: 'High Confidence', emoji: '🟢', color: '#4CAF50' },
  MEDIUM: { minMatches: 1, label: 'Medium Confidence', emoji: '🟡', color: '#FF9800' },
  LOW: { minMatches: 0, label: 'Low Confidence', emoji: '🔴', color: '#f44336' }
};

// =============================================================================
// WEIGHTING FUNCTIONS
// =============================================================================

/**
 * Get the scouting/statbotics weight based on number of scouted matches
 * @param {number} matchCount - Number of scouted matches for a team
 * @returns {Object} - { scouting: number, statbotics: number }
 */
export function getDataWeights(matchCount) {
  if (matchCount >= 8) return SCOUTING_WEIGHTS[8];
  if (matchCount >= 4) return SCOUTING_WEIGHTS[4];
  if (matchCount >= 1) return SCOUTING_WEIGHTS[1];
  return SCOUTING_WEIGHTS[0];
}

// =============================================================================
// MATCH CONTRIBUTION SCORE (MCS) CALCULATION
// =============================================================================

/**
 * Calculate scouting-based EPA for a team from their scouting entries
 * @param {Array} scoutingEntries - Array of scouting entries for a team
 * @returns {Object} - { auto, teleop, endgame, total, matchCount }
 */
export function calculateScoutingEPA(scoutingEntries) {
  if (!scoutingEntries || scoutingEntries.length === 0) {
    return { auto: 0, teleop: 0, endgame: 0, total: 0, matchCount: 0 };
  }

  let totalAuto = 0, totalTeleop = 0, totalEndgame = 0;

  for (const entry of scoutingEntries) {
    totalAuto += calculateAutoPoints(entry);
    totalTeleop += calculateTeleopPoints(entry);
    totalEndgame += calculateEndgamePoints(entry);
  }

  const count = scoutingEntries.length;
  const auto = totalAuto / count;
  const teleop = totalTeleop / count;
  const endgame = totalEndgame / count;

  return {
    auto,
    teleop,
    endgame,
    total: auto + teleop + endgame,
    matchCount: count
  };
}

/**
 * Get Statbotics EPA values for a team
 * @param {Object} statboticsData - Statbotics team data
 * @returns {Object} - { auto, teleop, endgame, total }
 */
export function getStatboticsEPA(statboticsData) {
  if (!statboticsData) {
    return { auto: 0, teleop: 0, endgame: 0, total: 0 };
  }

  const breakdown = statboticsData.epa?.breakdown || {};
  const total = statboticsData.epa?.total_points?.mean || breakdown.total_points || 0;

  return {
    auto: breakdown.auto_points || 0,
    teleop: breakdown.teleop_points || 0,
    endgame: breakdown.endgame_points || 0,
    total
  };
}

/**
 * Calculate Match Contribution Score (MCS) for a team
 * Blends scouting and Statbotics data based on scouting coverage
 * @param {Array} scoutingEntries - Scouting entries for the team
 * @param {Object} statboticsData - Statbotics data for the team
 * @returns {Object} - { auto, teleop, endgame, total, weights, matchCount }
 */
export function calculateMCS(scoutingEntries, statboticsData) {
  const scoutingEPA = calculateScoutingEPA(scoutingEntries);
  const statboticsEPA = getStatboticsEPA(statboticsData);
  const weights = getDataWeights(scoutingEPA.matchCount);

  const auto = (scoutingEPA.auto * weights.scouting) + (statboticsEPA.auto * weights.statbotics);
  const teleop = (scoutingEPA.teleop * weights.scouting) + (statboticsEPA.teleop * weights.statbotics);
  const endgame = (scoutingEPA.endgame * weights.scouting) + (statboticsEPA.endgame * weights.statbotics);

  return {
    auto,
    teleop,
    endgame,
    total: auto + teleop + endgame,
    weights,
    matchCount: scoutingEPA.matchCount,
    scoutingEPA,
    statboticsEPA
  };
}

// =============================================================================
// SYNERGY CALCULATIONS
// =============================================================================

/**
 * Get the dominant robot role from scouting entries
 * @param {Array} scoutingEntries - Scouting entries for a team
 * @returns {string|null} - 'shooter', 'cycler', 'defense', or null
 */
export function getDominantRole(scoutingEntries) {
  if (!scoutingEntries || scoutingEntries.length === 0) return null;

  const roleCounts = { shooter: 0, cycler: 0, defense: 0 };
  for (const entry of scoutingEntries) {
    if (entry.robotRole && roleCounts[entry.robotRole] !== undefined) {
      roleCounts[entry.robotRole]++;
    }
  }

  const maxCount = Math.max(...Object.values(roleCounts));
  if (maxCount === 0) return null;

  return Object.keys(roleCounts).find(role => roleCounts[role] === maxCount);
}

/**
 * Calculate offense synergy modifier based on robot roles
 * @param {Array} teamRoles - Array of role strings for alliance teams
 * @returns {number} - Synergy modifier (multiplier)
 */
export function calculateOffenseSynergy(teamRoles) {
  const shooters = teamRoles.filter(r => r === 'shooter').length;
  const cyclers = teamRoles.filter(r => r === 'cycler').length;

  // Shooter + Cycler pairing bonus
  if (shooters >= 1 && cyclers >= 1) {
    return SYNERGY.SHOOTER_CYCLER_BONUS;
  }

  // Multiple shooters without cycler penalty
  if (shooters >= 2 && cyclers === 0) {
    return SYNERGY.MULTIPLE_SHOOTERS_PENALTY;
  }

  // Cycler without shooter penalty
  if (cyclers >= 1 && shooters === 0) {
    return SYNERGY.CYCLER_NO_SHOOTER_PENALTY;
  }

  return 1.0; // No modifier
}

/**
 * Calculate auto synergy modifier based on auto objectives
 * @param {Array} teamScoutingData - Array of scouting data arrays for each team
 * @returns {number} - Synergy modifier (multiplier)
 */
export function calculateAutoSynergy(teamScoutingData) {
  // Check if multiple teams attempt tower climb in auto
  let autoClimbers = 0;
  let fuelScorers = 0;

  for (const teamData of teamScoutingData) {
    if (!teamData || teamData.length === 0) continue;

    // Get average auto behavior
    const avgAutoTowerClimb = teamData.filter(e => e.autoTowerClimb && e.autoTowerClimb !== 'none').length / teamData.length;
    const avgAutoFuel = teamData.reduce((sum, e) => sum + (e.autoFuelScored || 0), 0) / teamData.length;

    if (avgAutoTowerClimb > 0.5) autoClimbers++;
    if (avgAutoFuel > 2) fuelScorers++;
  }

  // Congestion penalty if multiple teams doing same thing
  if (autoClimbers >= 2) {
    return SYNERGY.AUTO_CONGESTION_PENALTY;
  }

  // Complementary bonus for diverse auto strategies
  if (autoClimbers >= 1 && fuelScorers >= 1) {
    return SYNERGY.AUTO_COMPLEMENTARY_BONUS;
  }

  return 1.0;
}

/**
 * Calculate defense impact on opponent teleop
 * @param {number} defenseCount - Number of defensive robots
 * @returns {number} - Reduction multiplier for opponent teleop (0.88-1.0)
 */
export function calculateDefenseReduction(defenseCount) {
  if (defenseCount <= 0) return 1.0;

  // Each defensive robot reduces by 5%, capped at 12%
  const reduction = Math.pow(SYNERGY.DEFENSE_REDUCTION, defenseCount);
  return Math.max(reduction, SYNERGY.MAX_DEFENSE_REDUCTION);
}

// =============================================================================
// ALLIANCE SCORE CALCULATION
// =============================================================================

/**
 * Calculate predicted alliance score with synergy modifiers
 * @param {Array} teamData - Array of { teamKey, scoutingEntries, statboticsData }
 * @param {number} opponentDefenseCount - Number of defensive robots on opponent
 * @returns {Object} - { score, auto, teleop, endgame, synergy, teamBreakdown }
 */
export function calculateAllianceScore(teamData, opponentDefenseCount = 0) {
  if (!teamData || teamData.length === 0) {
    return { score: 0, auto: 0, teleop: 0, endgame: 0, synergy: 1.0, teamBreakdown: [] };
  }

  const teamBreakdown = [];
  let totalAuto = 0, totalTeleop = 0, totalEndgame = 0;
  const roles = [];
  const allScoutingData = [];

  // Calculate MCS for each team
  for (const team of teamData) {
    const mcs = calculateMCS(team.scoutingEntries || [], team.statboticsData);
    teamBreakdown.push({
      teamKey: team.teamKey,
      mcs,
      role: getDominantRole(team.scoutingEntries)
    });

    totalAuto += mcs.auto;
    totalTeleop += mcs.teleop;
    totalEndgame += mcs.endgame;

    if (teamBreakdown[teamBreakdown.length - 1].role) {
      roles.push(teamBreakdown[teamBreakdown.length - 1].role);
    }
    allScoutingData.push(team.scoutingEntries || []);
  }

  // Calculate synergy modifiers
  const offenseSynergy = calculateOffenseSynergy(roles);
  const autoSynergy = calculateAutoSynergy(allScoutingData);
  const defenseReduction = calculateDefenseReduction(opponentDefenseCount);

  // Apply synergy to teleop (offense synergy + defense reduction)
  const modifiedTeleop = totalTeleop * offenseSynergy * defenseReduction;

  // Apply auto synergy to auto
  const modifiedAuto = totalAuto * autoSynergy;

  // Combined synergy factor for display
  const overallSynergy = offenseSynergy * autoSynergy * defenseReduction;

  return {
    score: Math.round((modifiedAuto + modifiedTeleop + totalEndgame) * 10) / 10,
    auto: Math.round(modifiedAuto * 10) / 10,
    teleop: Math.round(modifiedTeleop * 10) / 10,
    endgame: Math.round(totalEndgame * 10) / 10,
    synergy: Math.round(overallSynergy * 100) / 100,
    teamBreakdown,
    modifiers: {
      offenseSynergy,
      autoSynergy,
      defenseReduction
    }
  };
}

// =============================================================================
// WIN PROBABILITY
// =============================================================================

/**
 * Calculate win probability using logistic function
 * @param {number} allianceScore - Predicted alliance score
 * @param {number} opponentScore - Predicted opponent score
 * @returns {number} - Win probability (0-1)
 */
export function calculateWinProbability(allianceScore, opponentScore) {
  const scoreDiff = allianceScore - opponentScore;
  // Logistic function with k=0.1 for smooth probability curve
  const probability = 1 / (1 + Math.exp(-0.1 * scoreDiff));
  return Math.round(probability * 1000) / 1000;
}

// =============================================================================
// CONFIDENCE DETERMINATION
// =============================================================================

/**
 * Get confidence level based on scouting coverage
 * @param {Array} teamData - Array of { teamKey, scoutingEntries }
 * @returns {Object} - { level, label, emoji, color, avgMatches }
 */
export function getConfidenceLevel(teamData) {
  if (!teamData || teamData.length === 0) {
    return { ...CONFIDENCE.LOW, level: 'low', avgMatches: 0 };
  }

  const matchCounts = teamData.map(t => (t.scoutingEntries || []).length);
  const avgMatches = matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length;
  const minMatches = Math.min(...matchCounts);

  // High confidence: all teams have 8+ scouted matches
  if (minMatches >= 8) {
    return { ...CONFIDENCE.HIGH, level: 'high', avgMatches };
  }

  // Medium confidence: at least some scouting data
  if (avgMatches >= 1) {
    return { ...CONFIDENCE.MEDIUM, level: 'medium', avgMatches };
  }

  // Low confidence: mostly Statbotics data
  return { ...CONFIDENCE.LOW, level: 'low', avgMatches };
}

// =============================================================================
// FULL MATCH PREDICTION
// =============================================================================

/**
 * Generate a complete match prediction
 * @param {Object} redAlliance - { teams: [{ teamKey, scoutingEntries, statboticsData }] }
 * @param {Object} blueAlliance - { teams: [{ teamKey, scoutingEntries, statboticsData }] }
 * @returns {Object} - Complete prediction with scores, probabilities, confidence
 */
export function predictMatch(redAlliance, blueAlliance) {
  // Count defensive robots on each alliance
  const redDefenseCount = (redAlliance.teams || []).filter(t =>
    getDominantRole(t.scoutingEntries) === 'defense'
  ).length;
  const blueDefenseCount = (blueAlliance.teams || []).filter(t =>
    getDominantRole(t.scoutingEntries) === 'defense'
  ).length;

  // Calculate scores (opponent's defense affects your teleop)
  const redScore = calculateAllianceScore(redAlliance.teams || [], blueDefenseCount);
  const blueScore = calculateAllianceScore(blueAlliance.teams || [], redDefenseCount);

  // Calculate win probabilities
  const redWinProb = calculateWinProbability(redScore.score, blueScore.score);
  const blueWinProb = 1 - redWinProb;

  // Get confidence levels
  const redConfidence = getConfidenceLevel(redAlliance.teams || []);
  const blueConfidence = getConfidenceLevel(blueAlliance.teams || []);

  // Overall confidence is the lower of the two
  const overallConfidence = redConfidence.level === 'low' || blueConfidence.level === 'low'
    ? CONFIDENCE.LOW
    : redConfidence.level === 'medium' || blueConfidence.level === 'medium'
      ? CONFIDENCE.MEDIUM
      : CONFIDENCE.HIGH;

  return {
    red: {
      score: redScore.score,
      auto: redScore.auto,
      teleop: redScore.teleop,
      endgame: redScore.endgame,
      synergy: redScore.synergy,
      winProbability: redWinProb,
      confidence: redConfidence,
      teamBreakdown: redScore.teamBreakdown,
      modifiers: redScore.modifiers
    },
    blue: {
      score: blueScore.score,
      auto: blueScore.auto,
      teleop: blueScore.teleop,
      endgame: blueScore.endgame,
      synergy: blueScore.synergy,
      winProbability: blueWinProb,
      confidence: blueConfidence,
      teamBreakdown: blueScore.teamBreakdown,
      modifiers: blueScore.modifiers
    },
    confidence: {
      ...overallConfidence,
      level: overallConfidence === CONFIDENCE.HIGH ? 'high'
        : overallConfidence === CONFIDENCE.MEDIUM ? 'medium' : 'low'
    },
    winner: redWinProb > 0.5 ? 'red' : 'blue',
    margin: Math.abs(redScore.score - blueScore.score)
  };
}
