/**
 * =============================================================================
 * TEAMCODESERVICE.JS - Team Invite Code Management
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * Handles team invite code generation, validation, and team member management.
 *
 * TEAM CODE SYSTEM:
 * - Team Leads generate unique invite codes
 * - Members join by entering a Team Lead's code
 * - All scouting data is linked to the Team Lead's UID
 * - Team Leads can see all data from their team members
 *
 * SUPABASE TABLES:
 * - team_codes: { code, team_lead_uid, team_lead_email, created_at, active }
 * - profiles: adds { is_team_lead, team_lead_uid, team_code }
 *
 * =============================================================================
 */

import { supabase } from './supabase';

// =============================================================================
// CONSTANTS
// =============================================================================

// Team code length and character set
const CODE_LENGTH = 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: I,O,0,1

// =============================================================================
// CODE GENERATION
// =============================================================================

/**
 * Generate a random team code
 * @returns {string} - 6-character alphanumeric code
 */
function generateRandomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

/**
 * Generate a unique team code for a Team Lead
 * Checks for collisions and retries if needed
 *
 * @param {string} teamLeadUid - UID of the Team Lead
 * @param {string} teamLeadEmail - Email of the Team Lead
 * @returns {Promise<string>} - The generated team code
 */
export async function generateTeamCode(teamLeadUid, teamLeadEmail) {
  if (!teamLeadUid) throw new Error('Team Lead UID is required');

  // Check if user already has a code
  const existingCode = await getTeamLeadCode(teamLeadUid);
  if (existingCode) {
    return existingCode;
  }

  // Generate unique code with collision check
  let code;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = generateRandomCode();
    const { data: existing } = await supabase
      .from('team_codes')
      .select('code')
      .eq('code', code)
      .single();

    if (!existing) break;
    attempts++;
  } while (attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique code. Please try again.');
  }

  // Save the code to Supabase
  const { error: codeError } = await supabase
    .from('team_codes')
    .insert({
      code,
      team_lead_uid: teamLeadUid,
      team_lead_email: teamLeadEmail?.toLowerCase() || '',
      active: true
    });

  if (codeError) throw codeError;

  // Update user profile to mark as Team Lead
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      is_team_lead: true,
      team_code: code
    })
    .eq('id', teamLeadUid);

  if (profileError) {
    console.error('Error updating profile:', profileError);
  }

  if (import.meta.env.DEV) {
    console.log(`✅ Team code generated for ${teamLeadUid}: ${code}`);
  }

  return code;
}

/**
 * Get the team code for a Team Lead
 * @param {string} teamLeadUid - UID of the Team Lead
 * @returns {Promise<string|null>} - The team code or null
 */
export async function getTeamLeadCode(teamLeadUid) {
  try {
    const { data, error } = await supabase
      .from('team_codes')
      .select('code')
      .eq('team_lead_uid', teamLeadUid)
      .eq('active', true)
      .single();

    if (error || !data) return null;
    return data.code;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error getting team lead code:', error);
    }
    return null;
  }
}

// =============================================================================
// CODE VALIDATION
// =============================================================================

/**
 * Validate a team code and return the Team Lead info
 * @param {string} code - The team code to validate
 * @returns {Promise<Object|null>} - { teamLeadUid, teamLeadEmail } or null
 */
export async function validateTeamCode(code) {
  if (!code || typeof code !== 'string') return null;

  const normalizedCode = code.toUpperCase().trim();
  if (normalizedCode.length !== CODE_LENGTH) return null;

  try {
    const { data, error } = await supabase
      .from('team_codes')
      .select('team_lead_uid, team_lead_email, active')
      .eq('code', normalizedCode)
      .single();

    if (error || !data) return null;
    if (!data.active) return null;

    return {
      teamLeadUid: data.team_lead_uid,
      teamLeadEmail: data.team_lead_email
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error validating team code:', error);
    }
    return null;
  }
}

// =============================================================================
// TEAM MEMBER MANAGEMENT
// =============================================================================

/**
 * Link a member to a Team Lead via code
 * @param {string} memberUid - UID of the member
 * @param {string} teamLeadUid - UID of the Team Lead
 * @param {string} teamCode - The team code used to join
 * @returns {Promise<boolean>}
 */
export async function linkMemberToTeam(memberUid, teamLeadUid, teamCode) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        team_lead_uid: teamLeadUid,
        team_code: teamCode.toUpperCase().trim(),
        is_team_lead: false
      })
      .eq('id', memberUid);

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log(`✅ Member ${memberUid} linked to Team Lead ${teamLeadUid}`);
    }
    return true;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error linking member to team:', error);
    }
    throw new Error('Failed to join team. Please try again.');
  }
}

/**
 * Get all members under a Team Lead
 * @param {string} teamLeadUid - UID of the Team Lead
 * @returns {Promise<Array>} - Array of member profiles
 */
export async function getTeamMembers(teamLeadUid) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('team_lead_uid', teamLeadUid);

    if (error) throw error;

    return (data || []).map(profile => ({
      uid: profile.id,
      ...profile
    }));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error getting team members:', error);
    }
    return [];
  }
}

/**
 * Get scouting data submitted by all team members
 * @param {string} teamLeadUid - UID of the Team Lead
 * @returns {Promise<Array>} - Array of scouting entries
 */
export async function getTeamScoutingData(teamLeadUid) {
  try {
    const { data, error } = await supabase
      .from('scouting')
      .select('*')
      .eq('team_lead_uid', teamLeadUid);

    if (error) throw error;

    return (data || []).map(entry => ({
      id: entry.id,
      ...entry
    }));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error getting team scouting data:', error);
    }
    return [];
  }
}

// =============================================================================
// CODE MANAGEMENT
// =============================================================================

/**
 * Regenerate a team code (deactivates old one, creates new one)
 * @param {string} teamLeadUid - UID of the Team Lead
 * @param {string} teamLeadEmail - Email of the Team Lead
 * @returns {Promise<string>} - The new team code
 */
export async function regenerateTeamCode(teamLeadUid, teamLeadEmail) {
  // Find and deactivate old code
  const oldCode = await getTeamLeadCode(teamLeadUid);
  if (oldCode) {
    await supabase
      .from('team_codes')
      .update({ active: false, deactivated_at: new Date().toISOString() })
      .eq('code', oldCode);
  }

  // Generate new code
  let code;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = generateRandomCode();
    const { data: existing } = await supabase
      .from('team_codes')
      .select('code')
      .eq('code', code)
      .single();

    if (!existing) break;
    attempts++;
  } while (attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique code. Please try again.');
  }

  // Save new code
  const { error: codeError } = await supabase
    .from('team_codes')
    .insert({
      code,
      team_lead_uid: teamLeadUid,
      team_lead_email: teamLeadEmail?.toLowerCase() || '',
      active: true
    });

  if (codeError) throw codeError;

  // Update user profile with new code
  await supabase
    .from('profiles')
    .update({ team_code: code })
    .eq('id', teamLeadUid);

  if (import.meta.env.DEV) {
    console.log(`✅ Team code regenerated for ${teamLeadUid}: ${code}`);
  }

  return code;
}

/**
 * Deactivate a team code (doesn't delete, just marks inactive)
 * @param {string} code - The team code to deactivate
 * @returns {Promise<boolean>}
 */
export async function deactivateTeamCode(code) {
  try {
    const { error } = await supabase
      .from('team_codes')
      .update({ active: false, deactivated_at: new Date().toISOString() })
      .eq('code', code.toUpperCase().trim());

    if (error) throw error;
    return true;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error deactivating team code:', error);
    }
    throw new Error('Failed to deactivate code.');
  }
}

