/**
 * =============================================================================
 * SAVED EVENTS SERVICE - Save/favorite events for quick access
 * =============================================================================
 */

import { supabase } from './supabase';

/**
 * Get all saved events for the current user
 * @returns {Promise<Array>} Array of saved events
 */
export async function getSavedEvents() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('saved_events')
    .select('*')
    .eq('user_id', user.id)
    .order('start_date', { ascending: true });

  if (error) {
    console.error('Error fetching saved events:', error);
    return [];
  }

  return data || [];
}

/**
 * Check if an event is saved
 * @param {string} eventKey - TBA event key
 * @returns {Promise<boolean>}
 */
export async function isEventSaved(eventKey) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('saved_events')
    .select('id')
    .eq('user_id', user.id)
    .eq('event_key', eventKey)
    .single();

  return !error && !!data;
}

/**
 * Save an event
 * @param {Object} event - TBA event object
 * @returns {Promise<Object|null>}
 */
export async function saveEvent(event) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be logged in to save events');

  const { data, error } = await supabase
    .from('saved_events')
    .upsert({
      user_id: user.id,
      event_key: event.key,
      event_name: event.name,
      event_year: event.year,
      start_date: event.start_date,
      end_date: event.end_date,
      city: event.city,
      state_prov: event.state_prov,
      country: event.country,
      cached_data: event,
      cached_at: new Date().toISOString()
    }, { onConflict: 'user_id,event_key' })
    .select()
    .single();

  if (error) {
    console.error('Error saving event:', error);
    throw error;
  }

  return data;
}

/**
 * Remove a saved event
 * @param {string} eventKey - TBA event key
 * @returns {Promise<boolean>}
 */
export async function unsaveEvent(eventKey) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('saved_events')
    .delete()
    .eq('user_id', user.id)
    .eq('event_key', eventKey);

  if (error) {
    console.error('Error unsaving event:', error);
    return false;
  }

  return true;
}

/**
 * Toggle saved status of an event
 * @param {Object} event - TBA event object
 * @returns {Promise<boolean>} New saved status
 */
export async function toggleSaveEvent(event) {
  const isSaved = await isEventSaved(event.key);
  
  if (isSaved) {
    await unsaveEvent(event.key);
    return false;
  } else {
    await saveEvent(event);
    return true;
  }
}

