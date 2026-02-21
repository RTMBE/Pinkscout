/**
 * =============================================================================
 * SCOUTINGSERVICE.JS - Supabase Scouting Data CRUD Operations
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * Handles all scouting data operations with Supabase:
 * - Create new scouting entries
 * - Read entries (all, by team, by event)
 * - Update entries
 * - Delete entries
 *
 * SECURITY:
 * - Input validation before writing to Supabase
 * - Sanitization of text fields to prevent injection
 * - Type checking for numeric fields
 *
 * SUPABASE TABLE: scouting
 * Schema:
 *   - team_number: number
 *   - match_number: number
 *   - event_key: string
 *   - scouter_name: string
 *   - scouter_uid: string (for ownership)
 *   - alliance_color: "red" | "blue"
 *   - (2026 REBUILT game fields)
 *   - created_at: timestamp
 *
 * =============================================================================
 */

import { supabase } from './supabase';
import { ROLES, isMasterAdmin } from './roleService';
import { isOnline, addToOfflineQueue } from './offlineSyncService';

// Collection reference
const SCOUTING_COLLECTION = 'scouting';

// EPA recalculation is triggered asynchronously after scouting data changes
// Import is done dynamically to avoid circular dependencies
let epaCalculationService = null;
async function getEPAService() {
  if (!epaCalculationService) {
    epaCalculationService = await import('./epaCalculationService');
  }
  return epaCalculationService;
}

// =============================================================================
// INPUT VALIDATION & SANITIZATION
// =============================================================================

/**
 * Sanitize a string to prevent XSS and injection attacks
 * @param {string} str - The string to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} - Sanitized string
 */
function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  // Trim whitespace and limit length
  return str.trim().slice(0, maxLength);
}

/**
 * Validate and sanitize scouting data before saving
 * @param {Object} data - Raw scouting data
 * @returns {Object} - Validated and sanitized data
 * @throws {Error} - If validation fails
 */
