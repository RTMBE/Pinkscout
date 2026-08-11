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

const PRIVATE_IMAGE_BUCKET = 'team-robot-images';
const TEAM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function addSignedImageUrls(entries) {
  const paths = [...new Set(entries.map((entry) => entry.robot_image_path).filter(Boolean))];
  if (!paths.length) return entries;

  const { data, error } = await supabase.storage
    .from(PRIVATE_IMAGE_BUCKET)
    // Signed URLs are bearer URLs. Keep the post-revocation window short; a
    // fresh team-scoped data read signs a new URL when the view is reopened.
    .createSignedUrls(paths, 60);
  if (error) {
    if (import.meta.env.DEV) console.error('Unable to sign robot image URLs:', error);
    return entries.map((entry) => ({ ...entry, robot_image_url: null }));
  }
  const urls = new Map((data || []).map((item) => [item.path, item.signedUrl]));
  return entries.map((entry) => ({
    ...entry,
    robot_image_url: entry.robot_image_path ? (urls.get(entry.robot_image_path) || null) : null
  }));
}

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

  if (!roleContext?.activeTeamId) return [];
  query = query.eq('team_id', roleContext.activeTeamId);

  const { data, error } = await query;

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching pit scouting data:', error);
    }
    throw error;
  }

  return addSignedImageUrls(data || []);
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

  if (!roleContext?.activeTeamId) return null;
  query = query.eq('team_id', roleContext.activeTeamId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('Error fetching pit scouting for team:', error);
    throw error;
  }

  const [entry] = await addSignedImageUrls(data ? [data] : []);
  return entry || null;
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
    const queued = await addToOfflineQueue('pit_scouting', pitData, {
      userId: pitData.scouterUid,
      teamId: pitData.teamId
    });
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
  if (!pitData.teamId || !TEAM_ID_PATTERN.test(pitData.teamId)) {
    throw new Error('An active team membership is required');
  }

  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    throw new Error('Please sign in before saving pit scouting data.');
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
    robot_image_path: pitData.robotImagePath || null,
    // The database trigger stamps team and author from the session. `teamId`
    // is used only for the local membership precheck above; it is never sent
    // as a client-owned identity field.
    scouter_name: pitData.scouterName || null,
    notes: pitData.notes || null
  };

  if (typeof pitData.idempotencyKey === 'string' && pitData.idempotencyKey.length >= 16) {
    dbData.idempotency_key = pitData.idempotencyKey;
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Use upsert to handle both insert and update
      const { data, error } = await supabase
        .from('pit_scouting')
        .upsert(dbData, {
          onConflict: 'team_id,team_number,event_key',
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
 * @param {string} teamId - Active team UUID for private object path
 * @param {number} teamNumber - Team number for file naming
 * @param {string} eventKey - Event key for file naming
 * @returns {Promise<string>} Private storage path, not a public URL
 */
export async function uploadRobotImage(file, teamId, teamNumber, eventKey) {
  // Validate file
  if (!file) {
    throw new Error('No file provided');
  }
  if (!TEAM_ID_PATTERN.test(teamId || '')) {
    throw new Error('An active team membership is required to upload an image');
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

  // Preserve the actual normalized MIME type (small images may not need canvas
  // compression) so storage metadata and filename always agree.
  const extensionByType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const extension = extensionByType[uploadFile.type];
  if (!extension) throw new Error('Image compression produced an unsupported format');
  const filename = `robot_${teamNumber}_${eventKey}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const path = `${teamId}/pit-scouting/${filename}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(PRIVATE_IMAGE_BUCKET)
    .upload(path, uploadFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: uploadFile.type
    });

  if (error) {
    console.error('Error uploading image:', error);
    throw error;
  }

  return data.path;
}
