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
 * - Reliability metrics (auto success, endgame success, match completion)
 * - Defense modeling with diminishing returns and 12% hard cap
 * - Inactive/low-impact robot detection
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
  0: { scouting: 0, statbotics: 1 },       // No scouting data
  1: { scouting: 0.6, statbotics: 0.4 },   // 1-3 matches
  4: { scouting: 0.75, statbotics: 0.25 }, // 4-7 matches
  8: { scouting: 0.9, statbotics: 0.1 },   // 8-15 matches
  16: { scouting: 1.0, statbotics: 0 }     // 16+ matches: full scouting dominance
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
  DEFENSE_REDUCTION: 0.96,          // Per defensive robot (~4% per robot)
  MAX_DEFENSE_REDUCTION: 0.88       // Hard cap at exactly 12% reduction
};

// Defense quality modifiers based on normalized rating
export const DEFENSE_QUALITY = {
  PASSIVE_THRESHOLD: 2,    // Ratings 1-2 = passive interference
  ACTIVE_THRESHOLD: 3,     // Ratings 3-5 = active disruption
  PASSIVE_EFFECTIVENESS: 0.5,  // Passive defense is 50% as effective
  ACTIVE_EFFECTIVENESS: 1.0    // Active defense is fully effective
};

// Reliability thresholds
export const RELIABILITY = {
  HIGH_THRESHOLD: 0.75,    // 75%+ success rate = high reliability
  MEDIUM_THRESHOLD: 0.50,  // 50%+ success rate = medium reliability
  HIGH_MULTIPLIER: 1.05,   // 5% bonus for high reliability
  MEDIUM_MULTIPLIER: 1.0,  // No change for medium reliability
  LOW_MULTIPLIER: 0.92     // 8% penalty for low reliability
};

// Low-impact robot detection thresholds
export const LOW_IMPACT = {
  MIN_MATCHES_TO_DETECT: 3,       // Need at least 3 matches to detect
  MAX_AVG_POINTS: 3,              // Below 3 avg points = potential low impact
  MIN_CYCLE_RATE: 0.2,            // Less than 20% matches with cycles
  MIN_ENDGAME_RATE: 0.1,          // Less than 10% endgame success
  PENALTY_MULTIPLIER: 0.85        // 15% global penalty (not zeroed out)
};

// Confidence thresholds - stricter requirements
export const CONFIDENCE = {
  HIGH: { minMatches: 8, label: 'High Confidence', emoji: '🟢', color: '#4CAF50' },
  MEDIUM: { minMatches: 4, label: 'Medium Confidence', emoji: '🟡', color: '#FF9800' },
  LOW: { minMatches: 0, label: 'Low Confidence', emoji: '🔴', color: '#f44336' }
};

// =============================================================================
// CROSS-EVENT SCOUTING DECAY CONFIGURATION
// =============================================================================

// Decay weights for previous event scouting data
// Current event data always dominates; previous events are heavily discounted
export const CROSS_EVENT_DECAY = {
  CURRENT_EVENT: 1.0,      // 100% weight for current event
  ONE_EVENT_AGO: 0.35,     // 35% weight for 1 event ago
  TWO_EVENTS_AGO: 0.15,    // 15% weight for 2 events ago
  THREE_PLUS_AGO: 0.05,    // 5% weight for 3+ events ago (optional/minimal)

  // Minimum current-event matches before using cross-event data
  MIN_CURRENT_MATCHES_FOR_FULL_WEIGHT: 4,

  // If current event has fewer than this, blend with previous events
  SPARSE_DATA_THRESHOLD: 2,

  // Defense decay is even heavier (robots change defense strategy frequently)
  DEFENSE_DECAY_MULTIPLIER: 0.5,  // Previous event defense is 50% of normal decay

  // Role decay - roles can change between events
  ROLE_DECAY_MULTIPLIER: 0.7      // Previous event roles are 70% of normal decay
};

// =============================================================================
// WEIGHTING FUNCTIONS
// =============================================================================

/**
 * Get the scouting/statbotics weight based on number of scouted matches
 * With 16+ matches, scouting fully dominates (100% weight, 0% Statbotics)
 * @param {number} matchCount - Number of scouted matches for a team
 * @returns {Object} - { scouting: number, statbotics: number }
 */
export function getDataWeights(matchCount) {
  if (matchCount >= 16) return SCOUTING_WEIGHTS[16];  // Full scouting dominance
  if (matchCount >= 8) return SCOUTING_WEIGHTS[8];
  if (matchCount >= 4) return SCOUTING_WEIGHTS[4];
  if (matchCount >= 1) return SCOUTING_WEIGHTS[1];
  return SCOUTING_WEIGHTS[0];
}

/**
 * Get decay weight based on how many events ago the data is from
 * @param {number} eventsAgo - Number of events ago (0 = current, 1 = previous, etc.)
 * @returns {number} - Decay weight (0-1)
 */
