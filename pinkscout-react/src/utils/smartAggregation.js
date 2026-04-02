/**
 * =============================================================================
 * SMARTAGGREGATION.JS - Intelligent Multi-Team Data Aggregation
 * =============================================================================
 *
 * PURPOSE:
 * When multiple teams scout the same robot at the same competition, this module
 * intelligently combines their data by:
 * 1. Prioritizing your own team's scouting data
 * 2. Detecting and removing outliers when 3+ teams scout the same match
 * 3. Averaging remaining data with appropriate weighting
 *
 * OUTLIER DETECTION:
 * Uses the IQR (Interquartile Range) method:
 * - Q1 = 25th percentile, Q3 = 75th percentile
 * - IQR = Q3 - Q1
 * - Outliers are values < Q1 - 1.5*IQR or > Q3 + 1.5*IQR
 *
 * =============================================================================
 */

import { calculateAutoPoints, calculateTeleopPoints } from './epaUtils';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SMART_AGG_CONFIG = {
  // Minimum entries needed to detect outliers (need 3+ for meaningful statistics)
  MIN_ENTRIES_FOR_OUTLIER_DETECTION: 3,

  // IQR multiplier for outlier detection (1.5 is standard)
  IQR_MULTIPLIER: 1.5,

  // Weight multiplier for your own team's data (2x = double weight)
  OWN_TEAM_WEIGHT: 2.0,

  // Minimum percentage difference to consider something an outlier
  // (prevents removing data that's only slightly different)
  MIN_OUTLIER_DIFFERENCE_PERCENT: 30
};

// =============================================================================
// OUTLIER DETECTION
// =============================================================================

/**
 * Calculate a total score for a scouting entry
 * Used for comparing entries and detecting outliers
 */
export function calculateEntryScore(entry) {
  const auto = calculateAutoPoints(entry);
  const teleop = calculateTeleopPoints(entry);
  const endgame = entry.endgamePoints || entry.climbPoints || 0;
  return auto + teleop + endgame;
}

/**
 * Detect outliers in an array of values using IQR method
 * @param {Array<number>} values - Array of numeric values
 * @returns {Object} - { outlierIndices: number[], q1, q3, iqr, lowerBound, upperBound }
 */
export function detectOutliersIQR(values) {
  if (values.length < SMART_AGG_CONFIG.MIN_ENTRIES_FOR_OUTLIER_DETECTION) {
    return { outlierIndices: [], q1: 0, q3: 0, iqr: 0, lowerBound: 0, upperBound: 0 };
  }

  // Sort values for percentile calculation
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  // Calculate Q1 (25th percentile) and Q3 (75th percentile)
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];

  // Calculate IQR and bounds
  const iqr = q3 - q1;
  const lowerBound = q1 - (SMART_AGG_CONFIG.IQR_MULTIPLIER * iqr);
  const upperBound = q3 + (SMART_AGG_CONFIG.IQR_MULTIPLIER * iqr);

  // Find outlier indices in original array
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const outlierIndices = [];

  values.forEach((value, index) => {
    if (value < lowerBound || value > upperBound) {
      // Also check if the difference is significant enough
      const percentDiff = mean > 0 ? Math.abs((value - mean) / mean) * 100 : 0;
      if (percentDiff >= SMART_AGG_CONFIG.MIN_OUTLIER_DIFFERENCE_PERCENT) {
        outlierIndices.push(index);
      }
    }
  });

  return { outlierIndices, q1, q3, iqr, lowerBound, upperBound, mean };
}

/**
 * Group scouting entries by match (team + match number + event)
 * @param {Array} entries - Array of scouting entries
 * @returns {Map} - Map of matchKey -> array of entries
 */
export function groupEntriesByMatch(entries) {
  const groups = new Map();

  for (const entry of entries) {
    // Create unique key for each team's match at an event
    const matchKey = `${entry.teamNumber}_${entry.matchNumber}_${entry.eventKey}`;

    if (!groups.has(matchKey)) {
      groups.set(matchKey, []);
    }
    groups.get(matchKey).push(entry);
  }

  return groups;
}

// =============================================================================
// SMART AGGREGATION - MAIN FUNCTION
// =============================================================================

/**
 * Apply smart aggregation to scouting entries
 *
 * Logic:
 * 1. Group entries by match (same robot, same match, same event)
 * 2. For each group with multiple entries:
 *    a. If 3+ entries and outlier detected → remove outlier
 *    b. Prioritize your own team's data (double weight)
 *    c. Create weighted average entry
 * 3. Return deduplicated entries ready for standard aggregation
 *
 * @param {Array} entries - Array of scouting entries
 * @param {string} ownTeamLeadUid - The team_lead_uid of the current user's team
 * @returns {Object} - { entries: Array, stats: { totalEntries, duplicatesFound, outliersRemoved } }
 */
