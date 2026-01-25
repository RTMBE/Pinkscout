/**
 * =============================================================================
 * EPACALCULATIONSERVICE.JS - EPA Import & Adjustment Calculations
 * =============================================================================
 *
 * PURPOSE:
 * Integrates Statbotics EPA with internal scouting data to produce adjusted EPA
 * values that reflect local observations while preserving raw data integrity.
 *
 * DATA FLOW:
 * 1. Import baseline EPA from Statbotics → store in epa_baseline table
 * 2. Collect scouting data → stored in scouting table
 * 3. Calculate adjustment factor from scouting metrics
 * 4. Generate adjustedEPA = baseline + (scoutingAdjustment * weight)
 *
 * WEIGHTING LOGIC:
 * - Fewer matches → lower scouting influence (0.1 - 0.3)
 * - More matches → higher scouting influence (0.3 - 0.5)
 * - Maximum adjustment clamped to ±15% of baseline EPA
 *
 * SUPABASE TABLES:
 * - epa_baseline - Read-only Statbotics data
 * - adjusted_epa - Calculated adjusted values
 *
 * =============================================================================
 */

import { supabase } from './supabase';
import { getTeamYearStats, getTeamEventStats } from './statboticsAPI';

// Collection names
const EPA_BASELINE_COLLECTION = 'epaBaseline';
const ADJUSTED_EPA_COLLECTION = 'adjustedEPA';

// =============================================================================
// WEIGHTING CONFIGURATION
// =============================================================================

const EPA_CONFIG = {
  // Minimum matches before scouting data influences EPA
  MIN_MATCHES_FOR_ADJUSTMENT: 1,

  // Base weight for scouting influence (increases with match count)
  BASE_SCOUTING_WEIGHT: 0.1,

  // Maximum scouting weight (after many matches) - can reach 1.0 for full scouting dominance
  MAX_SCOUTING_WEIGHT: 1.0,

  // Matches needed to reach max weight
  MATCHES_FOR_MAX_WEIGHT: 12,

  // Matches for full scouting dominance (100% scouting, 0% Statbotics)
  MATCHES_FOR_FULL_DOMINANCE: 16,

  // Minimum baseline EPA to prevent division issues
  MIN_BASELINE_EPA: 1.0,

  // Cache expiry in milliseconds (1 hour)
  CACHE_EXPIRY_MS: 60 * 60 * 1000,

  // Reliability thresholds
  RELIABILITY: {
    HIGH_THRESHOLD: 0.75,      // 75%+ success rate = high reliability
    MEDIUM_THRESHOLD: 0.50,   // 50%+ success rate = medium reliability
    HIGH_BONUS: 1.05,          // 5% bonus for high reliability
    LOW_PENALTY: 0.92          // 8% penalty for low reliability
  }
};

// =============================================================================
// IMPORT EPA BASELINE FROM STATBOTICS
// =============================================================================

/**
 * Import and cache EPA baseline data from Statbotics for a team/year
 * Data is stored read-only in Supabase for reference
 *
 * @param {number} teamNumber - FRC team number
 * @param {number} year - Competition year
 * @param {boolean} forceRefresh - Force refresh from API even if cached
 * @returns {Object|null} - EPA baseline data or null if unavailable
 */
