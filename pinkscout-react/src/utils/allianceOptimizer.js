/**
 * =============================================================================
 * ALLIANCE OPTIMIZER UTILITY
 * =============================================================================
 *
 * AI-driven (math-based) alliance optimization engine:
 * - Calculates optimal 2nd/3rd pick recommendations
 * - Applies risk adjustment based on consistency and volatility
 * - Considers team synergy, complementary roles, and climb strategies
 *
 * NO EXTERNAL API - Pure math-based optimization
 *
 * =============================================================================
 */

import { calculateAllianceCompatibility } from './allianceCompatibility';

/**
 * Risk factors that reduce a team's recommendation score
 */
const RISK_WEIGHTS = {
  lowConsistency: 0.15,    // Penalty for inconsistent teams
  highVolatility: 0.10,    // Penalty for volatile performance
  limitedData: 0.20,       // Penalty for teams with few scouted matches
  recentDecline: 0.12      // Penalty for declining performance
};

/**
 * Calculate risk-adjusted score for a team
 * @param {Object} team - Team data with performance metrics
 * @returns {Object} { riskScore, adjustedScore, riskFactors }
 */
export function calculateRiskAdjustedScore(team) {
  const baseScore = team.synergyScore || team.epaValue || team.avgTotalPoints || 0;
  const riskFactors = [];
  let riskPenalty = 0;

  // Consistency risk (from performance metrics)
  if (team.consistency !== undefined && team.consistency < 50) {
    const penalty = (50 - team.consistency) / 100 * RISK_WEIGHTS.lowConsistency * baseScore;
    riskPenalty += penalty;
    riskFactors.push({
      factor: 'Low Consistency',
      penalty: penalty.toFixed(1),
      details: `${team.consistency}% consistency`
    });
  }

  // Volatility risk
  if (team.volatility !== undefined && team.volatility > 10) {
    const penalty = Math.min((team.volatility - 10) / 20, 1) * RISK_WEIGHTS.highVolatility * baseScore;
    riskPenalty += penalty;
    riskFactors.push({
      factor: 'High Volatility',
      penalty: penalty.toFixed(1),
      details: `±${team.volatility.toFixed(1)} pts variance`
    });
  }

  // Limited data risk
  if (team.matchCount !== undefined && team.matchCount < 5) {
    const penalty = (5 - team.matchCount) / 5 * RISK_WEIGHTS.limitedData * baseScore;
    riskPenalty += penalty;
    riskFactors.push({
      factor: 'Limited Data',
      penalty: penalty.toFixed(1),
      details: `Only ${team.matchCount} matches scouted`
    });
  }

  // Recent decline risk
  if (team.slope !== undefined && team.slope < -1) {
    const penalty = Math.min(Math.abs(team.slope) / 5, 1) * RISK_WEIGHTS.recentDecline * baseScore;
    riskPenalty += penalty;
    riskFactors.push({
      factor: 'Declining Performance',
      penalty: penalty.toFixed(1),
      details: `${team.slope.toFixed(1)} pts/match trend`
    });
  }

  const adjustedScore = Math.max(0, baseScore - riskPenalty);
  const riskScore = baseScore > 0 ? (riskPenalty / baseScore) * 100 : 0;

  return {
    baseScore,
    riskScore: Math.round(riskScore),
    adjustedScore: Math.round(adjustedScore * 10) / 10,
    riskFactors
  };
}

/**
 * Calculate combined alliance potential (for 2 or 3 teams)
 * @param {Array} teams - Array of team objects
 * @returns {Object} { totalScore, riskAdjustedScore, compatibility, recommendation }
 */
export function calculateAlliancePotential(teams) {
  if (!teams || teams.length < 2) {
    return { totalScore: 0, riskAdjustedScore: 0, compatibility: null, recommendation: 'N/A' };
  }

  // Calculate individual risk-adjusted scores
  const teamScores = teams.map(t => ({
    ...t,
    ...calculateRiskAdjustedScore(t)
  }));

  // Sum of base scores
  const totalScore = teamScores.reduce((sum, t) => sum + t.baseScore, 0);
  
  // Sum of risk-adjusted scores
  const riskAdjustedScore = teamScores.reduce((sum, t) => sum + t.adjustedScore, 0);
  
  // Alliance compatibility
  const compatibility = calculateAllianceCompatibility(teams);
  
  // Apply compatibility multiplier (0.9 to 1.1 based on compatibility)
  const compatibilityMultiplier = 0.9 + (compatibility.overall / 1000);
  const finalScore = riskAdjustedScore * compatibilityMultiplier;

  // Generate recommendation strength
  let recommendation;
  if (finalScore >= 150 && compatibility.overall >= 80) {
    recommendation = 'Strong Pick ⭐';
  } else if (finalScore >= 120 && compatibility.overall >= 65) {
    recommendation = 'Good Pick 👍';
  } else if (finalScore >= 90) {
    recommendation = 'Decent Pick 👌';
  } else if (finalScore >= 60) {
    recommendation = 'Risky Pick ⚠️';
  } else {
    recommendation = 'Weak Pick ❌';
  }

  return {
    totalScore: Math.round(totalScore * 10) / 10,
    riskAdjustedScore: Math.round(riskAdjustedScore * 10) / 10,
    finalScore: Math.round(finalScore * 10) / 10,
    compatibility,
    recommendation,
    teamScores
  };
}