export function applySmartAggregation(entries, ownTeamLeadUid) {
  if (!entries || entries.length === 0) {
    return { entries: [], stats: { totalEntries: 0, duplicatesFound: 0, outliersRemoved: 0 } };
  }

  const matchGroups = groupEntriesByMatch(entries);
  const processedEntries = [];
  let duplicatesFound = 0;
  let outliersRemoved = 0;

  for (const [matchKey, groupEntries] of matchGroups) {
    // Single entry - no aggregation needed
    if (groupEntries.length === 1) {
      processedEntries.push(groupEntries[0]);
      continue;
    }

    duplicatesFound += groupEntries.length - 1;

    // Check if we have our own team's data in this group
    const ownTeamEntries = groupEntries.filter(e => e.teamLeadUid === ownTeamLeadUid);
    const otherTeamEntries = groupEntries.filter(e => e.teamLeadUid !== ownTeamLeadUid);

    // If we have ONLY our own team's data, use the most recent one
    if (ownTeamEntries.length > 0 && otherTeamEntries.length === 0) {
      const mostRecent = ownTeamEntries.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.created_at || 0);
        const timeB = new Date(b.createdAt || b.created_at || 0);
        return timeB - timeA;
      })[0];
      processedEntries.push(mostRecent);
      continue;
    }

    // Calculate scores for outlier detection
    const scores = groupEntries.map(calculateEntryScore);

    // Detect outliers (only if 3+ entries)
    let filteredEntries = [...groupEntries];
    if (groupEntries.length >= SMART_AGG_CONFIG.MIN_ENTRIES_FOR_OUTLIER_DETECTION) {
      const { outlierIndices } = detectOutliersIQR(scores);

      if (outlierIndices.length > 0) {
        // Remove outliers, but NEVER remove your own team's data
        filteredEntries = groupEntries.filter((entry, index) => {
          const isOutlier = outlierIndices.includes(index);
          const isOwnTeam = entry.teamLeadUid === ownTeamLeadUid;

          if (isOutlier && !isOwnTeam) {
            outliersRemoved++;
            if (import.meta.env.DEV) {
              console.log(`🔍 Outlier removed for ${matchKey}: score=${scores[index].toFixed(1)}`);
            }
            return false;
          }
          return true;
        });
      }
    }

    // Create weighted average entry
    const aggregatedEntry = createWeightedAverageEntry(filteredEntries, ownTeamLeadUid);
    processedEntries.push(aggregatedEntry);
  }

  if (import.meta.env.DEV && (duplicatesFound > 0 || outliersRemoved > 0)) {
    console.log(`📊 Smart Aggregation: ${entries.length} entries → ${processedEntries.length} (${duplicatesFound} duplicates, ${outliersRemoved} outliers removed)`);
  }

  return {
    entries: processedEntries,
    stats: {
      totalEntries: entries.length,
      duplicatesFound,
      outliersRemoved
    }
  };
}


// =============================================================================
// WEIGHTED AVERAGE ENTRY CREATION
// =============================================================================

/**
 * Create a weighted average entry from multiple scouting entries
 * Your own team's data gets double weight
 *
 * @param {Array} entries - Array of scouting entries for the same match
 * @param {string} ownTeamLeadUid - The team_lead_uid of the current user's team
 * @returns {Object} - Single aggregated entry
 */
function createWeightedAverageEntry(entries, ownTeamLeadUid) {
  if (entries.length === 1) return entries[0];

  // Calculate weights for each entry
  const weights = entries.map(e =>
    e.teamLeadUid === ownTeamLeadUid ? SMART_AGG_CONFIG.OWN_TEAM_WEIGHT : 1.0
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Numeric fields to average
  const numericFields = [
    'autoFuelScored', 'autoShotsAttempted', 'autoCyclesCompleted',
    'teleopFuelActive', 'teleopFuelInactive', 'teleopCycleCount', 'teleopBallsCycled',
    'endgameFuelScored', 'defenseRating',
    // 2024 game fields
    'autoSpeaker', 'autoAmp', 'teleopSpeaker', 'teleopAmp', 'amplifiedScored',
    'endgamePoints', 'climbPoints'
  ];

  // Boolean/category fields - use most common value (or own team's value if present)
  const booleanFields = ['autoMobility', 'startingPosition', 'hubControlFirst'];
  const categoryFields = ['autoTowerClimb', 'endgameTowerLevel', 'climbType'];

  // Start with the first entry as a base (copy all fields)
  const base = { ...entries[0] };

  // Average numeric fields with weights
  for (const field of numericFields) {
    let weightedSum = 0;
    let hasField = false;

    entries.forEach((entry, i) => {
      if (entry[field] !== undefined && entry[field] !== null) {
        weightedSum += (entry[field] || 0) * weights[i];
        hasField = true;
      }
    });

    if (hasField) {
      base[field] = Math.round((weightedSum / totalWeight) * 10) / 10;
    }
  }

  // For boolean fields, use own team's value if available, else majority vote
  for (const field of booleanFields) {
    const ownEntry = entries.find(e => e.teamLeadUid === ownTeamLeadUid);
    if (ownEntry && ownEntry[field] !== undefined) {
      base[field] = ownEntry[field];
    } else {
      // Majority vote
      const trueCount = entries.filter(e => e[field]).length;
      base[field] = trueCount > entries.length / 2;
    }
  }

  // For category fields, use own team's value if available, else most common
  for (const field of categoryFields) {
    const ownEntry = entries.find(e => e.teamLeadUid === ownTeamLeadUid);
    if (ownEntry && ownEntry[field]) {
      base[field] = ownEntry[field];
    } else {
      // Find most common value
      const counts = {};
      entries.forEach(e => {
        if (e[field]) {
          counts[e[field]] = (counts[e[field]] || 0) + 1;
        }
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        base[field] = sorted[0][0];
      }
    }
  }

  // Mark as aggregated for transparency
  base._aggregated = true;
  base._sourceCount = entries.length;
  base._ownTeamIncluded = entries.some(e => e.teamLeadUid === ownTeamLeadUid);

  return base;
}

// Export configuration for reference
export { SMART_AGG_CONFIG };