async function validateScoutingData(data) {
  const errors = [];

  // Required fields validation
  if (!data.teamNumber || typeof data.teamNumber !== 'number' || data.teamNumber <= 0 || data.teamNumber > 99999) {
    errors.push('Team number must be a positive integer between 1 and 99999');
  }

  if (typeof data.matchNumber !== 'number' || data.matchNumber < 0) {
    errors.push('Match number must be a non-negative integer');
  }

  if (!data.eventKey || typeof data.eventKey !== 'string' || data.eventKey.length === 0) {
    errors.push('Event key is required');
  }

  if (!data.scouterUid || typeof data.scouterUid !== 'string') {
    errors.push('Scouter UID is required');
  }

  // scoutingId is required for team isolation (legacy)
  // OR teamLeadUid for new team-based isolation
  if (!data.scoutingId && !data.teamLeadUid) {
    errors.push('Either Scouting ID or Team Lead UID is required');
  }

  // Verify user profile exists (required for foreign key constraint)
  if (data.scouterUid) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.scouterUid)
      .single();

    if (profileError || !profile) {
      errors.push('User profile not found. Please refresh the page or re-login.');
    }
  }

  // Verify team lead profile exists (required for foreign key constraint)
  if (data.teamLeadUid) {
    const { data: teamLeadProfile, error: teamLeadError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.teamLeadUid)
      .single();

    if (teamLeadError || !teamLeadProfile) {
      errors.push('Team Lead profile not found. Please contact your team lead or re-link your account.');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  // Sanitize string fields
  const sanitized = {
    ...data,
    eventKey: sanitizeString(data.eventKey, 50),
    scouterName: sanitizeString(data.scouterName || '', 100),
    notes: sanitizeString(data.notes || '', 1000),
    allianceColor: ['red', 'blue'].includes(data.allianceColor) ? data.allianceColor : 'red',
    robotRole: ['shooter', 'cycler', 'defense'].includes(data.robotRole) ? data.robotRole : null,
    // startingPosition must be valid or null (empty string would fail DB CHECK constraint)
    startingPosition: ['left', 'center', 'right'].includes(data.startingPosition) ? data.startingPosition : null,
    // Tower climb fields - sanitize to valid values or 'none'
    autoTowerClimb: ['none', 'level1'].includes(data.autoTowerClimb) ? data.autoTowerClimb : 'none',
    endgameTowerLevel: ['none', 'level1', 'level2', 'level3'].includes(data.endgameTowerLevel) ? data.endgameTowerLevel : 'none'
  };

  // Normalize scoutingId if present (legacy support)
  if (data.scoutingId) {
    sanitized.scoutingId = sanitizeString(data.scoutingId, 50).toLowerCase();
  }

  // Include teamLeadUid if present (new team system)
  if (data.teamLeadUid) {
    sanitized.teamLeadUid = sanitizeString(data.teamLeadUid, 50);
  }

  // Ensure numeric fields are integers and within reasonable bounds
  const numericFields = [
    'teamNumber', 'matchNumber',
    'autoFuelScored', 'autoCyclesCompleted',
    'teleopFuelActive', 'teleopFuelInactive', 'teleopBallsCycled',
    'endgameFuelScored', 'defenseRating'
  ];

  for (const field of numericFields) {
    if (field in sanitized) {
      const value = parseInt(sanitized[field], 10);
      sanitized[field] = isNaN(value) ? 0 : Math.max(0, Math.min(value, 9999));
    }
  }

  return sanitized;
}

// =============================================================================
// CREATE - Save new scouting entry
// =============================================================================

/**
 * Save a new scouting entry to Supabase
 * Validates and sanitizes data before saving.
 *
 * @param {Object} scoutingData - The scouting data to save
 * @returns {string} - The ID of the saved entry
 * @throws {Error} - If validation fails or save fails
 */
export async function saveScoutingData(scoutingData) {
  try {
    // Check if offline - queue for later sync
    if (!isOnline()) {
      const queued = addToOfflineQueue('scouting', scoutingData);
      if (queued) {
        return 'offline-queued';
      } else {
        throw new Error('Failed to save offline. Please try again.');
      }
    }

    // Validate and sanitize input data (async - checks profile existence)
    const validatedData = await validateScoutingData(scoutingData);

    // Convert camelCase to snake_case for Supabase
    const snakeCaseData = convertToSnakeCase(validatedData);

    const { data, error } = await supabase
      .from(SCOUTING_COLLECTION)
      .insert(snakeCaseData)
      .select('id')
      .single();

    if (error) {
      // Provide more specific error messages for common issues
      if (error.code === '23503') {
        // Foreign key violation
        throw new Error('Validation failed: User profile not found. Please refresh the page or re-login.');
      }
      if (error.code === '42501') {
        // RLS policy violation
        throw new Error('Permission denied. Please ensure you are logged in.');
      }
      throw error;
    }

    // Only log in development mode
    if (import.meta.env.DEV) {
      console.log('✅ Scouting data saved with ID:', data.id);
    }

    // Trigger EPA recalculation asynchronously (don't block the save)
    // This runs in the background and doesn't affect the save operation
    triggerEPARecalculation(validatedData.teamNumber, validatedData.eventKey);

    return data.id;
  } catch (error) {
    // Log error in development, but don't expose details in production
    if (import.meta.env.DEV) {
      console.error('❌ Error saving scouting data:', error);
    }

    // Throw a user-friendly error message
    if (error.message?.startsWith('Validation failed')) {
      throw error; // Keep validation errors as-is
    }
    if (error.message?.startsWith('Permission denied')) {
      throw error; // Keep permission errors as-is
    }
    throw new Error('Failed to save scouting data. Please try again.');
  }
}

/**
 * Convert camelCase object keys to snake_case for Supabase
 */
function convertToSnakeCase(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = value;
  }
  return result;
}

/**
 * Convert snake_case object keys to camelCase for frontend
 */
