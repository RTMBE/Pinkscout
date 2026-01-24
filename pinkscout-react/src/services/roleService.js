/**
 * =============================================================================
 * ROLESERVICE.JS - Role-Based Access Control & Scouting ID Management
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * Manages user roles and scouting ID (team isolation) for multi-team use.
 *
 * ROLES:
 * - scout: Default role. Can submit data, only view own scouting group's data.
 * - scoutLead: Can view all data submitted by users with same scoutingId.
 * - masterAdmin: Rtmbe20@gmail.com. Unrestricted read access to all data.
 *
 * SCOUTING ID:
 * - Each user has a scoutingId (typically team number).
 * - All scouting data is tagged with the submitter's scoutingId.
 * - Data visibility is strictly scoped by scoutingId.
 *
 * SUPABASE TABLES:
 * - profiles: includes { role, scouting_id }
 *
 * =============================================================================
 */

import { supabase } from './supabase';

// =============================================================================
// CONSTANTS
// =============================================================================

// Master admin email - always has full access (case-insensitive)
export const MASTER_ADMIN_EMAIL = 'rtmbe20@gmail.com';

// Role hierarchy
export const ROLES = {
  SCOUT: 'scout',
  SCOUT_LEAD: 'scoutLead',
  MASTER_ADMIN: 'masterAdmin'
};

// Role permissions (read access scope)
export const ROLE_PERMISSIONS = {
  [ROLES.SCOUT]: 'ownGroup',      // Can only read own scouting group's data
  [ROLES.SCOUT_LEAD]: 'scoutingId', // Can read all data with same scoutingId
  [ROLES.MASTER_ADMIN]: 'all'     // Can read all data from all scouting IDs
};

// =============================================================================
// ROLE CHECKING FUNCTIONS
// =============================================================================

/**
 * Check if a user is the master admin
 * @param {Object} user - Supabase auth user object
 * @returns {boolean}
 */
export function isMasterAdmin(user) {
  if (!user?.email) return false;
  return user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
}

/**
 * Get user's role from their profile
 * @param {string} uid - User UID
 * @returns {Promise<string>} - User's role
 */
export async function getUserRole(uid) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email, role')
      .eq('id', uid)
      .single();

    if (error || !data) return ROLES.SCOUT;

    // Master admin check by email takes precedence
    if (data.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
      return ROLES.MASTER_ADMIN;
    }
    return data.role || ROLES.SCOUT;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error getting user role:', error);
    }
    return ROLES.SCOUT;
  }
}

/**
 * Get user's scoutingId (team/organization identifier)
 * @param {string} uid - User UID
 * @returns {Promise<string|null>}
 */
export async function getUserScoutingId(uid) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('scouting_id')
      .eq('id', uid)
      .single();

    if (error || !data) return null;
    return data.scouting_id || null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error getting user scoutingId:', error);
    }
    return null;
  }
}

/**
 * Get complete role context for a user
 * @param {Object} user - Supabase auth user
 * @returns {Promise<Object>} - Role context object with all access control info
 *
 * ROLE CONTEXT FIELDS:
 * - role: string - The user's role (scout, scoutLead, masterAdmin)
 * - scoutingId: string|null - Legacy team isolation ID
 * - userUid: string - User's Supabase UID
 * - isMasterAdmin: boolean - True if master admin (rtmbe20@gmail.com)
 * - canViewAll: boolean - True if can view all data in their scope
 * - isTeamLead: boolean - True if user is a Team Lead
 * - teamLeadUid: string|null - UID of the Team Lead (for members)
 * - teamCode: string|null - The team's invite code
 */
