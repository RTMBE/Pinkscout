/**
 * =============================================================================
 * PIT SCOUTING SERVICE - Pre-event robot capability collection
 * =============================================================================
 * 
 * Handles CRUD operations for pit scouting data.
 * Pit scouting is done before matches to record robot capabilities.
 * 
 * =============================================================================
 */

import { supabase } from './supabase';
import { isOnline, addToOfflineQueue } from './offlineSyncService';
import { compressImage } from '../utils/imageCompression';

// =============================================================================
// GET PIT SCOUTING DATA
// =============================================================================

/**
 * Get all pit scouting entries for an event
 * @param {string} eventKey - The event key (e.g., "2026miket")
 * @param {Object} roleContext - User's role context for RLS
 * @returns {Promise<Array>} Array of pit scouting entries
 */
export async function getPitScoutingByEvent(eventKey, roleContext) {
  // SCALING FIX: Limit pit scouting entries (max ~100 teams at an event)
  const MAX_PIT_ENTRIES = 200;

  let query = supabase
    .from('pit_scouting')
    .select('*')
    .eq('event_key', eventKey)
    .order('team_number', { ascending: true })
    .limit(MAX_PIT_ENTRIES);

  // Apply team isolation if user has a team lead
  if (roleContext?.teamLeadUid) {
    query = query.eq('team_lead_uid', roleContext.teamLeadUid);
  }

  const { data, error } = await query;

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching pit scouting data:', error);
    }
    throw error;
  }

  return data || [];
}

/**
 * Get pit scouting entry for a specific team at an event
 * @param {number} teamNumber - The team number
 * @param {string} eventKey - The event key
 * @param {Object} roleContext - User's role context
 * @returns {Promise<Object|null>} Pit scouting entry or null
 */
export async function getPitScoutingForTeam(teamNumber, eventKey, roleContext) {
  let query = supabase
    .from('pit_scouting')
    .select('*')
    .eq('team_number', teamNumber)
    .eq('event_key', eventKey);

  // Apply team isolation
  if (roleContext?.teamLeadUid) {
    query = query.eq('team_lead_uid', roleContext.teamLeadUid);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('Error fetching pit scouting for team:', error);
    throw error;
  }

  return data;
}

// =============================================================================
// SAVE PIT SCOUTING DATA
// =============================================================================

/**
 * Save or update pit scouting data
 * @param {Object} pitData - The pit scouting data to save
 * @returns {Promise<Object>} Saved pit scouting entry
 */
export async function savePitScoutingData(pitData) {
  // SCALING FIX: Retry configuration
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;

  // Check if offline - queue for later sync
  if (!isOnline()) {
    const queued = addToOfflineQueue('pit_scouting', pitData);
    if (queued) {
      return { id: 'offline-queued', offline: true };
    } else {
      throw new Error('Failed to save offline. Please try again.');
    }
  }

  // Validate required fields
  if (!pitData.teamNumber) {
    throw new Error('Team number is required');
  }
  if (!pitData.eventKey) {
    throw new Error('Event key is required');
  }
  if (!pitData.scouterUid) {
    throw new Error('Scouter UID is required');
  }

  // Format data for database (snake_case)
  const dbData = {
    team_number: parseInt(pitData.teamNumber),
    event_key: pitData.eventKey,
    drive_type: pitData.driveType || null,
    climb_level: pitData.climbLevel || null,
    shooter_type: pitData.shooterType || null,
    intake_type: pitData.intakeType || null,
    preferred_strategy: pitData.preferredStrategy || null,
    robot_image_url: pitData.robotImageUrl || null,
    scouter_uid: pitData.scouterUid,
    scouter_name: pitData.scouterName || null,
    team_lead_uid: pitData.teamLeadUid || null,
    scouting_id: pitData.scoutingId || null,
    notes: pitData.notes || null
  };

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Use upsert to handle both insert and update
      const { data, error } = await supabase
        .from('pit_scouting')
        .upsert(dbData, {
          onConflict: 'team_number,event_key,team_lead_uid',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      lastError = error;

      if (import.meta.env.DEV && attempt < MAX_RETRIES) {
        console.warn(`⚠️ Pit scouting save attempt ${attempt} failed, retrying...`, error);
      }

      // Wait before retrying (exponential backoff)
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
    }
  }

  if (import.meta.env.DEV) {
    console.error('Error saving pit scouting data after retries:', lastError);
  }
  throw new Error('Failed to save pit scouting data. Please try again.');
}

// =============================================================================
// DELETE PIT SCOUTING DATA
// =============================================================================

/**
 * Delete a pit scouting entry
 * @param {string} id - The pit scouting entry ID
 * @returns {Promise<void>}
 */
export async function deletePitScoutingEntry(id) {
  const { error } = await supabase
    .from('pit_scouting')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting pit scouting entry:', error);
    throw error;
  }
}

// =============================================================================
// IMAGE UPLOAD
// =============================================================================

/**
 * Upload robot image to Supabase Storage
 * @param {File} file - The image file to upload
 * @param {number} teamNumber - Team number for file naming
 * @param {string} eventKey - Event key for file naming
 * @returns {Promise<string>} Public URL of the uploaded image
 */
export async function uploadRobotImage(file, teamNumber, eventKey) {
  // Validate file
  if (!file) {
    throw new Error('No file provided');
  }

  // Check file size (max 5MB before compression)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error('Image must be less than 5MB');
  }

  // Check file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Image must be JPEG, PNG, or WebP');
  }

  // Compress image before upload (reduces file size by ~50-80%)
  let uploadFile = file;
  try {
    uploadFile = await compressImage(file, {
      maxWidth: 1200,
      maxHeight: 1200,
      quality: 0.8
    });
    if (import.meta.env.DEV) {
      console.log(`Image compressed: ${(file.size / 1024).toFixed(0)}KB → ${(uploadFile.size / 1024).toFixed(0)}KB`);
    }
  } catch (err) {
    // If compression fails, use original file
    if (import.meta.env.DEV) {
      console.warn('Image compression failed, using original:', err);
    }
    uploadFile = file;
  }

  // Generate unique filename (always .jpg after compression)
  const filename = `robot_${teamNumber}_${eventKey}_${Date.now()}.jpg`;
  const path = `pit-scouting/${filename}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('robot-images')
    .upload(path, uploadFile, {
      cacheControl: '3600',
      upsert: true
    });

  if (error) {
    console.error('Error uploading image:', error);
    throw error;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('robot-images')
    .getPublicUrl(path);

  return urlData.publicUrl;
}