function convertToCamelCase(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

/**
 * Trigger EPA recalculation for a team at an event
 * Runs asynchronously in the background - errors don't affect scouting save
 *
 * @param {number} teamNumber - Team number
 * @param {string} eventKey - Event key
 */
async function triggerEPARecalculation(teamNumber, eventKey) {
  try {
    // Get all scouting data for this team at this event
    const { data, error } = await supabase
      .from(SCOUTING_COLLECTION)
      .select('*')
      .eq('team_number', teamNumber)
      .eq('event_key', eventKey);

    if (error) throw error;
    const scoutingEntries = (data || []).map(convertToCamelCase);

    // Only recalculate if we have enough data
    if (scoutingEntries.length >= 2) {
      const epaService = await getEPAService();
      await epaService.calculateAdjustedEPA(teamNumber, eventKey, scoutingEntries);
    }
  } catch (error) {
    // EPA recalculation errors are non-critical - just log in dev mode
    if (import.meta.env.DEV) {
      console.error('EPA recalculation failed (non-critical):', error);
    }
  }
}

// =============================================================================
// READ - Get all scouting entries
// =============================================================================

/**
 * Get all scouting entries, filtered by role context
 * - Master admin: sees all data
 * - Team Lead (isTeamLead) OR Member with teamLeadUid: sees all data with matching teamLeadUid
 * - Legacy Scout Lead (canViewAll + scoutingId): sees all data with matching scoutingId
 * - Scout: sees only their OWN entries (by scouterUid)
 *
 * @param {Object} roleContext - From useAuth().roleContext
 * @returns {Array} - Array of scouting entries with IDs
 */
export async function getAllScoutingData(roleContext = null) {
  try {
    let query = supabase
      .from(SCOUTING_COLLECTION)
      .select('*')
      .order('created_at', { ascending: false });

    // Apply role-based filtering
    if (roleContext?.isMasterAdmin) {
      // Master admin sees everything - no filter
    } else if (roleContext?.teamLeadUid) {
      // Team Lead OR Member with teamLeadUid: sees all data linked to their Team Lead
      query = query.eq('team_lead_uid', roleContext.teamLeadUid);
    } else if (roleContext?.canViewAll && roleContext?.scoutingId) {
      // Legacy Scout Lead (canViewAll + scoutingId): sees all with matching scoutingId
      query = query.eq('scouting_id', roleContext.scoutingId);
    } else if (roleContext?.userUid) {
      // Regular Scout: sees only their OWN entries (by scouterUid)
      query = query.eq('scouter_uid', roleContext.userUid);
    }
    // Fallback: no filter (legacy behavior)

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(entry => ({
      id: entry.id,
      ...convertToCamelCase(entry)
    }));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('❌ Error fetching scouting data:', error);
    }
    throw new Error('Failed to load scouting data. Please try again.');
  }
}

// =============================================================================
// READ - Get scouting entries for a specific team
// =============================================================================

/**
 * Get all scouting entries for a specific team
 * Filtered by roleContext for team isolation:
 * - Master admin: sees all
 * - Team Lead/Member with teamLeadUid: sees all with matching teamLeadUid
 * - Legacy Scout Lead (canViewAll + scoutingId): sees all with matching scoutingId
 * - Scout: sees only their own entries
 *
 * @param {number|string} teamNumber - The team number to fetch data for
 * @param {Object} options - Optional filters { year, eventKey, roleContext }
 * @returns {Array} - Array of scouting entries for the team
 */
export async function getTeamScoutingData(teamNumber, options = {}) {
  try {
    const teamNum = parseInt(teamNumber);
    const { year, eventKey, roleContext } = options;

    let query = supabase
      .from(SCOUTING_COLLECTION)
      .select('*')
      .eq('team_number', teamNum)
      .order('created_at', { ascending: false });

    // Apply role-based filtering
    if (roleContext?.isMasterAdmin) {
      // Master admin sees all - no filter
    } else if (roleContext?.teamLeadUid) {
      query = query.eq('team_lead_uid', roleContext.teamLeadUid);
    } else if (roleContext?.canViewAll && roleContext?.scoutingId) {
      query = query.eq('scouting_id', roleContext.scoutingId);
    } else if (roleContext?.userUid) {
      query = query.eq('scouter_uid', roleContext.userUid);
    }

    // Filter by event if specified
    if (eventKey) {
      query = query.eq('event_key', eventKey);
    }

    const { data, error } = await query;

    if (error) throw error;

    let results = (data || []).map(entry => ({
      id: entry.id,
      ...convertToCamelCase(entry)
    }));

    // Filter by year if specified (client-side for flexibility)
    if (year && !eventKey) {
      results = results.filter(doc => {
        // Check eventYear field first
        if (doc.eventYear === year) return true;
        // Fall back to checking eventKey prefix
        if (doc.eventKey && doc.eventKey.startsWith(year.toString())) return true;
        return false;
      });
    }

    return results;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('❌ Error fetching team scouting data:', error);
    }
    throw new Error('Failed to load team data. Please try again.');
  }
}

