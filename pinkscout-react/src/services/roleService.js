/**
 * Team authorization context.
 *
 * This module intentionally does not inspect mutable profile fields or client
 * metadata to decide access. `get_my_team` is a narrowly scoped database RPC
 * backed by `teams` and `team_memberships`; Postgres RLS remains authoritative
 * even if a caller tampers with this returned UI context.
 */

import { supabase } from './supabase';

export const ROLES = Object.freeze({
  SCOUT: 'scout',
  SCOUT_LEAD: 'scoutLead',
  MASTER_ADMIN: 'masterAdmin'
});

export const MASTER_ADMIN_EMAIL = null;

function emptyContext(user = null) {
  return {
    role: null,
    membershipRole: null,
    activeTeamId: null,
    teamNumber: null,
    teamVerified: false,
    // Legacy aliases retained only for old UI data filtering during rollout.
    // They are never used as an authorization source by the database.
    scoutingId: null,
    teamLeadUid: null,
    teamCode: null,
    userUid: user?.id || null,
    isMasterAdmin: false,
    canViewAll: false,
    isTeamLead: false
  };
}

/**
 * UI-only convenience. Authorization must use RLS / the RPC result instead.
 */
export function isMasterAdmin(user) {
  return Boolean(user?.app_metadata?.pinkscout_platform_admin === true);
}

/**
 * Fetch the caller's active team and membership from the server.
 */
export async function getRoleContext(user) {
  if (!user) return emptyContext();

  const { data, error } = await supabase.rpc('get_my_team');
  if (error) {
    if (import.meta.env.DEV) {
      console.error('Unable to load secure team context:', error);
    }
    // Secure by default: a missing migration/RPC grants no team capabilities.
    return emptyContext(user);
  }

  const membershipRole = data?.role || null;
  const platformAdmin = data?.is_platform_admin === true;
  // Platform operations do not grant browser access to team records. Team
  // management UI follows the caller's actual membership role only.
  const isTeamLead = membershipRole === 'owner' || membershipRole === 'admin';

  return {
    role: platformAdmin
      ? ROLES.MASTER_ADMIN
      : (isTeamLead ? ROLES.SCOUT_LEAD : (membershipRole ? ROLES.SCOUT : null)),
    membershipRole,
    activeTeamId: data?.team_id || null,
    teamNumber: data?.team_number || null,
    teamVerified: data?.team_verified === true,
    scoutingId: null,
    teamLeadUid: null,
    teamCode: null,
    userUid: user.id,
    isMasterAdmin: platformAdmin,
    canViewAll: Boolean(data?.team_id),
    isTeamLead
  };
}

/**
 * Compatibility accessors. They expose only the current caller's secure
 * context; looking up arbitrary users is deliberately unsupported.
 */
export async function getUserRole() {
  const { data: { user } } = await supabase.auth.getUser();
  return (await getRoleContext(user)).role || ROLES.SCOUT;
}

export async function getUserScoutingId() {
  return null;
}

export async function setUserRole() {
  throw new Error('Roles are managed through secure team membership controls.');
}

export async function setUserScoutingId() {
  throw new Error('Scouting IDs are no longer used for authorization.');
}

export async function getUsersByScoutingId() {
  return [];
}

export function canAccessScoutingId() {
  return false;
}

export function validateRoleTransition() {
  return false;
}