export async function importEPABaseline(teamNumber, year, forceRefresh = false) {
  try {
    const docId = `${teamNumber}_${year}`;

    // Check cache first
    if (!forceRefresh) {
      const { data: cached, error } = await supabase
        .from(EPA_BASELINE_COLLECTION)
        .select('*')
        .eq('id', docId)
        .single();

      if (!error && cached) {
        // Check if cache is still valid
        const cacheAge = Date.now() - new Date(cached.imported_at).getTime();
        if (cacheAge < EPA_CONFIG.CACHE_EXPIRY_MS) {
          return convertToCamelCase(cached);
        }
      }
    }

    // Fetch from Statbotics
    const statboticsData = await getTeamYearStats(teamNumber, year);

    if (!statboticsData) {
      if (import.meta.env.DEV) {
        console.log(`No Statbotics data for team ${teamNumber} in ${year}`);
      }
      return null;
    }

    // Extract and structure EPA data
    const epaBaseline = {
      id: docId,
      team_number: parseInt(teamNumber),
      year: parseInt(year),
      // Core EPA values
      epa_total: statboticsData.epa?.total_points?.mean || 0,
      epa_auto: statboticsData.epa?.breakdown?.auto_points || 0,
      epa_teleop: statboticsData.epa?.breakdown?.teleop_points || 0,
      epa_endgame: statboticsData.epa?.breakdown?.endgame_points || 0,
      epa_unitless: statboticsData.epa?.unitless || 0,
      // Record data
      wins: statboticsData.record?.wins || 0,
      losses: statboticsData.record?.losses || 0,
      // Metadata
      source: 'statbotics',
      raw_data: statboticsData // Preserve full raw data
    };

    // Store in Supabase (upsert to handle updates)
    const { error: upsertError } = await supabase
      .from(EPA_BASELINE_COLLECTION)
      .upsert(epaBaseline, { onConflict: 'id' });

    if (upsertError) {
      console.error('Error storing EPA baseline:', upsertError);
    }

    if (import.meta.env.DEV) {
      console.log(`✅ EPA baseline imported for team ${teamNumber} (${year})`);
    }

    return convertToCamelCase(epaBaseline);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error importing EPA baseline:', error);
    }
    return null;
  }
}

/**
 * Convert snake_case object keys to camelCase for frontend
 */