// =============================================================================
// READ - Get scouting entries for an event
// =============================================================================

/**
 * Get all scouting entries for a specific event
 * Filtered by roleContext for team isolation:
 * - Master admin: sees all
 * - Team Lead/Member with teamLeadUid: sees all with matching teamLeadUid
 * - Legacy Scout Lead (canViewAll + scoutingId): sees all with matching scoutingId
 * - Scout: sees only their own entries
 *
 * @param {string} eventKey - The event key to fetch data for
 * @param {Object} roleContext - From useAuth().roleContext
 * @returns {Array} - Array of scouting entries for the event
 */
export async function getEventScoutingData(eventKey, roleContext = null) {
  try {
    let query = supabase
      .from(SCOUTING_COLLECTION)
      .select('*')
      .eq('event_key', eventKey)
      .order('created_at', { ascending: false });

    // Apply role-based filtering
    if (roleContext?.isMasterAdmin) {
      // Master admin sees all - no filter
    } else if (roleContext?.teamLeadUid) {
      query = query.eq('team_lead_uid', roleContext.teamLeadUid);
    } else if (roleContext?.canViewAll && roleContext?.scoutingId) {
      query = query.eq('scouting_id', roleContext.scoutingId);
    } else if (roleContext?.userUid) {
      query = query.eq('scouter_uid', roleContext.userUid);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(entry => ({
      id: entry.id,
      ...convertToCamelCase(entry)
    }));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('❌ Error fetching event scouting data:', error);
    }
    throw new Error('Failed to load event data. Please try again.');
  }
}

// =============================================================================
// UPDATE - Update an existing scouting entry
// =============================================================================

/**
 * Update an existing scouting entry
 *
 * @param {string} docId - The document ID to update
 * @param {Object} data - The data to update
 * @param {number} teamNumber - Team number for EPA recalculation
 * @param {string} eventKey - Event key for EPA recalculation
 */
export async function updateScoutingData(docId, data, teamNumber = null, eventKey = null) {
  try {
    // Convert camelCase to snake_case for Supabase
    const snakeCaseData = convertToSnakeCase(data);

    const { error } = await supabase
      .from(SCOUTING_COLLECTION)
      .update(snakeCaseData)
      .eq('id', docId);

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log('✅ Scouting data updated:', docId);
    }

    // Trigger EPA recalculation if team/event info provided
    if (teamNumber && eventKey) {
      triggerEPARecalculation(teamNumber, eventKey);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('❌ Error updating scouting data:', error);
    }
    throw new Error('Failed to update scouting data. Please try again.');
  }
}

// =============================================================================
// DELETE - Delete a scouting entry
// =============================================================================

/**
 * Delete a scouting entry
 *
 * @param {string} docId - The document ID to delete
 * @param {number} teamNumber - Team number for EPA recalculation
 * @param {string} eventKey - Event key for EPA recalculation
 */
export async function deleteScoutingData(docId, teamNumber = null, eventKey = null) {
  try {
    const { error } = await supabase
      .from(SCOUTING_COLLECTION)
      .delete()
      .eq('id', docId);

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log('✅ Scouting data deleted:', docId);
    }

    // Trigger EPA recalculation if team/event info provided
    if (teamNumber && eventKey) {
      triggerEPARecalculation(teamNumber, eventKey);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('❌ Error deleting scouting data:', error);
    }
    throw new Error('Failed to delete scouting data. Please try again.');
  }
}

// =============================================================================
// STORAGE OPTIMIZATION - Aggregate Team Stats
// =============================================================================