export function getEventDecayWeight(eventsAgo) {
  if (eventsAgo <= 0) return CROSS_EVENT_DECAY.CURRENT_EVENT;
  if (eventsAgo === 1) return CROSS_EVENT_DECAY.ONE_EVENT_AGO;
  if (eventsAgo === 2) return CROSS_EVENT_DECAY.TWO_EVENTS_AGO;
  return CROSS_EVENT_DECAY.THREE_PLUS_AGO;
}

// =============================================================================
// CROSS-EVENT SCOUTING DATA ORGANIZATION
// =============================================================================

/**
 * Organize scouting entries by event, sorted by recency
 * @param {Array} allScoutingEntries - All scouting entries for a team across events
 * @param {string} currentEventKey - The current event key
 * @returns {Object} - { currentEvent: [], previousEvents: [{ eventKey, entries, eventsAgo }] }
 */
export function organizeScoutingByEvent(allScoutingEntries, currentEventKey) {
  if (!allScoutingEntries || allScoutingEntries.length === 0) {
    return { currentEvent: [], previousEvents: [], allEventKeys: [] };
  }

  // Group entries by event key
  const eventGroups = {};
  for (const entry of allScoutingEntries) {
    const eventKey = entry.eventKey;
    if (!eventKey) continue;

    if (!eventGroups[eventKey]) {
      eventGroups[eventKey] = [];
    }
    eventGroups[eventKey].push(entry);
  }

  // Separate current event from previous events
  const currentEventEntries = eventGroups[currentEventKey] || [];
  delete eventGroups[currentEventKey];

  // Sort previous events by date (most recent first)
  // Event keys typically start with year (e.g., "2026casj")
  const previousEventKeys = Object.keys(eventGroups).sort((a, b) => {
    // Sort by event key descending (newer events first)
    return b.localeCompare(a);
  });

  const previousEvents = previousEventKeys.map((eventKey, index) => ({
    eventKey,
    entries: eventGroups[eventKey],
    eventsAgo: index + 1,
    decayWeight: getEventDecayWeight(index + 1)
  }));

  return {
    currentEvent: currentEventEntries,
    previousEvents,
    allEventKeys: [currentEventKey, ...previousEventKeys].filter(Boolean)
  };
}

/**
 * Calculate effective scouted EPA by combining current event with decayed previous events
 * Current event data always dominates; previous events fill gaps when data is sparse
 * @param {Array} currentEventEntries - Scouting entries from current event
 * @param {Array} previousEvents - Array of { eventKey, entries, eventsAgo, decayWeight }
 * @returns {Object} - { auto, teleop, endgame, total, effectiveMatchCount, crossEventUsed }
 */
export function calculateEffectiveScoutedEPA(currentEventEntries, previousEvents) {
  const currentCount = currentEventEntries?.length || 0;

  // If current event has sufficient data, use it exclusively
  if (currentCount >= CROSS_EVENT_DECAY.MIN_CURRENT_MATCHES_FOR_FULL_WEIGHT) {
    const epa = calculateScoutingEPAFromEntries(currentEventEntries);
    return {
      ...epa,
      effectiveMatchCount: currentCount,
      crossEventUsed: false,
      dataSource: 'current-event-only'
    };
  }

  // Calculate current event EPA (if any)
  let totalAuto = 0, totalTeleop = 0, totalEndgame = 0;
  let totalWeight = 0;

  if (currentCount > 0) {
    const currentEPA = calculateScoutingEPAFromEntries(currentEventEntries);
    const currentWeight = CROSS_EVENT_DECAY.CURRENT_EVENT * currentCount;

    totalAuto += currentEPA.auto * currentWeight;
    totalTeleop += currentEPA.teleop * currentWeight;
    totalEndgame += currentEPA.endgame * currentWeight;
    totalWeight += currentWeight;
  }

  // Add decayed previous event data
  let crossEventUsed = false;
  for (const prevEvent of (previousEvents || [])) {
    if (!prevEvent.entries || prevEvent.entries.length === 0) continue;

    const prevEPA = calculateScoutingEPAFromEntries(prevEvent.entries);
    const decayWeight = prevEvent.decayWeight * prevEvent.entries.length;

    totalAuto += prevEPA.auto * decayWeight;
    totalTeleop += prevEPA.teleop * decayWeight;
    totalEndgame += prevEPA.endgame * decayWeight;
    totalWeight += decayWeight;
    crossEventUsed = true;
  }

  // Normalize by total weight
  if (totalWeight === 0) {
    return {
      auto: 0, teleop: 0, endgame: 0, total: 0,
      effectiveMatchCount: 0,
      crossEventUsed: false,
      dataSource: 'none'
    };
  }

  const auto = totalAuto / totalWeight;
  const teleop = totalTeleop / totalWeight;
  const endgame = totalEndgame / totalWeight;

  return {
    auto,
    teleop,
    endgame,
    total: auto + teleop + endgame,
    effectiveMatchCount: totalWeight,
    crossEventUsed,
    dataSource: crossEventUsed ? 'current-plus-previous' : 'current-event-only'
  };
}

/**
 * Helper: Calculate EPA from entries (used internally)
 */
