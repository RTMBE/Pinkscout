/**
 * =============================================================================
 * STRATEGY SERVICE - Strategy drawing storage and retrieval
 * =============================================================================
 * 
 * Handles CRUD operations for strategy board drawings.
 * Drawings are stored as JSON in Supabase.
 * 
 * =============================================================================
 */

import { supabase } from './supabase';

// =============================================================================
// GET STRATEGY DRAWINGS
// =============================================================================

/**
 * Get all strategy drawings for an event
 * @param {string} eventKey - The event key
 * @param {Object} roleContext - Membership-backed user context
 * @returns {Promise<Array>} Array of strategy drawings
 */
export async function getStrategyDrawings(eventKey, roleContext) {
  const activeTeamId = roleContext?.activeTeamId;

  // Avoid an accidental unscoped browser request while membership is loading.
  if (!activeTeamId) return [];

  let query = supabase
    .from('strategy_drawings')
    .select('*')
    .eq('event_key', eventKey)
    .order('created_at', { ascending: false });

  // This is a client-side guardrail; RLS remains authoritative.
  query = query.eq('team_id', activeTeamId);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching strategy drawings:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get a specific strategy drawing by ID
 * @param {string} id - The drawing ID
 * @param {Object} roleContext - Membership-backed user context
 * @returns {Promise<Object|null>} Strategy drawing or null
 */
export async function getStrategyDrawingById(id, roleContext) {
  const activeTeamId = roleContext?.activeTeamId;
  if (!activeTeamId) return null;

  let query = supabase
    .from('strategy_drawings')
    .select('*')
    .eq('id', id);

  query = query.eq('team_id', activeTeamId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('Error fetching strategy drawing:', error);
    throw error;
  }

  return data;
}

/**
 * Get default strategy drawing for an event (non-match-specific)
 * @param {string} eventKey - The event key
 * @param {Object} roleContext - User's role context
 * @returns {Promise<Object|null>} Default strategy drawing or null
 */
export async function getDefaultStrategyDrawing(eventKey, roleContext) {
  const activeTeamId = roleContext?.activeTeamId;
  if (!activeTeamId) return null;

  let query = supabase
    .from('strategy_drawings')
    .select('*')
    .eq('event_key', eventKey)
    .eq('is_default', true);

  query = query.eq('team_id', activeTeamId);

  const { data, error } = await query.maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching default strategy:', error);
    throw error;
  }

  return data;
}

// =============================================================================
// SAVE STRATEGY DRAWING
// =============================================================================

/**
 * Save or update a strategy drawing
 * @param {Object} drawing - The drawing data to save
 * @returns {Promise<Object>} Saved drawing
 */
export async function saveStrategyDrawing(drawing) {
  // Validate required fields
  if (!drawing.eventKey) {
    throw new Error('Event key is required');
  }
  if (!drawing.drawingData) {
    throw new Error('Drawing data is required');
  }
  if (!drawing.teamId) {
    throw new Error('An active team membership is required');
  }

  // Do not send team, author, or legacy-lead fields. The security migration's
  // BEFORE trigger derives them from the authenticated membership, so a
  // modified browser payload cannot write into another team's drawing set.
  const dbData = {
    event_key: drawing.eventKey,
    match_key: drawing.matchKey || null,
    drawing_data: drawing.drawingData,
    title: drawing.title || null,
    is_default: drawing.isDefault || false
  };

  let result;
  
  // Update existing or insert new
  if (drawing.id) {
    const { data, error } = await supabase
      .from('strategy_drawings')
      .update(dbData)
      .eq('id', drawing.id)
      .eq('team_id', drawing.teamId)
      .select()
      .single();
    
    if (error) throw error;
    result = data;
  } else {
    const { data, error } = await supabase
      .from('strategy_drawings')
      .insert(dbData)
      .select()
      .single();
    
    if (error) throw error;
    result = data;
  }

  return result;
}

// =============================================================================
// DELETE STRATEGY DRAWING
// =============================================================================

/**
 * Delete a strategy drawing
 * @param {string} id - The drawing ID
 * @param {Object} roleContext - Membership-backed user context
 * @returns {Promise<void>}
 */
export async function deleteStrategyDrawing(id, roleContext) {
  const activeTeamId = roleContext?.activeTeamId;
  if (!activeTeamId) {
    throw new Error('An active team membership is required');
  }

  const { error } = await supabase
    .from('strategy_drawings')
    .delete()
    .eq('id', id)
    .eq('team_id', activeTeamId);

  if (error) {
    console.error('Error deleting strategy drawing:', error);
    throw error;
  }
}