/**
 * Calculate aggregate statistics for a team from raw scouting entries
 * This avoids repeated full document reads for displaying team summaries
 *
 * @param {Array} entries - Raw scouting entries for a team (array of match records)
 * @returns {Object} - Aggregated statistics including averages and rates
 *
 * WHAT THIS FUNCTION DOES:
 * Takes all scouting entries for a single team and calculates averages and rates.
 * This is used in the Analytics and Recommended Alliance pages to compare teams.
 *
 * AUTO RATING FORMULA:
 * The auto rating (0-100 scale) is a composite score with these weights:
 *   - 40% Scoring Component: avgAutoFuel * 10 + avgAutoCycles * 15 (capped at 40)
 *   - 25% Accuracy Component: (autoAccuracy / 100) * 25
 *   - 20% Consistency Component: (autoConsistency / 100) * 20
 *   - 15% Bonus Component: (mobility% + winRate%) / 200 * 15
 *
 * CONSISTENCY CALCULATION:
 * Uses the Coefficient of Variation (CV = stdDev / mean)
 * Lower CV = more consistent performance
 * Consistency = (1 - CV) * 100, clamped to 0-100
 */
export function calculateTeamAggregates(entries) {
  // If no entries, return zeros for all metrics
  // This prevents division by zero and provides sensible defaults
  if (!entries || entries.length === 0) {
    return {
      matchCount: 0,
      avgAutoFuel: 0,
      avgTeleopFuel: 0,
      avgCycles: 0,
      avgDefense: 0,
      climbRate: 0,
      // Auto-specific metrics (used in Recommended Alliance feature)
      avgAutoShotsMade: 0,
      avgAutoShotsAttempted: 0,
      autoAccuracy: 0,
      avgAutoCycles: 0,
      autoMobilityRate: 0,
      autoWinRate: 0,
      autoRating: 0,
      autoRatingLabel: 'N/A',
      autoConsistency: 0,
      lastUpdated: null
    };
  }

  const matchCount = entries.length;

  // ---------------------------------------------------------------------------
  // STEP 1: Sum up all numeric fields across all matches
  // ---------------------------------------------------------------------------
  let totalAutoFuel = 0;
  let totalAutoShotsAttempted = 0;
  let totalAutoCycles = 0;
  let autoMobilityCount = 0;    // How many matches they moved from starting position
  let autoWinCount = 0;         // How many matches their alliance won auto
  let totalTeleopFuel = 0;
  let totalCycles = 0;
  let totalDefense = 0;
  let climbCount = 0;
  let latestDate = null;

  // Array to store auto scores for consistency calculation
  const autoScores = [];

  // Loop through each match entry
  for (const entry of entries) {
    // --- Auto Period Metrics ---
    const autoFuel = entry.autoFuelScored || 0;
    totalAutoFuel += autoFuel;
    totalAutoShotsAttempted += entry.autoShotsAttempted || 0;
    totalAutoCycles += entry.autoCyclesCompleted || 0;

    // Count mobility - supports BOTH new field (startingPosition) and legacy field (autoMobility)
    // This ensures backward compatibility with older scouting data
    if (entry.startingPosition || entry.autoMobility) autoMobilityCount++;

    // Did this alliance win auto? (hubControlFirst checkbox)
    if (entry.hubControlFirst) autoWinCount++;

    // Track auto scores for consistency calculation
    // Cycles are weighted 2x since they're harder to achieve
    autoScores.push(autoFuel + (entry.autoCyclesCompleted || 0) * 2);

    // --- Teleop Period Metrics ---
    totalTeleopFuel += (entry.teleopFuelActive || 0) + (entry.teleopFuelInactive || 0);
    // Support both old field name (teleopCycleCount) and new field name (teleopBallsCycled)
    totalCycles += entry.teleopBallsCycled || entry.teleopCycleCount || 0;
    // Support both old field (defenseRating) and new field (endgameFuelScored)
    totalDefense += entry.endgameFuelScored || entry.defenseRating || 0;

    // --- Endgame Metrics ---
    // Count successful climbs (any level except 'none')
    if (entry.endgameTowerLevel === 'level1' || entry.endgameTowerLevel === 'level2' || entry.endgameTowerLevel === 'level3') {
      climbCount++;
    }

    // Track the most recent entry date
    const entryDate = entry.createdAt ? new Date(entry.createdAt) : null;
    if (entryDate && (!latestDate || entryDate > latestDate)) {
      latestDate = entryDate;
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Calculate averages and rates
  // ---------------------------------------------------------------------------
  // Math.round(x * 10) / 10 rounds to 1 decimal place
  const avgAutoFuel = Math.round((totalAutoFuel / matchCount) * 10) / 10;
  const avgAutoShotsAttempted = Math.round((totalAutoShotsAttempted / matchCount) * 10) / 10;
  const avgAutoCycles = Math.round((totalAutoCycles / matchCount) * 10) / 10;
  const autoMobilityRate = Math.round((autoMobilityCount / matchCount) * 100);  // Percentage
  const autoWinRate = Math.round((autoWinCount / matchCount) * 100);            // Percentage

  // ---------------------------------------------------------------------------
  // STEP 3: Calculate auto accuracy
  // ---------------------------------------------------------------------------
  // Accuracy = shots made / shots attempted * 100
  const autoAccuracy = totalAutoShotsAttempted > 0
    ? Math.round((totalAutoFuel / totalAutoShotsAttempted) * 100)
    : 0;

  // ---------------------------------------------------------------------------
  // STEP 4: Calculate auto consistency using Coefficient of Variation
  // ---------------------------------------------------------------------------
  // Coefficient of Variation (CV) = Standard Deviation / Mean
  // Low CV means consistent performance, high CV means inconsistent
  // We invert it so higher number = more consistent
  let autoConsistency = 100;  // Default to 100 if only 1 match (can't measure variance)
  if (autoScores.length > 1) {
    // Calculate mean (average)
    const mean = autoScores.reduce((a, b) => a + b, 0) / autoScores.length;
    if (mean > 0) {
      // Calculate variance: average of squared differences from mean
      const variance = autoScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / autoScores.length;
      // Standard deviation is the square root of variance
      const stdDev = Math.sqrt(variance);
      // Coefficient of variation
      const cv = stdDev / mean;
      // Convert to consistency score (0-100): lower CV = higher consistency
      // Cap cv at 1 to prevent negative consistency scores
      autoConsistency = Math.max(0, Math.round((1 - Math.min(cv, 1)) * 100));
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 5: Calculate composite auto rating (0-100 scale)
  // ---------------------------------------------------------------------------
  // This combines multiple auto metrics into a single score for easy comparison
  //
  // Weights:
  //   40% - Scoring (fuel + cycles)
  //   25% - Accuracy (shots made / shots attempted)
  //   20% - Consistency (low variance in performance)
  //   15% - Bonuses (mobility + winning auto)
  const scoringComponent = Math.min(avgAutoFuel * 10 + avgAutoCycles * 15, 40);  // Cap at 40
  const accuracyComponent = (autoAccuracy / 100) * 25;
  const consistencyComponent = (autoConsistency / 100) * 20;
  const bonusComponent = ((autoMobilityRate + autoWinRate) / 200) * 15;
  const autoRating = Math.round(scoringComponent + accuracyComponent + consistencyComponent + bonusComponent);

  // ---------------------------------------------------------------------------
  // STEP 6: Determine auto rating label (for display)
  // ---------------------------------------------------------------------------
  // High = 60+, Medium = 35-59, Low = 0-34
  let autoRatingLabel = 'Low';
  if (autoRating >= 60) autoRatingLabel = 'High';
  else if (autoRating >= 35) autoRatingLabel = 'Medium';

  return {
    matchCount,
    avgAutoFuel,
    avgTeleopFuel: Math.round((totalTeleopFuel / matchCount) * 10) / 10,
    avgCycles: Math.round((totalCycles / matchCount) * 10) / 10,
    avgDefense: Math.round((totalDefense / matchCount) * 10) / 10,
    climbRate: Math.round((climbCount / matchCount) * 100),
    // Auto-specific metrics
    avgAutoShotsMade: avgAutoFuel,
    avgAutoShotsAttempted,
    autoAccuracy,
    avgAutoCycles,
    autoMobilityRate,
    autoWinRate,
    autoRating,
    autoRatingLabel,
    autoConsistency,
    lastUpdated: latestDate?.toISOString() || null
  };
}

/**
 * Get team summary for an event (uses aggregation for efficiency)
 *
 * @param {number} teamNumber - Team number
 * @param {string} eventKey - Event key
 * @param {Object} roleContext - For role-based filtering
 * @returns {Object} - Team summary with aggregates
 */
export async function getTeamEventSummary(teamNumber, eventKey, roleContext = null) {
  const entries = await getTeamScoutingData(teamNumber, { eventKey, roleContext });
  const aggregates = calculateTeamAggregates(entries);

  return {
    teamNumber: parseInt(teamNumber),
    eventKey,
    ...aggregates,
    entries: entries.length <= 5 ? entries : entries.slice(0, 5) // Limit raw entries returned
  };
}

/**
 * Get paginated scouting entries (for large datasets)
 * Reduces memory usage by loading entries in chunks
 * Filtered by roleContext:
 * - Master admin: sees all
 * - Team Lead/Member with teamLeadUid: sees all with matching teamLeadUid
 * - Legacy Scout Lead (canViewAll + scoutingId): sees all with matching scoutingId
 * - Scout: sees only their own entries
 *
 * @param {Object} options - { pageSize, offset, roleContext }
 * @returns {Object} - { entries, offset, hasMore }
 */
export async function getPaginatedScoutingData(options = {}) {
  const { pageSize = 20, offset = 0, roleContext = null } = options;

  try {
    let query = supabase
      .from(SCOUTING_COLLECTION)
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    // Apply role-based filtering
    if (roleContext && !roleContext.isMasterAdmin) {
      if (roleContext.teamLeadUid) {
        query = query.eq('team_lead_uid', roleContext.teamLeadUid);
      } else if (roleContext.canViewAll && roleContext.scoutingId) {
        query = query.eq('scouting_id', roleContext.scoutingId);
      } else if (roleContext.userUid) {
        query = query.eq('scouter_uid', roleContext.userUid);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    const entries = (data || []).map(entry => ({
      id: entry.id,
      ...convertToCamelCase(entry)
    }));

    return {
      entries,
      offset: offset + entries.length,
      hasMore: entries.length === pageSize
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('❌ Error fetching paginated data:', error);
    }
    throw new Error('Failed to load data. Please try again.');
  }
}

// =============================================================================
// CROSS-EVENT SCOUTING DATA
// =============================================================================

/**
 * Get all scouting entries for multiple teams across all events
 * Used for cross-event scouting decay in match predictions
 * Returns a map of teamNumber -> [all scouting entries]
 *
 * @param {Array<number>} teamNumbers - Array of team numbers to fetch data for
 * @param {Object} roleContext - Role context for filtering
 * @returns {Object} - Map of teamNumber -> entries array
 */
export async function getCrossEventScoutingData(teamNumbers, roleContext = null) {
  if (!teamNumbers || teamNumbers.length === 0) {
    return {};
  }

  try {
    // Build query for all specified teams
    let query = supabase
      .from(SCOUTING_COLLECTION)
      .select('*')
      .in('team_number', teamNumbers)
      .order('created_at', { ascending: false });

    // Apply role-based filtering
    if (roleContext?.isMasterAdmin) {
      // Master admin sees all - no filter
    } else if (roleContext?.teamLeadUid) {
      query = query.eq('team_lead_uid', roleContext.teamLeadUid);
    } else if (roleContext?.canViewAll && roleContext?.scoutingId) {
      query = query.eq('scouting_id', roleContext.scoutingId);
    } else if (roleContext?.userUid) {
      query = query.eq('scouter_uid', roleContext.userUid);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group entries by team number
    const result = {};
    for (const entry of (data || [])) {
      const camelEntry = {
        id: entry.id,
        ...convertToCamelCase(entry)
      };
      const teamNum = camelEntry.teamNumber;
      if (!result[teamNum]) {
        result[teamNum] = [];
      }
      result[teamNum].push(camelEntry);
    }

    return result;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('❌ Error fetching cross-event scouting data:', error);
    }
    // Return empty object on error - cross-event data is optional
    return {};
  }
}
