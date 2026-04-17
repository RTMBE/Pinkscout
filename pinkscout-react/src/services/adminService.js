/**
 * =============================================================================
 * ADMINSERVICE.JS - Admin Panel Database Operations
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * Handles admin-specific operations:
 * - Question management (CRUD)
 * - Admin list management
 * - Data statistics
 * - API status checks
 *
 * SUPABASE TABLES:
 * - questions - Scouting form questions
 * - admins - Admin email list
 *
 * =============================================================================
 */

import { supabase, API_KEYS } from './supabase';

// =============================================================================
// QUESTION MANAGEMENT
// =============================================================================

/**
 * Get all scouting questions, ordered by their display order
 *
 * @returns {Array} - Array of question objects with IDs
 */
export async function getAllQuestions() {
  try {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .order('order', { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching questions:', error);
    }
    throw new Error('Failed to load questions. Please try again.');
  }
}

/**
 * Add a new scouting question
 *
 * @param {Object} question - Question object { text, category, type, order }
 * @returns {string} - The document ID of the new question
 */
export async function addQuestion(question) {
  try {
    const { data, error } = await supabase
      .from('questions')
      .insert(question)
      .select('id')
      .single();

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log('✅ Question added:', data.id);
    }
    return data.id;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error adding question:', error);
    }
    throw new Error('Failed to add question. Please try again.');
  }
}

/**
 * Update an existing question
 *
 * @param {string} docId - The document ID to update
 * @param {Object} data - The data to update
 */
export async function updateQuestion(docId, updateData) {
  try {
    const { error } = await supabase
      .from('questions')
      .update(updateData)
      .eq('id', docId);

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log('✅ Question updated:', docId);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error updating question:', error);
    }
    throw new Error('Failed to update question. Please try again.');
  }
}

/**
 * Delete a question
 *
 * @param {string} docId - The document ID to delete
 */
export async function deleteQuestion(docId) {
  try {
    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', docId);

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log('✅ Question deleted:', docId);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error deleting question:', error);
    }
    throw new Error('Failed to delete question. Please try again.');
  }
}

// =============================================================================
// ADMIN LIST MANAGEMENT
// =============================================================================

/**
 * Get the list of admin emails
 *
 * @returns {Array} - Array of admin email strings
 */
export async function getAdminList() {
  try {
    // SCALING FIX: Limit admin list (should never have many admins)
    const MAX_ADMINS = 50;

    const { data, error } = await supabase
      .from('admins')
      .select('email')
      .limit(MAX_ADMINS);

    if (error) throw error;

    return (data || []).map(row => row.email);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching admin list:', error);
    }
    throw new Error('Failed to load admin list. Please try again.');
  }
}

/**
 * Add an email to the admin list
 *
 * @param {string} email - Email to add as admin
 */
export async function addAdmin(email) {
  try {
    const normalizedEmail = email.toLowerCase();

    // Check if already exists
    const { data: existing } = await supabase
      .from('admins')
      .select('email')
      .eq('email', normalizedEmail)
      .single();

    if (existing) {
      if (import.meta.env.DEV) {
        console.log('Admin already exists:', email);
      }
      return;
    }

    const { error } = await supabase
      .from('admins')
      .insert({ email: normalizedEmail });

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log('✅ Admin added:', email);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error adding admin:', error);
    }
    throw new Error('Failed to add admin. Please try again.');
  }
}

/**
 * Remove an email from the admin list
 *
 * @param {string} email - Email to remove from admins
 */
export async function removeAdmin(email) {
  try {
    const { error } = await supabase
      .from('admins')
      .delete()
      .eq('email', email.toLowerCase());

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log('✅ Admin removed:', email);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error removing admin:', error);
    }
    throw new Error('Failed to remove admin. Please try again.');
  }
}

// =============================================================================
// API STATUS
// =============================================================================

/**
 * Check the status of external APIs
 *
 * @returns {Object} - Status of each API { tba, statbotics }
 */