function calculateScoutingEPAFromEntries(entries) {
  if (!entries || entries.length === 0) {
    return { auto: 0, teleop: 0, endgame: 0, total: 0 };
  }

  let totalAuto = 0, totalTeleop = 0, totalEndgame = 0;
  for (const entry of entries) {
    totalAuto += calculateAutoPoints(entry);
    totalTeleop += calculateTeleopPoints(entry);
    totalEndgame += calculateEndgamePoints(entry);
  }

  const count = entries.length;
  const auto = totalAuto / count;
  const teleop = totalTeleop / count;
  const endgame = totalEndgame / count;

  return { auto, teleop, endgame, total: auto + teleop + endgame };
}

/**
 * Calculate decayed reliability metrics from cross-event data
 * Reliability from previous events is discounted proportionally
 * @param {Array} currentEventEntries - Current event scouting entries
 * @param {Array} previousEvents - Previous event data with decay weights
 * @returns {Object} - Combined reliability metrics with decay applied
 */
export function calculateCrossEventReliability(currentEventEntries, previousEvents) {
  const currentCount = currentEventEntries?.length || 0;

  // If current event has sufficient data, use it exclusively
  if (currentCount >= CROSS_EVENT_DECAY.MIN_CURRENT_MATCHES_FOR_FULL_WEIGHT) {
    return calculateReliabilityMetrics(currentEventEntries);
  }

  // Blend current and previous event reliability
  let totalAutoSuccess = 0, totalEndgameSuccess = 0, totalCompletion = 0;
  let totalWeight = 0;

  if (currentCount > 0) {
    const currentRel = calculateReliabilityMetrics(currentEventEntries);
    const weight = CROSS_EVENT_DECAY.CURRENT_EVENT * currentCount;

    totalAutoSuccess += currentRel.autoSuccessRate * weight;
    totalEndgameSuccess += currentRel.endgameSuccessRate * weight;
    totalCompletion += currentRel.matchCompletionRate * weight;
    totalWeight += weight;
  }

  for (const prevEvent of (previousEvents || [])) {
    if (!prevEvent.entries || prevEvent.entries.length === 0) continue;

    const prevRel = calculateReliabilityMetrics(prevEvent.entries);
    const weight = prevEvent.decayWeight * prevEvent.entries.length;

    totalAutoSuccess += prevRel.autoSuccessRate * weight;
    totalEndgameSuccess += prevRel.endgameSuccessRate * weight;
    totalCompletion += prevRel.matchCompletionRate * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return {
      autoSuccessRate: 0,
      endgameSuccessRate: 0,
      matchCompletionRate: 0,
      overallReliability: 0,
      reliabilityMultiplier: RELIABILITY.LOW_MULTIPLIER
    };
  }

  const autoSuccessRate = totalAutoSuccess / totalWeight;
  const endgameSuccessRate = totalEndgameSuccess / totalWeight;
  const matchCompletionRate = totalCompletion / totalWeight;
  const overallReliability = (autoSuccessRate * 0.4) + (endgameSuccessRate * 0.3) + (matchCompletionRate * 0.3);

  let reliabilityMultiplier = RELIABILITY.MEDIUM_MULTIPLIER;
  if (overallReliability >= RELIABILITY.HIGH_THRESHOLD) {
    reliabilityMultiplier = RELIABILITY.HIGH_MULTIPLIER;
  } else if (overallReliability < RELIABILITY.MEDIUM_THRESHOLD) {
    reliabilityMultiplier = RELIABILITY.LOW_MULTIPLIER;
  }

  return {
    autoSuccessRate,
    endgameSuccessRate,
    matchCompletionRate,
    overallReliability,
    reliabilityMultiplier
  };
}

/**
 * Get dominant role with cross-event decay
 * Roles from previous events are heavily discounted
 * @param {Array} currentEventEntries - Current event scouting entries
 * @param {Array} previousEvents - Previous event data with decay weights
 * @returns {string|null} - Dominant role or null
 */
export function getCrossEventDominantRole(currentEventEntries, previousEvents) {
  const currentCount = currentEventEntries?.length || 0;

  // If current event has sufficient data, use it exclusively
  if (currentCount >= CROSS_EVENT_DECAY.MIN_CURRENT_MATCHES_FOR_FULL_WEIGHT) {
    return getDominantRole(currentEventEntries);
  }

  // Weighted role counting
  const roleWeights = { shooter: 0, cycler: 0, defense: 0 };

  // Current event roles (full weight)
  if (currentCount > 0) {
    for (const entry of currentEventEntries) {
      if (entry.robotRole && roleWeights[entry.robotRole] !== undefined) {
        roleWeights[entry.robotRole] += CROSS_EVENT_DECAY.CURRENT_EVENT;
      }
    }
  }

  // Previous event roles (decayed weight with extra role decay multiplier)
  for (const prevEvent of (previousEvents || [])) {
    if (!prevEvent.entries || prevEvent.entries.length === 0) continue;

    const roleDecay = prevEvent.decayWeight * CROSS_EVENT_DECAY.ROLE_DECAY_MULTIPLIER;
    for (const entry of prevEvent.entries) {
      if (entry.robotRole && roleWeights[entry.robotRole] !== undefined) {
        roleWeights[entry.robotRole] += roleDecay;
      }
    }
  }

  const maxWeight = Math.max(...Object.values(roleWeights));
  if (maxWeight === 0) return null;

  return Object.keys(roleWeights).find(role => roleWeights[role] === maxWeight);
}

