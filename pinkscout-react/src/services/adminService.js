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

import { supabase } from './supabase';
import { getCompetitionData } from './competitionApi';

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
 * Question mutations must go through the audited Supabase operator workflow.
 *
 * @param {Object} question - Question object { text, category, type, order }
 * @returns {string} - The document ID of the new question
 */
export async function addQuestion(question) {
  void question;
  throw new Error('Question management is unavailable from a browser session.');
}

/**
 * Update an existing question
 *
 * @param {string} docId - The document ID to update
 * @param {Object} data - The data to update
 */
export async function updateQuestion(docId, updateData) {
  void docId;
  void updateData;
  throw new Error('Question management is unavailable from a browser session.');
}

/**
 * Delete a question
 *
 * @param {string} docId - The document ID to delete
 */
export async function deleteQuestion(docId) {
  void docId;
  throw new Error('Question management is unavailable from a browser session.');
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
  // Platform-admin identities are deliberately not enumerable from the
  // browser. Use the audited Supabase dashboard procedure instead.
  return [];
}

/**
 * Add an email to the admin list
 *
 * @param {string} email - Email to add as admin
 */
export async function addAdmin(email) {
  void email;
  throw new Error('Platform-admin access cannot be granted from a browser session.');
}

/**
 * Remove an email from the admin list
 *
 * @param {string} email - Email to remove from admins
 */
export async function removeAdmin(email) {
  void email;
  throw new Error('Platform-admin access cannot be changed from a browser session.');
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

  // Check providers through the authenticated server boundary. Provider keys
  // and direct provider responses never reach an administrator's browser.
  try {
    await getCompetitionData('tba', 'status');
    status.tba = true;
  } catch { status.tba = false; }

  try {
    await getCompetitionData('statbotics', 'team', { teamNumber: 1551 });
    status.statbotics = true;
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
  throw new Error('Bulk deletion is disabled in the browser. Use the audited production runbook.');
}

/**
 * Wipe all user data except a specified account
 *
 * @param {string} preserveEmail - Email to preserve (primary admin)
 * @returns {Object} - { deleted: number, preserved: number }
 */
export async function wipeAllUserData(preserveEmail) {
  void preserveEmail;
  throw new Error('Bulk deletion is disabled in the browser. Use the audited production runbook.');
}

/**
 * Ensure a platform-admin configuration exists
 *
 * @param {string} adminEmail - The primary admin email
 */
export async function ensureAdminExists(adminEmail) {
  void adminEmail;
  throw new Error('Platform-admin access cannot be changed from a browser session.');
}

/**
 * Complete data wipe - removes all scouting and user data, preserves primary admin
 *
 * @returns {Object} - Summary of what was deleted
 */
export async function performCompleteDataWipe() {
  throw new Error('Bulk deletion is disabled in the browser. Use the audited production runbook.');
}
