/**
 * Secure team membership and invite API.
 *
 * Invite plaintext is generated inside the database, stored only as SHA-256,
 * returned to a team owner/admin once, and redeemed only by an authenticated
 * user. This module deliberately has no direct `profiles` or `team_codes`
 * queries and never validates an invite by exposing a lead's identity.
 */

import { supabase } from './supabase';

function throwRpcError(error, fallback) {
  if (error) {
    throw new Error(error.message || fallback);
  }
}

export function isInviteToken(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value.trim());
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function getMyTeam() {
  const { data, error } = await supabase.rpc('get_my_team');
  throwRpcError(error, 'Unable to load your team.');
  return data;
}

export async function createMyTeam(teamNumber = null) {
  const normalized = teamNumber === '' || teamNumber === undefined
    ? null
    : Number(teamNumber);
  if (normalized !== null && (!Number.isInteger(normalized) || normalized < 1 || normalized > 99999)) {
    throw new Error('Enter a valid FRC team number.');
  }

  const { data, error } = await supabase.rpc('create_my_team', {
    p_team_number: normalized
  });
  throwRpcError(error, 'Unable to create the team.');
  return data;
}

/**
 * Create a single-use invite. The token is shown only in the returned object;
 * callers must not save it in profiles, localStorage, URLs, or logs.
 */
export async function createTeamInvite(expiresInHours = 72) {
  const { data, error } = await supabase.rpc('create_team_invite', {
    p_expires_in_hours: expiresInHours
  });
  throwRpcError(error, 'Unable to create an invite.');
  if (!isInviteToken(data?.token)) {
    throw new Error('Unable to create an invite.');
  }
  return data;
}

/**
 * Redeem an opaque invitation. Failure is intentionally generic so callers
 * cannot discover whether a particular team or invite exists.
 */
export async function redeemTeamInvite(token) {
  if (!isInviteToken(token)) {
    throw new Error('Invite could not be redeemed. Check the token and try again.');
  }

  const { data, error } = await supabase.rpc('redeem_team_invite', {
    p_token: token.trim().toLowerCase()
  });
  if (error || data?.ok === false || !data?.team_id) {
    throw new Error('Invite could not be redeemed. Check the token and try again.');
  }
  return data;
}

export async function getTeamMembers() {
  const { data, error } = await supabase.rpc('list_my_team_members');
  throwRpcError(error, 'Unable to load team members.');
  return (data || []).map((member) => ({
    uid: member.user_id,
    displayName: member.display_name,
    role: member.role
  }));
}

/** List active invite metadata only; plaintext tokens are never returned again. */
export async function getTeamInvites() {
  const { data, error } = await supabase.rpc('list_my_team_invites');
  throwRpcError(error, 'Unable to load active invites.');
  return (data || []).map((invite) => ({
    id: invite.invite_id,
    role: invite.role,
    createdAt: invite.created_at,
    expiresAt: invite.expires_at,
    useCount: invite.use_count,
    maxUses: invite.max_uses
  }));
}

export async function revokeTeamInvite(inviteId) {
  if (!isUuid(inviteId)) throw new Error('Invite could not be revoked.');
  const { error } = await supabase.rpc('revoke_team_invite', { p_invite_id: inviteId });
  if (error) throw new Error('Invite could not be revoked. Verify MFA and try again.');
}

export async function revokeTeamMember(userId) {
  if (!isUuid(userId)) throw new Error('Member could not be removed.');
  const { error } = await supabase.rpc('revoke_team_member', { p_user_id: userId });
  if (error) throw new Error('Member could not be removed. Verify MFA and try again.');
}

// Compatibility names used by older callers. They keep the secure behavior,
// but cannot retrieve/revoke a previously displayed plaintext invite.
export async function generateTeamCode() {
  const invite = await createTeamInvite();
  return invite.token;
}

export async function regenerateTeamCode() {
  const invite = await createTeamInvite();
  return invite.token;
}

export async function getTeamLeadCode() {
  return null;
}

export async function validateTeamCode() {
  return null;
}

export async function linkMemberToTeam(_memberUid, _teamLeadUid, inviteToken) {
  return redeemTeamInvite(inviteToken);
}

export async function getTeamScoutingData() {
  return [];
}

export async function deactivateTeamCode() {
  throw new Error('Invite revocation is managed through secure team controls.');
}