/**
 * Calculate cross-event defense quality with heavy decay
 * Defense from previous events is heavily discounted
 * @param {Array} currentEventEntries - Current event scouting entries
 * @param {Array} previousEvents - Previous event data with decay weights
 * @returns {Object} - Defense quality with decay applied
 */
export function getCrossEventDefenseQuality(currentEventEntries, previousEvents) {
  const currentCount = currentEventEntries?.length || 0;

  // If current event has sufficient data, use it exclusively
  if (currentCount >= CROSS_EVENT_DECAY.MIN_CURRENT_MATCHES_FOR_FULL_WEIGHT) {
    return calculateDefenseQuality(currentEventEntries);
  }

  // Weighted defense rating
  let totalRating = 0;
  let totalWeight = 0;
  let defenseMatchCount = 0;

  // Current event defense (full weight)
  const currentDefenseMatches = (currentEventEntries || []).filter(e => e.robotRole === 'defense');
  if (currentDefenseMatches.length > 0) {
    for (const entry of currentDefenseMatches) {
      totalRating += (entry.defenseRating || 0) * CROSS_EVENT_DECAY.CURRENT_EVENT;
      totalWeight += CROSS_EVENT_DECAY.CURRENT_EVENT;
      defenseMatchCount++;
    }
  }

  // Previous event defense (heavily decayed)
  for (const prevEvent of (previousEvents || [])) {
    if (!prevEvent.entries || prevEvent.entries.length === 0) continue;

    const defenseDecay = prevEvent.decayWeight * CROSS_EVENT_DECAY.DEFENSE_DECAY_MULTIPLIER;
    const prevDefenseMatches = prevEvent.entries.filter(e => e.robotRole === 'defense');

    for (const entry of prevDefenseMatches) {
      totalRating += (entry.defenseRating || 0) * defenseDecay;
      totalWeight += defenseDecay;
      defenseMatchCount++;
    }
  }

  if (totalWeight === 0 || defenseMatchCount === 0) {
    return { avgRating: 0, quality: 'none', effectiveness: 0 };
  }

  const avgRating = totalRating / totalWeight;

  let quality, effectiveness;
  if (avgRating >= DEFENSE_QUALITY.ACTIVE_THRESHOLD) {
    quality = 'active';
    effectiveness = DEFENSE_QUALITY.ACTIVE_EFFECTIVENESS;
  } else if (avgRating >= 1) {
    quality = 'passive';
    effectiveness = DEFENSE_QUALITY.PASSIVE_EFFECTIVENESS;
  } else {
    quality = 'none';
    effectiveness = 0;
  }

  return { avgRating, quality, effectiveness };
}

// =============================================================================
// RELIABILITY METRICS (Derived from existing scouting data)
// =============================================================================

/**
 * Calculate reliability metrics from scouting entries
 * These are derived from existing data - NO new form fields required
 * @param {Array} scoutingEntries - Array of scouting entries for a team
 * @returns {Object} - { autoSuccessRate, endgameSuccessRate, matchCompletionRate, overallReliability }
 */
export function calculateReliabilityMetrics(scoutingEntries) {
  if (!scoutingEntries || scoutingEntries.length === 0) {
    return {
      autoSuccessRate: 0,
      endgameSuccessRate: 0,
      matchCompletionRate: 0,
      overallReliability: 0,
      reliabilityMultiplier: RELIABILITY.LOW_MULTIPLIER
    };
  }

  const count = scoutingEntries.length;

  // Auto success: matches where robot scored ANY auto points
  const autoSuccesses = scoutingEntries.filter(e => {
    const autoPoints = calculateAutoPoints(e);
    return autoPoints > 0;
  }).length;
  const autoSuccessRate = autoSuccesses / count;

  // Endgame success: matches where robot achieved ANY endgame level
  const endgameSuccesses = scoutingEntries.filter(e => {
    const endgamePoints = calculateEndgamePoints(e);
    return endgamePoints > 0;
  }).length;
  const endgameSuccessRate = endgameSuccesses / count;

  // Match completion: robot had any positive contribution (not broken/inactive)
  const activeMatches = scoutingEntries.filter(e => {
    const totalPoints = calculateAutoPoints(e) + calculateTeleopPoints(e) + calculateEndgamePoints(e);
    return totalPoints > 0;
  }).length;
  const matchCompletionRate = activeMatches / count;

  // Overall reliability is weighted average (auto matters most)
  const overallReliability = (autoSuccessRate * 0.4) +
                              (endgameSuccessRate * 0.3) +
                              (matchCompletionRate * 0.3);

  // Determine reliability multiplier
  let reliabilityMultiplier = RELIABILITY.MEDIUM_MULTIPLIER;
  if (overallReliability >= RELIABILITY.HIGH_THRESHOLD) {
    reliabilityMultiplier = RELIABILITY.HIGH_MULTIPLIER;
  } else if (overallReliability < RELIABILITY.MEDIUM_THRESHOLD) {
    reliabilityMultiplier = RELIABILITY.LOW_MULTIPLIER;
  }

  return {
    autoSuccessRate,
    endgameSuccessRate,
    matchCompletionRate,
    overallReliability,
    reliabilityMultiplier
  };
}