export async function getRoleContext(user) {
  if (!user) {
    return {
      role: null,
      scoutingId: null,
      userUid: null,
      isMasterAdmin: false,
      canViewAll: false,
      isTeamLead: false,
      teamLeadUid: null,
      teamCode: null
    };
  }

  const masterAdmin = isMasterAdmin(user);
  if (masterAdmin) {
    return {
      role: ROLES.MASTER_ADMIN,
      scoutingId: null, // Master admin sees all
      userUid: user.id,
      isMasterAdmin: true,
      canViewAll: true,
      isTeamLead: true, // Master admin has Team Lead privileges
      teamLeadUid: user.id,
      teamCode: null
    };
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!error && data) {
      const role = data.role || ROLES.SCOUT;
      const isTeamLead = data.is_team_lead === true;

      return {
        role,
        scoutingId: data.scouting_id || null,
        userUid: user.id,
        isMasterAdmin: false,
        // Team Lead or Scout Lead can view all data in their scope
        canViewAll: isTeamLead || role === ROLES.SCOUT_LEAD,
        isTeamLead,
        // If Team Lead, teamLeadUid is their own UID
        // If member, teamLeadUid is their Team Lead's UID
        teamLeadUid: isTeamLead ? user.id : (data.team_lead_uid || null),
        teamCode: data.team_code || null
      };
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error getting role context:', error);
    }
  }

  return {
    role: ROLES.SCOUT,
    scoutingId: null,
    userUid: user.id,
    isMasterAdmin: false,
    canViewAll: false,
    isTeamLead: false,
    teamLeadUid: null,
    teamCode: null
  };
}

// =============================================================================
// ROLE & SCOUTING ID MANAGEMENT
// =============================================================================

/**
 * Set a user's role (admin only)
 * @param {string} uid - Target user UID
 * @param {string} role - New role to assign
 * @returns {Promise<boolean>}
 */
export async function setUserRole(uid, role) {
  if (!Object.values(ROLES).includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', uid);

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log(`✅ Set role for ${uid} to ${role}`);
    }
    return true;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error setting user role:', error);
    }
    throw new Error('Failed to update user role.');
  }
}

/**
 * Set a user's scoutingId (team isolation identifier)
 * @param {string} uid - Target user UID
 * @param {string} scoutingId - Scouting ID (typically team number as string)
 * @returns {Promise<boolean>}
 */
export async function setUserScoutingId(uid, scoutingId) {
  if (!scoutingId || typeof scoutingId !== 'string') {
    throw new Error('Invalid scoutingId');
  }

  const normalizedId = scoutingId.trim().toLowerCase();
  if (normalizedId.length === 0 || normalizedId.length > 50) {
    throw new Error('Scouting ID must be 1-50 characters');
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ scouting_id: normalizedId })
      .eq('id', uid);

    if (error) throw error;

    if (import.meta.env.DEV) {
      console.log(`✅ Set scoutingId for ${uid} to ${normalizedId}`);
    }
    return true;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error setting scoutingId:', error);
    }
    throw new Error('Failed to update scouting ID.');
  }
}

/**
 * Get all users in a scouting group
 * @param {string} scoutingId - The scouting ID to query
 * @returns {Promise<Array>}
 */
export async function getUsersByScoutingId(scoutingId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('scouting_id', scoutingId.toLowerCase());

    if (error) throw error;

    return (data || []).map(profile => ({
      uid: profile.id,
      ...profile
    }));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error getting users by scoutingId:', error);
    }
    return [];
  }
}

/**
 * Check if user can access data with a given scoutingId
 * @param {Object} roleContext - From getRoleContext()
 * @param {string} targetScoutingId - The scoutingId of the data
 * @returns {boolean}
 */
export function canAccessScoutingId(roleContext, targetScoutingId) {
  // Master admin can access everything
  if (roleContext.isMasterAdmin) return true;

  // No scoutingId on user = can't access any scoped data
  if (!roleContext.scoutingId) return false;

  // Scout lead and scout can access their own scoutingId
  return roleContext.scoutingId === targetScoutingId?.toLowerCase();
}

/**
 * Validate role transition (prevent privilege escalation)
 * @param {string} currentRole - User's current role
 * @param {string} newRole - Desired new role
 * @param {boolean} isMasterAdmin - Is the requester the master admin?
 * @returns {boolean}
 */
export function canAssignRole(currentRole, newRole, isMasterAdmin) {
  // Only master admin can assign masterAdmin role
  if (newRole === ROLES.MASTER_ADMIN) return false;

  // Master admin can assign any other role
  if (isMasterAdmin) return true;

  // Scout leads can promote scouts to scout lead (within their group)
  if (currentRole === ROLES.SCOUT_LEAD && newRole === ROLES.SCOUT) return true;

  return false;
}