function convertToCamelCase(obj) {
  if (!obj) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

/**
 * Import EPA for a specific team at an event
 *
 * @param {number} teamNumber - FRC team number
 * @param {string} eventKey - Event key (e.g., "2026casj")
 * @returns {Object|null} - Event-specific EPA data or null
 */
export async function importEventEPA(teamNumber, eventKey) {
  try {
    const statboticsData = await getTeamEventStats(teamNumber, eventKey);
    if (!statboticsData) return null;

    return {
      teamNumber: parseInt(teamNumber),
      eventKey,
      epaTotal: statboticsData.epa?.total_points?.mean || 0,
      epaAuto: statboticsData.epa?.breakdown?.auto_points || 0,
      epaTeleop: statboticsData.epa?.breakdown?.teleop_points || 0,
      epaEndgame: statboticsData.epa?.breakdown?.endgame_points || 0,
      rank: statboticsData.rank || null,
      source: 'statbotics'
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error importing event EPA:', error);
    }
    return null;
  }
}

// =============================================================================
// SCOUTING DATA ANALYSIS
// =============================================================================

/**
 * Analyze scouting entries to calculate performance metrics
 * These metrics are used to adjust EPA based on local observations
 *
 * @param {Array} scoutingEntries - Array of scouting data entries
 * @returns {Object} - Aggregated performance metrics
 */
function analyzeScoutingData(scoutingEntries) {
  if (!scoutingEntries || scoutingEntries.length === 0) {
    return null;
  }

  const matchCount = scoutingEntries.length;

  // Calculate averages for scoring metrics
  const totals = scoutingEntries.reduce((acc, entry) => {
    return {
      autoFuel: acc.autoFuel + (entry.autoFuelScored || 0),
      teleopFuel: acc.teleopFuel + (entry.teleopFuelActive || 0),
      cycleCount: acc.cycleCount + (entry.teleopCycleCount || 0),
      defenseRating: acc.defenseRating + (entry.defenseRating || 0),

      // Tower climb points
      autoClimbPoints: acc.autoClimbPoints + getClimbPoints(entry.autoTowerClimb),
      endgameClimbPoints: acc.endgameClimbPoints + getClimbPoints(entry.endgameTowerLevel),

      // Efficiency tracking
      inactiveFuel: acc.inactiveFuel + (entry.teleopFuelInactive || 0),
      hubControlWins: acc.hubControlWins + (entry.hubControlFirst ? 1 : 0)
    };
  }, {
    autoFuel: 0, teleopFuel: 0, cycleCount: 0, defenseRating: 0,
    autoClimbPoints: 0, endgameClimbPoints: 0, inactiveFuel: 0, hubControlWins: 0
  });

  // Calculate per-match averages
  return {
    matchCount,
    avgAutoFuel: totals.autoFuel / matchCount,
    avgTeleopFuel: totals.teleopFuel / matchCount,
    avgCycles: totals.cycleCount / matchCount,
    avgDefense: totals.defenseRating / matchCount,
    avgAutoClimb: totals.autoClimbPoints / matchCount,
    avgEndgameClimb: totals.endgameClimbPoints / matchCount,

    // Efficiency metrics
    fuelEfficiency: totals.teleopFuel / Math.max(1, totals.teleopFuel + totals.inactiveFuel),
    hubControlRate: totals.hubControlWins / matchCount,

    // Consistency (lower std dev = more consistent)
    consistency: calculateConsistency(scoutingEntries)
  };
}

/**
 * Get points for a tower climb level
 */
function getClimbPoints(climbLevel) {
  switch (climbLevel) {
    case 'level1': return 15;
    case 'level2': return 0; // RP only
    case 'level3': return 30;
    default: return 0;
  }
}

/**
 * Calculate consistency score (0-1, higher = more consistent)
 */
function calculateConsistency(entries) {
  if (entries.length < 2) return 1;

  // Calculate total points per match
  const pointsPerMatch = entries.map(e => {
    return (e.autoFuelScored || 0) +
           (e.teleopFuelActive || 0) +
           getClimbPoints(e.autoTowerClimb) +
           getClimbPoints(e.endgameTowerLevel);
  });

  const mean = pointsPerMatch.reduce((a, b) => a + b, 0) / pointsPerMatch.length;
  const variance = pointsPerMatch.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / pointsPerMatch.length;
  const stdDev = Math.sqrt(variance);

  // Normalize: lower std dev relative to mean = higher consistency
  // Clamp between 0 and 1
  const cv = mean > 0 ? stdDev / mean : 1; // Coefficient of variation
  return Math.max(0, Math.min(1, 1 - cv));
}

// =============================================================================
// EPA ADJUSTMENT CALCULATION
// =============================================================================

/**
 * Calculate weight for scouting data based on match count
 * More matches = higher confidence = higher weight
 * With sufficient matches (16+), scouting data fully dominates (100% weight)
 *
 * @param {number} matchCount - Number of scouting entries
 * @returns {number} - Weight between 0 and 1.0 (full dominance at 16+ matches)
 */
function calculateScoutingWeight(matchCount) {
  if (matchCount < EPA_CONFIG.MIN_MATCHES_FOR_ADJUSTMENT) {
    return 0; // Not enough data
  }

  const {
    BASE_SCOUTING_WEIGHT,
    MAX_SCOUTING_WEIGHT,
    MATCHES_FOR_MAX_WEIGHT,
    MATCHES_FOR_FULL_DOMINANCE
  } = EPA_CONFIG;

  // Two-phase weight progression:
  // Phase 1: 1-12 matches → 0.1 to 1.0 weight (linear interpolation)
  // Phase 2: 16+ matches → full 1.0 weight (scouting fully dominates)

  if (matchCount >= MATCHES_FOR_FULL_DOMINANCE) {
    return 1.0; // Full scouting dominance - Statbotics has no influence
  }

  // Linear interpolation from base to max weight
  const progress = Math.min(1, matchCount / MATCHES_FOR_MAX_WEIGHT);
  return BASE_SCOUTING_WEIGHT + (MAX_SCOUTING_WEIGHT - BASE_SCOUTING_WEIGHT) * progress;
}

/**
 * Calculate EPA adjustment from scouting metrics
 * With sufficient scouting data (16+ matches), scouting fully overrides Statbotics
 * No hard cap on adjustments - weight determines blend
 *
 * @param {Object} scoutingMetrics - Analyzed scouting data
 * @param {Object} baseline - Baseline EPA data
 * @returns {Object} - Adjustment values for each EPA component
 */
function calculateEPAAdjustment(scoutingMetrics, baseline) {
  if (!scoutingMetrics || !baseline) {
    return { total: 0, auto: 0, teleop: 0, endgame: 0 };
  }

  const weight = calculateScoutingWeight(scoutingMetrics.matchCount);
  if (weight === 0) {
    return { total: 0, auto: 0, teleop: 0, endgame: 0 };
  }

  // Calculate expected points from scouting data
  const scoutedAutoPoints = scoutingMetrics.avgAutoFuel + scoutingMetrics.avgAutoClimb;
  const scoutedTeleopPoints = scoutingMetrics.avgTeleopFuel + (scoutingMetrics.avgCycles * 2);
  const scoutedEndgamePoints = scoutingMetrics.avgEndgameClimb;
  const scoutedTotal = scoutedAutoPoints + scoutedTeleopPoints + scoutedEndgamePoints;

  // Calculate raw deltas (difference from baseline)
  const rawAutoAdjust = scoutedAutoPoints - (baseline.epaAuto || 0);
  const rawTeleopAdjust = scoutedTeleopPoints - (baseline.epaTeleop || 0);
  const rawEndgameAdjust = scoutedEndgamePoints - (baseline.epaEndgame || 0);
  const rawTotalAdjust = scoutedTotal - (baseline.epaTotal || 0);

  // Apply weight and consistency bonus
  // Consistency multiplier: low consistency (0) = 0.8x, high consistency (1) = 1.2x
  const consistencyMultiplier = 0.8 + (0.4 * scoutingMetrics.consistency);

  // Calculate weighted adjustments - NO CLAMPING
  // With 16+ matches (weight = 1.0), scouting data fully determines EPA
  // The adjustment is now purely weight-based, allowing scouting to override Statbotics
  const weightedTotal = rawTotalAdjust * weight * consistencyMultiplier;
  const weightedAuto = rawAutoAdjust * weight * consistencyMultiplier;
  const weightedTeleop = rawTeleopAdjust * weight * consistencyMultiplier;
  const weightedEndgame = rawEndgameAdjust * weight * consistencyMultiplier;

  // Return unclamped adjustments - scouting data can now fully override Statbotics
  return {
    total: weightedTotal,
    auto: weightedAuto,
    teleop: weightedTeleop,
    endgame: weightedEndgame,
    weight,
    matchCount: scoutingMetrics.matchCount,
    consistency: scoutingMetrics.consistency,
    // Store scouted values for transparency
    scoutedPoints: {
      auto: scoutedAutoPoints,
      teleop: scoutedTeleopPoints,
      endgame: scoutedEndgamePoints,
      total: scoutedTotal
    }
  };
}

/**
 * Clamp a value between min and max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// =============================================================================
// ADJUSTED EPA CALCULATION & STORAGE
// =============================================================================

/**
 * Calculate adjusted EPA for a team at an event
 * Combines Statbotics baseline with scouting-based adjustments
 *
 * @param {number} teamNumber - FRC team number
 * @param {string} eventKey - Event key (e.g., "2026casj")
 * @param {Array} scoutingEntries - Scouting data for this team at this event
 * @returns {Object} - Complete adjusted EPA data
 */
export async function calculateAdjustedEPA(teamNumber, eventKey, scoutingEntries) {
  try {
    const year = parseInt(eventKey.substring(0, 4));

    // Get baseline EPA (try event-specific first, then yearly)
    let baseline = await importEventEPA(teamNumber, eventKey);
    if (!baseline) {
      baseline = await importEPABaseline(teamNumber, year);
    }

    // If no baseline available, create minimal baseline from scouting data only
    if (!baseline) {
      baseline = {
        teamNumber: parseInt(teamNumber),
        year,
        epaTotal: 0,
        epaAuto: 0,
        epaTeleop: 0,
        epaEndgame: 0,
        source: 'none'
      };
    }

    // Analyze scouting data
    const scoutingMetrics = analyzeScoutingData(scoutingEntries);

    // Calculate adjustment
    const adjustment = calculateEPAAdjustment(scoutingMetrics, baseline);

    // Build adjusted EPA document
    const docId = `${teamNumber}_${eventKey}`;
    const adjustedEPADoc = {
      id: docId,
      team_number: parseInt(teamNumber),
      event_key: eventKey,
      year,

      // Raw baseline values (preserved, never modified)
      baseline_epa: {
        total: baseline.epaTotal || 0,
        auto: baseline.epaAuto || 0,
        teleop: baseline.epaTeleop || 0,
        endgame: baseline.epaEndgame || 0,
        source: baseline.source || 'statbotics'
      },

      // Adjustment values (for transparency)
      adjustment: {
        total: adjustment.total,
        auto: adjustment.auto,
        teleop: adjustment.teleop,
        endgame: adjustment.endgame,
        weight: adjustment.weight,
        matchCount: adjustment.matchCount || 0,
        consistency: adjustment.consistency || 1
      },

      // Final adjusted values (baseline + adjustment)
      adjusted_epa: {
        total: (baseline.epaTotal || 0) + adjustment.total,
        auto: (baseline.epaAuto || 0) + adjustment.auto,
        teleop: (baseline.epaTeleop || 0) + adjustment.teleop,
        endgame: (baseline.epaEndgame || 0) + adjustment.endgame
      },

      // Scouting metrics summary
      scouting_metrics: scoutingMetrics ? {
        matchCount: scoutingMetrics.matchCount,
        avgAutoFuel: scoutingMetrics.avgAutoFuel,
        avgTeleopFuel: scoutingMetrics.avgTeleopFuel,
        avgCycles: scoutingMetrics.avgCycles,
        avgDefense: scoutingMetrics.avgDefense,
        fuelEfficiency: scoutingMetrics.fuelEfficiency,
        consistency: scoutingMetrics.consistency
      } : null,

      // Metadata
      scouting_entries_count: scoutingEntries?.length || 0
    };

    // Store in Supabase (upsert to handle updates)
    const { error: upsertError } = await supabase
      .from(ADJUSTED_EPA_COLLECTION)
      .upsert(adjustedEPADoc, { onConflict: 'id' });

    if (upsertError) {
      console.error('Error storing adjusted EPA:', upsertError);
    }

    if (import.meta.env.DEV) {
      console.log(`✅ Adjusted EPA calculated for team ${teamNumber} at ${eventKey}`);
    }

    // Return camelCase version for frontend
    return {
      teamNumber: parseInt(teamNumber),
      eventKey,
      year,
      baselineEPA: adjustedEPADoc.baseline_epa,
      adjustment: adjustedEPADoc.adjustment,
      adjustedEPA: adjustedEPADoc.adjusted_epa,
      scoutingMetrics: adjustedEPADoc.scouting_metrics,
      scoutingEntriesCount: adjustedEPADoc.scouting_entries_count
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error calculating adjusted EPA:', error);
    }
    throw new Error('Failed to calculate adjusted EPA');
  }
}

/**
 * Get stored adjusted EPA for a team at an event
 *
 * @param {number} teamNumber - FRC team number
 * @param {string} eventKey - Event key
 * @returns {Object|null} - Stored adjusted EPA or null
 */
export async function getAdjustedEPA(teamNumber, eventKey) {
  try {
    const docId = `${teamNumber}_${eventKey}`;
    const { data, error } = await supabase
      .from(ADJUSTED_EPA_COLLECTION)
      .select('*')
      .eq('id', docId)
      .single();

    if (error || !data) return null;

    // Return camelCase version for frontend
    return {
      teamNumber: data.team_number,
      eventKey: data.event_key,
      year: data.year,
      baselineEPA: data.baseline_epa,
      adjustment: data.adjustment,
      adjustedEPA: data.adjusted_epa,
      scoutingMetrics: data.scouting_metrics,
      scoutingEntriesCount: data.scouting_entries_count
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching adjusted EPA:', error);
    }
    return null;
  }
}

/**
 * Get adjusted EPA for all teams at an event
 *
 * @param {string} eventKey - Event key
 * @returns {Array} - Array of adjusted EPA documents
 */
export async function getEventAdjustedEPAs(eventKey) {
  try {
    const { data, error } = await supabase
      .from(ADJUSTED_EPA_COLLECTION)
      .select('*')
      .eq('event_key', eventKey);

    if (error) throw error;

    // Convert to camelCase for frontend
    return (data || []).map(entry => ({
      id: entry.id,
      teamNumber: entry.team_number,
      eventKey: entry.event_key,
      year: entry.year,
      baselineEPA: entry.baseline_epa,
      adjustment: entry.adjustment,
      adjustedEPA: entry.adjusted_epa,
      scoutingMetrics: entry.scouting_metrics,
      scoutingEntriesCount: entry.scouting_entries_count
    }));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching event adjusted EPAs:', error);
    }
    return [];
  }
}

/**
 * Get EPA baseline data for a team/year
 *
 * @param {number} teamNumber - FRC team number
 * @param {number} year - Competition year
 * @returns {Object|null} - Baseline EPA data or null
 */
export async function getEPABaseline(teamNumber, year) {
  try {
    const docId = `${teamNumber}_${year}`;
    const { data, error } = await supabase
      .from(EPA_BASELINE_COLLECTION)
      .select('*')
      .eq('id', docId)
      .single();

    if (error || !data) return null;

    return convertToCamelCase(data);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching EPA baseline:', error);
    }
    return null;
  }
}

// Export configuration for reference
export { EPA_CONFIG };
