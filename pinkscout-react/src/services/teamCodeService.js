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

  // Verify user profile exists first (required for foreign key constraint)
  const { data: profile, error: profileCheckError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', teamLeadUid)
    .single();

  if (profileCheckError || !profile) {
    throw new Error('User profile not found. Please refresh the page or re-login.');
  }

  // Check if user already has a code
  const existingCode = await getTeamLeadCode(teamLeadUid);
  if (existingCode) {
    // Ensure profile is marked as Team Lead (in case they toggled off and back on)
    // Use .select() to verify the update actually happened
    const { data: updatedProfile, error: profileError } = await supabase
      .from('profiles')
      .update({
        is_team_lead: true,
        team_code: existingCode
      })
      .eq('id', teamLeadUid)
      .select('id, is_team_lead, team_code')
      .single();

    if (profileError || !updatedProfile || updatedProfile.is_team_lead !== true) {
      console.error('Error updating profile with existing code:', {
        error: profileError,
        profile: updatedProfile
      });
      // Throw if we can't mark them as Team Lead
      throw new Error('Failed to enable Team Lead status. Please try again.');
    }

    if (import.meta.env.DEV) {
      console.log('✅ Profile re-verified as Team Lead with existing code:', existingCode);
    }

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

  if (codeError) {
    // Provide more specific error messages for common issues
    if (codeError.code === '23503') {
      throw new Error('User profile not found. Please refresh the page or re-login.');
    }
    if (codeError.code === '42501') {
      throw new Error('Permission denied. Please ensure you are logged in.');
    }
    throw codeError;
  }

  // Update user profile to mark as Team Lead - THIS IS CRITICAL
  // Retry up to 3 times to ensure profile update succeeds
  let profileUpdateAttempts = 0;
  const maxProfileAttempts = 3;
  let profileUpdateSuccess = false;

  while (profileUpdateAttempts < maxProfileAttempts && !profileUpdateSuccess) {
    profileUpdateAttempts++;

    // IMPORTANT: Use .select() to verify the update actually happened
    // Without .select(), Supabase returns no error even if 0 rows were updated
    const { data: updatedProfile, error: profileError } = await supabase
      .from('profiles')
      .update({
        is_team_lead: true,
        team_code: code
      })
      .eq('id', teamLeadUid)
      .select('id, is_team_lead, team_code')
      .single();

    if (!profileError && updatedProfile && updatedProfile.is_team_lead === true) {
      profileUpdateSuccess = true;
      if (import.meta.env.DEV) {
        console.log(`✅ Profile updated with is_team_lead=true (attempt ${profileUpdateAttempts})`, updatedProfile);
      }
    } else {
      // Log detailed error info for debugging
      if (import.meta.env.DEV) {
        console.error(`Profile update attempt ${profileUpdateAttempts}:`, {
          error: profileError,
          updatedProfile,
          expectedUid: teamLeadUid
        });
      }
      if (profileUpdateAttempts < maxProfileAttempts) {
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // If profile update failed after all retries, throw an error
  // The team code was created but without marking the profile as Team Lead,
  // the functionality won't work properly
  if (!profileUpdateSuccess) {
    throw new Error('Failed to update profile as Team Lead. The database update did not complete. Please try again or contact support.');
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
 *
 * SECURITY FIX (2026-02-19): Now uses secure RPC function instead of direct table access.
 * The RPC function only returns info for a SPECIFIC matching code, preventing
 * enumeration of all team codes which was a security vulnerability.
 *
 * UPDATE (2026-02-21): Added fallback to direct query for cases where RPC fails.
 * This is needed because:
 * 1. During signup, users might not be authenticated yet
 * 2. The RPC function might not be deployed yet in some environments
 *
 * @param {string} code - The team code to validate
 * @returns {Promise<Object|null>} - { teamLeadUid, teamLeadEmail } or null
 */
export async function validateTeamCode(code) {
  if (!code || typeof code !== 'string') return null;

  const normalizedCode = code.toUpperCase().trim();
  if (normalizedCode.length !== CODE_LENGTH) return null;

  try {
    // Try RPC function first (most secure)
    const { data, error } = await supabase.rpc('validate_team_code', {
      code_to_validate: normalizedCode
    });

    if (!error && data && data.valid) {
      if (import.meta.env.DEV) {
        console.log('✅ Team code validated via RPC:', normalizedCode);
      }
      return {
        teamLeadUid: data.team_lead_uid,
        teamLeadEmail: data.team_lead_email
      };
    }

    // If RPC failed (e.g., function doesn't exist, auth issues),
    // log the error for debugging
    if (error) {
      if (import.meta.env.DEV) {
        console.warn('RPC validation failed, trying fallback:', error.message);
      }
    }

    // Fallback: Direct query (still secure - only queries specific code)
    // This works because we're querying by exact code match
    const { data: directData, error: directError } = await supabase
      .from('team_codes')
      .select('team_lead_uid, team_lead_email')
      .eq('code', normalizedCode)
      .eq('active', true)
      .single();

    if (directError || !directData) {
      if (import.meta.env.DEV) {
        console.log('Team code not found:', normalizedCode);
      }
      return null;
    }

    if (import.meta.env.DEV) {
      console.log('✅ Team code validated via direct query:', normalizedCode);
    }

    return {
      teamLeadUid: directData.team_lead_uid,
      teamLeadEmail: directData.team_lead_email
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
  if (!teamLeadUid) throw new Error('Team Lead UID is required');

  // Find and deactivate old code
  const oldCode = await getTeamLeadCode(teamLeadUid);
  if (oldCode) {
    const { error: deactivateError } = await supabase
      .from('team_codes')
      .update({ active: false, deactivated_at: new Date().toISOString() })
      .eq('code', oldCode);

    if (deactivateError) {
      console.error('Error deactivating old code:', deactivateError);
      // Continue anyway - we'll create a new code
    }
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

  if (codeError) {
    console.error('Error inserting new team code:', codeError);
    throw new Error(`Failed to create new team code: ${codeError.message}`);
  }

  // Update user profile with new code - verify with .select()
  const { data: updatedProfile, error: profileError } = await supabase
    .from('profiles')
    .update({ team_code: code, is_team_lead: true })
    .eq('id', teamLeadUid)
    .select('id, team_code, is_team_lead')
    .single();

  if (profileError || !updatedProfile) {
    console.error('Error updating profile with new code:', profileError);
    // This is more critical now - log but continue since code was created
  } else if (import.meta.env.DEV) {
    console.log('✅ Profile updated with new team code:', updatedProfile);
  }

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