/**
 * Detect if a robot is low-impact based on consistent poor performance
 * Does NOT zero out the robot, just applies a small penalty
 * @param {Array} scoutingEntries - Array of scouting entries for a team
 * @returns {Object} - { isLowImpact: boolean, penalty: number, reason: string }
 */
export function detectLowImpactRobot(scoutingEntries) {
  if (!scoutingEntries || scoutingEntries.length < LOW_IMPACT.MIN_MATCHES_TO_DETECT) {
    return { isLowImpact: false, penalty: 1.0, reason: null };
  }

  const count = scoutingEntries.length;

  // Calculate average points
  let totalPoints = 0;
  let matchesWithCycles = 0;
  let matchesWithEndgame = 0;

  for (const entry of scoutingEntries) {
    const autoPoints = calculateAutoPoints(entry);
    const teleopPoints = calculateTeleopPoints(entry);
    const endgamePoints = calculateEndgamePoints(entry);
    totalPoints += autoPoints + teleopPoints + endgamePoints;

    if ((entry.teleopCycleCount || 0) > 0) matchesWithCycles++;
    if (endgamePoints > 0) matchesWithEndgame++;
  }

  const avgPoints = totalPoints / count;
  const cycleRate = matchesWithCycles / count;
  const endgameRate = matchesWithEndgame / count;

  // Check all criteria for low-impact robot
  const hasLowPoints = avgPoints < LOW_IMPACT.MAX_AVG_POINTS;
  const hasLowCycles = cycleRate < LOW_IMPACT.MIN_CYCLE_RATE;
  const hasLowEndgame = endgameRate < LOW_IMPACT.MIN_ENDGAME_RATE;

  // All three criteria must be met to apply penalty
  if (hasLowPoints && hasLowCycles && hasLowEndgame) {
    return {
      isLowImpact: true,
      penalty: LOW_IMPACT.PENALTY_MULTIPLIER,
      reason: `Low avg points (${avgPoints.toFixed(1)}), low cycles (${(cycleRate * 100).toFixed(0)}%), low endgame (${(endgameRate * 100).toFixed(0)}%)`
    };
  }

  return { isLowImpact: false, penalty: 1.0, reason: null };
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
 * Applies reliability multipliers and low-impact robot detection
 * Supports cross-event scouting with decay when data is sparse
 *
 * @param {Array} scoutingEntries - Scouting entries for the team (current event)
 * @param {Object} statboticsData - Statbotics data for the team
 * @param {Object} crossEventData - Optional: { allEntries, currentEventKey } for cross-event support
 * @returns {Object} - { auto, teleop, endgame, total, weights, matchCount, reliability, lowImpact, crossEventUsed }
 */
export function calculateMCS(scoutingEntries, statboticsData, crossEventData = null) {
  const statboticsEPA = getStatboticsEPA(statboticsData);

  // Determine if we should use cross-event data
  let scoutingEPA, reliability, effectiveMatchCount, crossEventUsed = false;

  if (crossEventData && crossEventData.allEntries && crossEventData.currentEventKey) {
    // Organize scouting data by event
    const organized = organizeScoutingByEvent(crossEventData.allEntries, crossEventData.currentEventKey);

    // Calculate effective EPA using cross-event decay
    const effectiveEPA = calculateEffectiveScoutedEPA(organized.currentEvent, organized.previousEvents);
    scoutingEPA = {
      auto: effectiveEPA.auto,
      teleop: effectiveEPA.teleop,
      endgame: effectiveEPA.endgame,
      total: effectiveEPA.total,
      matchCount: organized.currentEvent.length  // Use current event count for weighting
    };
    effectiveMatchCount = effectiveEPA.effectiveMatchCount;
    crossEventUsed = effectiveEPA.crossEventUsed;

    // Calculate reliability with cross-event decay
    reliability = calculateCrossEventReliability(organized.currentEvent, organized.previousEvents);
  } else {
    // Standard calculation (current event only)
    scoutingEPA = calculateScoutingEPA(scoutingEntries);
    reliability = calculateReliabilityMetrics(scoutingEntries);
    effectiveMatchCount = scoutingEPA.matchCount;
  }

  const weights = getDataWeights(scoutingEPA.matchCount);

  // Detect low-impact robots (use current event entries if available, else fall back)
  const entriesForLowImpact = scoutingEntries && scoutingEntries.length > 0
    ? scoutingEntries
    : (crossEventData?.allEntries || []);
  const lowImpact = detectLowImpactRobot(entriesForLowImpact);

  // Base blended values
  let auto = (scoutingEPA.auto * weights.scouting) + (statboticsEPA.auto * weights.statbotics);
  let teleop = (scoutingEPA.teleop * weights.scouting) + (statboticsEPA.teleop * weights.statbotics);
  let endgame = (scoutingEPA.endgame * weights.scouting) + (statboticsEPA.endgame * weights.statbotics);

  // Apply auto reliability factor - consistent auto robots score higher
  // Need at least 3 matches (can be cross-event) for this to apply
  if (effectiveMatchCount >= 3) {
    const autoReliabilityFactor = 0.7 + (0.3 * reliability.autoSuccessRate);
    auto = auto * autoReliabilityFactor;
  }

  // Apply overall reliability multiplier (only for teams with scouting data)
  if (effectiveMatchCount >= 1) {
    auto = auto * reliability.reliabilityMultiplier;
    teleop = teleop * reliability.reliabilityMultiplier;
    endgame = endgame * reliability.reliabilityMultiplier;
  }

  // Apply low-impact robot penalty (small penalty, not zeroing out)
  if (lowImpact.isLowImpact) {
    auto = auto * lowImpact.penalty;
    teleop = teleop * lowImpact.penalty;
    endgame = endgame * lowImpact.penalty;
  }

  return {
    auto,
    teleop,
    endgame,
    total: auto + teleop + endgame,
    weights,
    matchCount: scoutingEPA.matchCount,
    effectiveMatchCount,
    scoutingEPA,
    statboticsEPA,
    reliability,
    lowImpact,
    crossEventUsed
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
 * Calculate normalized defense rating for a team
 * Distinguishes passive interference (1-2) from active disruption (3-5)
 * @param {Array} scoutingEntries - Scouting entries for a team
 * @returns {Object} - { avgRating, quality: 'passive'|'active', effectiveness }
 */
export function calculateDefenseQuality(scoutingEntries) {
  if (!scoutingEntries || scoutingEntries.length === 0) {
    return { avgRating: 0, quality: 'none', effectiveness: 0 };
  }

  // Only consider matches where robot played defense
  const defenseMatches = scoutingEntries.filter(e => e.robotRole === 'defense');
  if (defenseMatches.length === 0) {
    return { avgRating: 0, quality: 'none', effectiveness: 0 };
  }

  // Calculate average defense rating (normalize across matches)
  const totalRating = defenseMatches.reduce((sum, e) => sum + (e.defenseRating || 0), 0);
  const avgRating = totalRating / defenseMatches.length;

  // Classify defense quality
  let quality, effectiveness;
  if (avgRating >= DEFENSE_QUALITY.ACTIVE_THRESHOLD) {
    quality = 'active';
    effectiveness = DEFENSE_QUALITY.ACTIVE_EFFECTIVENESS;
  } else if (avgRating >= 1) {
    quality = 'passive';
    effectiveness = DEFENSE_QUALITY.PASSIVE_EFFECTIVENESS;
  } else {
    quality = 'none';
    effectiveness = 0;
  }

  return { avgRating, quality, effectiveness };
}

/**
 * Calculate defense impact on opponent teleop
 * Defense ONLY affects teleop - never auto or endgame
 * Stacks with diminishing returns, hard cap at exactly 12%
 * @param {number} defenseCount - Number of defensive robots
 * @param {Array} defenseQualities - Array of defense quality objects for each defender
 * @returns {number} - Reduction multiplier for opponent teleop (0.88-1.0)
 */
export function calculateDefenseReduction(defenseCount, defenseQualities = []) {
  if (defenseCount <= 0) return 1.0;

  // If we have quality data, use weighted effectiveness
  if (defenseQualities && defenseQualities.length > 0) {
    // Calculate total effective defense considering quality
    let totalEffectiveDefense = 0;
    for (const dq of defenseQualities) {
      totalEffectiveDefense += dq.effectiveness || DEFENSE_QUALITY.ACTIVE_EFFECTIVENESS;
    }

    // Apply diminishing returns: each additional defender is less effective
    // Base reduction per defender: ~4% (SYNERGY.DEFENSE_REDUCTION = 0.96)
    const effectiveDefenders = Math.min(totalEffectiveDefense, 3); // Cap at 3 effective defenders
    const reduction = Math.pow(SYNERGY.DEFENSE_REDUCTION, effectiveDefenders);

    // Hard cap at exactly 12% reduction (0.88 multiplier)
    return Math.max(reduction, SYNERGY.MAX_DEFENSE_REDUCTION);
  }

  // Fallback: simple count-based calculation with diminishing returns
  const reduction = Math.pow(SYNERGY.DEFENSE_REDUCTION, defenseCount);
  return Math.max(reduction, SYNERGY.MAX_DEFENSE_REDUCTION);
}

// =============================================================================
// ALLIANCE SCORE CALCULATION
// =============================================================================

/**
 * Calculate predicted alliance score with synergy modifiers
 * Defense ONLY affects teleop - never auto or endgame (per requirements)
 * Supports cross-event scouting with decay
 *
 * @param {Array} teamData - Array of { teamKey, scoutingEntries, statboticsData, allScoutingEntries?, currentEventKey? }
 * @param {number} opponentDefenseCount - Number of defensive robots on opponent
 * @param {Array} opponentDefenseQualities - Defense quality data for opponent's defensive robots
 * @returns {Object} - { score, auto, teleop, endgame, synergy, teamBreakdown, crossEventUsed }
 */
export function calculateAllianceScore(teamData, opponentDefenseCount = 0, opponentDefenseQualities = []) {
  if (!teamData || teamData.length === 0) {
    return { score: 0, auto: 0, teleop: 0, endgame: 0, synergy: 1.0, teamBreakdown: [], crossEventUsed: false };
  }

  const teamBreakdown = [];
  let totalAuto = 0, totalTeleop = 0, totalEndgame = 0;
  const roles = [];
  const allScoutingData = [];
  let anyCrossEventUsed = false;

  // Calculate MCS for each team
  for (const team of teamData) {
    // Build cross-event data if available
    const crossEventData = (team.allScoutingEntries && team.currentEventKey)
      ? { allEntries: team.allScoutingEntries, currentEventKey: team.currentEventKey }
      : null;

    const mcs = calculateMCS(team.scoutingEntries || [], team.statboticsData, crossEventData);

    // Determine role with cross-event awareness
    let role;
    if (crossEventData) {
      const organized = organizeScoutingByEvent(crossEventData.allEntries, crossEventData.currentEventKey);
      role = getCrossEventDominantRole(organized.currentEvent, organized.previousEvents);
    } else {
      role = getDominantRole(team.scoutingEntries);
    }

    teamBreakdown.push({
      teamKey: team.teamKey,
      mcs,
      role,
      reliability: mcs.reliability,
      lowImpact: mcs.lowImpact,
      crossEventUsed: mcs.crossEventUsed
    });

    if (mcs.crossEventUsed) {
      anyCrossEventUsed = true;
    }

    totalAuto += mcs.auto;
    totalTeleop += mcs.teleop;
    totalEndgame += mcs.endgame;

    if (role) {
      roles.push(role);
    }
    allScoutingData.push(team.scoutingEntries || []);
  }

  // Calculate synergy modifiers
  const offenseSynergy = calculateOffenseSynergy(roles);
  const autoSynergy = calculateAutoSynergy(allScoutingData);

  // Defense reduction with quality awareness - ONLY affects teleop
  const defenseReduction = calculateDefenseReduction(opponentDefenseCount, opponentDefenseQualities);

  // Apply synergy to teleop (offense synergy + defense reduction)
  // Defense NEVER affects auto or endgame
  const modifiedTeleop = totalTeleop * offenseSynergy * defenseReduction;

  // Apply auto synergy to auto (defense does NOT affect auto)
  const modifiedAuto = totalAuto * autoSynergy;

  // Endgame is NEVER affected by defense
  const modifiedEndgame = totalEndgame;

  // Combined synergy factor for display (excluding defense for transparency)
  const overallSynergy = offenseSynergy * autoSynergy;

  return {
    score: Math.round((modifiedAuto + modifiedTeleop + modifiedEndgame) * 10) / 10,
    auto: Math.round(modifiedAuto * 10) / 10,
    teleop: Math.round(modifiedTeleop * 10) / 10,
    endgame: Math.round(modifiedEndgame * 10) / 10,
    synergy: Math.round(overallSynergy * 100) / 100,
    teamBreakdown,
    crossEventUsed: anyCrossEventUsed,
    modifiers: {
      offenseSynergy,
      autoSynergy,
      defenseReduction,
      defenseAffects: 'teleop-only'  // Documentation for transparency
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
 * Updated to reflect cross-event usage:
 * - HIGH: ALL teams have 8+ current-event matches (all current-event scouting)
 * - MEDIUM: Mixed current + previous event OR average of 4+ matches per team
 * - LOW: Mostly previous event / Statbotics-dominant
 *
 * @param {Array} teamData - Array of { teamKey, scoutingEntries, crossEventUsed? }
 * @param {boolean} crossEventUsed - Whether cross-event data was used in prediction
 * @returns {Object} - { level, label, emoji, color, avgMatches, minMatches, crossEventUsed }
 */
export function getConfidenceLevel(teamData, crossEventUsed = false) {
  if (!teamData || teamData.length === 0) {
    return { ...CONFIDENCE.LOW, level: 'low', avgMatches: 0, minMatches: 0, crossEventUsed: false };
  }

  const matchCounts = teamData.map(t => (t.scoutingEntries || []).length);
  const avgMatches = matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length;
  const minMatches = Math.min(...matchCounts);

  // Check if any team used cross-event data (from team breakdown if available)
  const anyTeamUsedCrossEvent = crossEventUsed || teamData.some(t => t.crossEventUsed);

  // HIGH confidence: ALL teams must have 8+ current-event scouted matches
  // If cross-event data is used, it drops to MEDIUM at best
  if (minMatches >= CONFIDENCE.HIGH.minMatches && !anyTeamUsedCrossEvent) {
    return {
      ...CONFIDENCE.HIGH,
      level: 'high',
      avgMatches,
      minMatches,
      crossEventUsed: false,
      note: 'All current-event scouting'
    };
  }

  // MEDIUM confidence:
  // - Mixed current + previous event data
  // - OR average of 4+ matches per team (current event)
  // - OR cross-event used with reasonable current data
  if (avgMatches >= CONFIDENCE.MEDIUM.minMatches || anyTeamUsedCrossEvent) {
    return {
      ...CONFIDENCE.MEDIUM,
      level: 'medium',
      avgMatches,
      minMatches,
      crossEventUsed: anyTeamUsedCrossEvent,
      note: anyTeamUsedCrossEvent ? 'Includes previous event data' : 'Limited current-event data'
    };
  }

  // LOW confidence: Statbotics-dominant predictions
  return {
    ...CONFIDENCE.LOW,
    level: 'low',
    avgMatches,
    minMatches,
    crossEventUsed: anyTeamUsedCrossEvent,
    note: 'Mostly Statbotics / previous events'
  };
}

// =============================================================================
// FULL MATCH PREDICTION
// =============================================================================

/**
 * Generate a complete match prediction
 * Defense only affects teleop (never auto or endgame)
 * Supports cross-event scouting with decay
 *
 * @param {Object} redAlliance - { teams: [{ teamKey, scoutingEntries, statboticsData, allScoutingEntries?, currentEventKey? }] }
 * @param {Object} blueAlliance - { teams: [{ teamKey, scoutingEntries, statboticsData, allScoutingEntries?, currentEventKey? }] }
 * @returns {Object} - Complete prediction with scores, probabilities, confidence, crossEventInfo
 */
export function predictMatch(redAlliance, blueAlliance) {
  // Get role for a team - use cross-event if available
  const getTeamRole = (team) => {
    if (team.allScoutingEntries && team.currentEventKey) {
      const organized = organizeScoutingByEvent(team.allScoutingEntries, team.currentEventKey);
      return getCrossEventDominantRole(organized.currentEvent, organized.previousEvents);
    }
    return getDominantRole(team.scoutingEntries);
  };

  // Get defense quality for a team - use cross-event if available
  const getTeamDefenseQuality = (team) => {
    if (team.allScoutingEntries && team.currentEventKey) {
      const organized = organizeScoutingByEvent(team.allScoutingEntries, team.currentEventKey);
      return getCrossEventDefenseQuality(organized.currentEvent, organized.previousEvents);
    }
    return calculateDefenseQuality(team.scoutingEntries);
  };

  // Identify defensive robots and calculate their quality
  const redDefenders = (redAlliance.teams || []).filter(t =>
    getTeamRole(t) === 'defense'
  );
  const blueDefenders = (blueAlliance.teams || []).filter(t =>
    getTeamRole(t) === 'defense'
  );

  const redDefenseCount = redDefenders.length;
  const blueDefenseCount = blueDefenders.length;

  // Calculate defense quality for each defender
  const redDefenseQualities = redDefenders.map(t => getTeamDefenseQuality(t));
  const blueDefenseQualities = blueDefenders.map(t => getTeamDefenseQuality(t));

  // Calculate scores (opponent's defense affects your teleop ONLY)
  const redScore = calculateAllianceScore(redAlliance.teams || [], blueDefenseCount, blueDefenseQualities);
  const blueScore = calculateAllianceScore(blueAlliance.teams || [], redDefenseCount, redDefenseQualities);

  // Calculate win probabilities
  const redWinProb = calculateWinProbability(redScore.score, blueScore.score);
  const blueWinProb = 1 - redWinProb;

  // Determine if cross-event data was used
  const crossEventUsed = redScore.crossEventUsed || blueScore.crossEventUsed;

  // Get confidence levels (updated to reflect cross-event usage)
  const redConfidence = getConfidenceLevel(redAlliance.teams || [], redScore.crossEventUsed);
  const blueConfidence = getConfidenceLevel(blueAlliance.teams || [], blueScore.crossEventUsed);

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
      modifiers: redScore.modifiers,
      crossEventUsed: redScore.crossEventUsed
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
      modifiers: blueScore.modifiers,
      crossEventUsed: blueScore.crossEventUsed
    },
    confidence: {
      ...overallConfidence,
      level: overallConfidence === CONFIDENCE.HIGH ? 'high'
        : overallConfidence === CONFIDENCE.MEDIUM ? 'medium' : 'low',
      crossEventUsed
    },
    winner: redWinProb > 0.5 ? 'red' : 'blue',
    margin: Math.abs(redScore.score - blueScore.score),
    crossEventUsed,
    // Add defense info for transparency
    defenseInfo: {
      redDefenseCount,
      blueDefenseCount,
      redDefenseQualities,
      blueDefenseQualities
    }
  };
}