export async function getAPIStatus() {
  const status = { tba: false, statbotics: false };

  // Check TBA
  try {
    const tbaRes = await fetch('https://www.thebluealliance.com/api/v3/status', {
      headers: { 'X-TBA-Auth-Key': API_KEYS.TBA }
    });
    status.tba = tbaRes.ok;
  } catch { status.tba = false; }

  // Check Statbotics
  try {
    const sbRes = await fetch('https://api.statbotics.io/v3/team/1551');
    status.statbotics = sbRes.ok;
  } catch { status.statbotics = false; }

  return status;
}

// =============================================================================
// DATA WIPE FUNCTIONS
// =============================================================================

/**
 * Wipe all scouting data from the database
 *
 * @returns {Object} - { deleted: number } count of deleted documents
 */
export async function wipeAllScoutingData() {
  try {
    // Get count first
    const { count, error: countError } = await supabase
      .from('scouting')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    // Delete all records
    const { error } = await supabase
      .from('scouting')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (neq to non-existent id)

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log(`✅ Wiped ${count || 0} scouting records`);
    }
    return { deleted: count || 0 };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error wiping scouting data:', error);
    }
    throw new Error('Failed to wipe scouting data. Please try again.');
  }
}

/**
 * Wipe all user data except the primary admin
 *
 * @param {string} preserveEmail - Email to preserve (primary admin)
 * @returns {Object} - { deleted: number, preserved: number }
 */
export async function wipeAllUserData(preserveEmail = 'rtmbe20@gmail.com') {
  try {
    // Get count before delete
    const { data: allUsers, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email');

    if (fetchError) throw fetchError;

    const usersToDelete = (allUsers || []).filter(
      u => u.email?.toLowerCase() !== preserveEmail.toLowerCase()
    );
    const preserved = (allUsers || []).length - usersToDelete.length;

    // Delete non-admin users
    if (usersToDelete.length > 0) {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .neq('email', preserveEmail.toLowerCase());

      if (error) throw error;
    }

    if (import.meta.env.DEV) {
      console.log(`✅ Wiped ${usersToDelete.length} user profiles, preserved ${preserved}`);
    }
    return { deleted: usersToDelete.length, preserved };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error wiping user data:', error);
    }
    throw new Error('Failed to wipe user data. Please try again.');
  }
}

/**
 * Ensure the admin settings document has the primary admin email
 *
 * @param {string} adminEmail - The primary admin email
 */
export async function ensureAdminExists(adminEmail = 'rtmbe20@gmail.com') {
  try {
    const normalizedEmail = adminEmail.toLowerCase();

    // Delete all admins first
    await supabase
      .from('admins')
      .delete()
      .neq('email', normalizedEmail);

    // Upsert the primary admin
    const { error } = await supabase
      .from('admins')
      .upsert({ email: normalizedEmail }, { onConflict: 'email' });

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log(`✅ Admin settings reset with: ${adminEmail}`);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error ensuring admin exists:', error);
    }
    throw new Error('Failed to update admin settings. Please try again.');
  }
}

/**
 * Complete data wipe - removes all scouting and user data, preserves primary admin
 *
 * @returns {Object} - Summary of what was deleted
 */
export async function performCompleteDataWipe() {
  try {
    const results = {
      scoutingDeleted: 0,
      usersDeleted: 0,
      usersPreserved: 0
    };

    // Wipe scouting data
    const scoutingResult = await wipeAllScoutingData();
    results.scoutingDeleted = scoutingResult.deleted;

    // Wipe user data (preserve primary admin)
    const userResult = await wipeAllUserData('rtmbe20@gmail.com');
    results.usersDeleted = userResult.deleted;
    results.usersPreserved = userResult.preserved;

    // Ensure admin settings are correct
    await ensureAdminExists('rtmbe20@gmail.com');

    if (import.meta.env.DEV) {
      console.log('✅ Complete data wipe finished:', results);
    }
    return results;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error during complete data wipe:', error);
    }
    throw new Error('Failed to complete data wipe. Please try again.');
  }
}

