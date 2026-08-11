/**
 * Secure-sharing migration boundary.
 *
 * The legacy implementation granted access by looking up profiles by email and
 * directly changing client-controlled sharing rows. That can expose private
 * scouting records and cannot be made safe with UI checks. Cross-team sharing
 * is paused until it is backed by a server-authorized, read-only aggregate
 * endpoint with explicit team consent, expiry, revocation, and audit logging.
 */

export const PERMISSION_LEVELS = Object.freeze({
  viewer: {
    label: 'Read-only (planned)',
    description: 'Secure aggregate sharing is not yet enabled',
    icon: '🔒'
  }
});

const DISABLED_MESSAGE = 'Secure cross-team sharing is not enabled yet.';

export async function sendSharingInvite() {
  return { success: false, error: DISABLED_MESSAGE };
}

export async function getOutgoingInvites() {
  return [];
}

export async function getIncomingInvites() {
  return [];
}

export async function acceptInvite() {
  return { success: false, error: DISABLED_MESSAGE };
}

export async function rejectInvite() {
  return { success: false, error: DISABLED_MESSAGE };
}

export async function revokeAccess() {
  return { success: false, error: DISABLED_MESSAGE };
}

export async function updatePermissionLevel() {
  return { success: false, error: DISABLED_MESSAGE };
}

export async function getTeamsSharingWithMe() {
  return [];
}

export async function getTeamsImSharingWith() {
  return [];
}
