/**
 * =============================================================================
 * SCOUTING CONFIG SERVICE - Customizable Scouting Field Management
 * =============================================================================
 * 
 * Allows team leads to create custom scouting configurations without code changes.
 * Supports dynamic field types, weights, and ECS calculation formulas.
 * 
 * =============================================================================
 */

import { supabase } from './supabase';

// =============================================================================
// FIELD TYPES AND DEFAULTS
// =============================================================================

export const FIELD_TYPES = {
  NUMBER: 'number',
  COUNTER: 'counter',
  TOGGLE: 'toggle',
  SELECT: 'select',
  TEXT: 'text',
  RATING: 'rating'
};

export const FIELD_CATEGORIES = {
  AUTO: 'auto',
  TELEOP: 'teleop',
  ENDGAME: 'endgame',
  GENERAL: 'general',
  CUSTOM: 'custom'
};

// Default 2026 REBUILT game fields
export const DEFAULT_FIELDS = [
  { id: 'auto_fuel_scored', name: 'Auto Fuel Scored', type: 'counter', category: 'auto', min: 0, max: 50, weight: 1.5 },
  { id: 'auto_shots_attempted', name: 'Auto Shots Attempted', type: 'counter', category: 'auto', min: 0, max: 50, weight: 0 },
  { id: 'auto_cycles_completed', name: 'Auto Cycles', type: 'counter', category: 'auto', min: 0, max: 10, weight: 2 },
  { id: 'auto_tower_climb', name: 'Auto Tower Climb', type: 'select', category: 'auto', options: ['none', 'level1'], weight: 10 },
  { id: 'teleop_fuel_active', name: 'Teleop Active Hub Fuel', type: 'counter', category: 'teleop', min: 0, max: 100, weight: 1 },
  { id: 'teleop_fuel_inactive', name: 'Teleop Inactive Hub Fuel', type: 'counter', category: 'teleop', min: 0, max: 100, weight: 0 },
  { id: 'teleop_balls_cycled', name: 'Teleop Balls Cycled', type: 'counter', category: 'teleop', min: 0, max: 50, weight: 1.5 },
  { id: 'endgame_tower_climb', name: 'Endgame Tower Climb', type: 'select', category: 'endgame', options: ['none', 'level1', 'level2', 'level3'], weight: 15 },
  { id: 'endgame_fuel_scored', name: 'Endgame Fuel', type: 'counter', category: 'endgame', min: 0, max: 30, weight: 1 },
  { id: 'robot_role', name: 'Robot Role', type: 'select', category: 'general', options: ['shooter', 'cycler', 'defense'], weight: 0 },
  { id: 'defense_rating', name: 'Defense Rating', type: 'rating', category: 'general', min: 1, max: 5, weight: 5 },
  { id: 'notes', name: 'Notes', type: 'text', category: 'general', weight: 0 }
];

export const DEFAULT_SCORING_WEIGHTS = {
  auto_fuel_scored: 1.5,
  auto_cycles_completed: 2,
  auto_tower_climb: 10,
  teleop_fuel_active: 1,
  teleop_balls_cycled: 1.5,
  endgame_tower_climb: 15,
  endgame_fuel_scored: 1,
  defense_rating: 5
};

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

/**
 * Get active scouting configuration for a team
 * @param {string} teamLeadUid - Team lead's user ID
 * @param {number} year - Year for the configuration
 * @returns {Promise<Object|null>} - Configuration object or null
 */
export async function getScoutingConfig(teamLeadUid, year = 2026) {
  try {
    const { data, error } = await supabase
      .from('scouting_config')
      .select('*')
      .eq('team_lead_uid', teamLeadUid)
      .eq('year', year)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    // Return default config if none exists
    if (!data) {
      return {
        id: null,
        fields: DEFAULT_FIELDS,
        scoring_weights: DEFAULT_SCORING_WEIGHTS,
        ecs_config: { formula: 'default', version: 1 },
        config_name: 'Default Config',
        year,
        is_default: true
      };
    }

    return data;
  } catch (error) {
    console.error('Error getting scouting config:', error);
    return {
      fields: DEFAULT_FIELDS,
      scoring_weights: DEFAULT_SCORING_WEIGHTS,
      ecs_config: { formula: 'default', version: 1 },
      is_default: true
    };
  }
}

/**
 * Save or update scouting configuration
 */
export async function saveScoutingConfig(teamLeadUid, config) {
  try {
    const configData = {
      team_lead_uid: teamLeadUid,
      config_name: config.config_name || 'Custom Config',
      year: config.year || 2026,
      is_active: true,
      fields: config.fields || DEFAULT_FIELDS,
      scoring_weights: config.scoring_weights || DEFAULT_SCORING_WEIGHTS,
      ecs_config: config.ecs_config || { formula: 'default', version: 1 }
    };

    // Deactivate existing configs for this year first
    await supabase
      .from('scouting_config')
      .update({ is_active: false })
      .eq('team_lead_uid', teamLeadUid)
      .eq('year', configData.year);

    // Insert new config
    const { data, error } = await supabase
      .from('scouting_config')
      .insert(configData)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving scouting config:', error);
    throw new Error('Failed to save configuration');
  }
}

// =============================================================================
// ECS CALCULATION
// =============================================================================

/**
 * Calculate Estimated Contribution Score (ECS) for a team
 * @param {Object} matchData - Scouting data from a match
 * @param {Object} weights - Scoring weights
 * @returns {number} - Calculated ECS score
 */
export function calculateECS(matchData, weights = DEFAULT_SCORING_WEIGHTS) {
  let score = 0;

  Object.entries(weights).forEach(([field, weight]) => {
    const value = matchData[field];
    if (value !== undefined && value !== null && weight > 0) {
      if (typeof value === 'number') {
        score += value * weight;
      } else if (typeof value === 'boolean') {
        score += value ? weight : 0;
      } else if (typeof value === 'string') {
        // Handle select fields (e.g., climb levels)
        const levelMatch = value.match(/level(\d)/i);
        if (levelMatch) {
          score += parseInt(levelMatch[1]) * weight;
        } else if (value !== 'none' && value !== '') {
          score += weight;
        }
      }
    }
  });

  return Math.round(score * 10) / 10;
}

/**
 * Calculate average ECS for a team across matches
 */
export function calculateAverageECS(matches, weights = DEFAULT_SCORING_WEIGHTS) {
  if (!matches || matches.length === 0) return 0;
  const total = matches.reduce((sum, match) => sum + calculateECS(match, weights), 0);
  return Math.round((total / matches.length) * 10) / 10;
}