/**
 * Find optimal 2nd pick for an alliance captain
 * @param {Object} captain - Captain team data
 * @param {Array} availableTeams - Teams available to pick
 * @param {number} topN - Number of recommendations (default 5)
 * @returns {Array} Top N 2nd pick recommendations with analysis
 */
export function findOptimal2ndPick(captain, availableTeams, topN = 5) {
  if (!captain || !availableTeams || availableTeams.length === 0) {
    return [];
  }

  // Score each potential 2nd pick
  const candidates = availableTeams.map(team => {
    const potential = calculateAlliancePotential([captain, team]);
    return {
      team,
      ...potential,
      reasoning: generatePickReasoning(captain, team, potential)
    };
  });

  // Sort by final score (highest first)
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  return candidates.slice(0, topN);
}

/**
 * Find optimal 3rd pick given captain and 2nd pick
 * @param {Object} captain - Captain team data
 * @param {Object} secondPick - 2nd pick team data
 * @param {Array} availableTeams - Teams available to pick
 * @param {number} topN - Number of recommendations (default 5)
 * @returns {Array} Top N 3rd pick recommendations with analysis
 */
export function findOptimal3rdPick(captain, secondPick, availableTeams, topN = 5) {
  if (!captain || !secondPick || !availableTeams || availableTeams.length === 0) {
    return [];
  }

  // Score each potential 3rd pick
  const candidates = availableTeams.map(team => {
    const potential = calculateAlliancePotential([captain, secondPick, team]);
    return {
      team,
      ...potential,
      reasoning: generatePickReasoning3rd(captain, secondPick, team, potential)
    };
  });

  // Sort by final score (highest first)
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  return candidates.slice(0, topN);
}

/**
 * Generate human-readable reasoning for a 2nd pick
 */
function generatePickReasoning(captain, pick, potential) {
  const reasons = [];

  // Role synergy
  if (potential.compatibility?.roleCompatibility >= 90) {
    reasons.push(`Excellent role synergy with ${captain.primaryRole || 'hybrid'}`);
  } else if (potential.compatibility?.roleCompatibility >= 75) {
    reasons.push('Good role complement');
  }

  // Risk assessment
  const pickRisk = calculateRiskAdjustedScore(pick);
  if (pickRisk.riskScore < 10) {
    reasons.push('Low risk - consistent performer');
  } else if (pickRisk.riskScore >= 30) {
    reasons.push('⚠️ Higher risk - inconsistent');
  }

  // Auto path
  if (potential.compatibility?.autoPath >= 80) {
    reasons.push('No auto path conflict');
  }

  // Strength
  if (pick.avgTotalPoints >= 30) {
    reasons.push('High scoring potential');
  }

  return reasons.length > 0 ? reasons.join(', ') : 'Standard pick';
}

/**
 * Generate human-readable reasoning for a 3rd pick
 */
function generatePickReasoning3rd(captain, secondPick, pick, potential) {
  const reasons = [];

  // Role diversity
  const roles = [captain.primaryRole, secondPick.primaryRole, pick.primaryRole].filter(Boolean);
  const uniqueRoles = new Set(roles).size;
  if (uniqueRoles === 3) {
    reasons.push('Completes role diversity');
  } else if (uniqueRoles === 2 && !roles.includes(pick.primaryRole)) {
    reasons.push('Adds new role to alliance');
  }

  // Climb synergy
  if (potential.compatibility?.climbSynergy >= 85) {
    reasons.push('Great climb strategy fit');
  }

  // Fill gaps
  if (captain.avgAutoFuel < 5 && pick.avgAutoFuel >= 5) {
    reasons.push('Adds auto scoring');
  }
  if (captain.avgTeleopFuel < 10 && pick.avgTeleopFuel >= 10) {
    reasons.push('Adds teleop power');
  }

  // Defense option
  if (pick.primaryRole === 'Defense' && captain.primaryRole !== 'Defense' && secondPick.primaryRole !== 'Defense') {
    reasons.push('Adds defensive option');
  }

  // Risk
  const pickRisk = calculateRiskAdjustedScore(pick);
  if (pickRisk.riskScore < 10) {
    reasons.push('Reliable performer');
  }

  return reasons.length > 0 ? reasons.join(', ') : 'Standard 3rd pick';
}

/**
 * Get full alliance optimization with risk analysis
 * @param {Object} captain - Captain team
 * @param {Array} availableTeams - All available teams
 * @returns {Object} Complete optimization analysis
 */
export function getFullAllianceOptimization(captain, availableTeams) {
  const secondPicks = findOptimal2ndPick(captain, availableTeams, 5);

  const optimizations = secondPicks.map(sp => {
    // For each 2nd pick, find best 3rd picks (excluding 2nd pick)
    const remaining = availableTeams.filter(t => t.teamNumber !== sp.team.teamNumber);
    const thirdPicks = findOptimal3rdPick(captain, sp.team, remaining, 3);

    return {
      secondPick: sp,
      thirdPicks
    };
  });

  return {
    captain,
    optimizations,
    bestAlliance: optimizations[0] ? {
      teams: [captain, optimizations[0].secondPick.team, optimizations[0].thirdPicks[0]?.team],
      ...optimizations[0].thirdPicks[0]
    } : null
  };
}

