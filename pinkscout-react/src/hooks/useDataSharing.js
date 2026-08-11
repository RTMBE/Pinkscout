/**
 * Secure sharing gate.
 *
 * PinkScout no longer merges raw scouting rows from other teams based on a
 * client-editable profile flag. Cross-team sharing must be implemented through
 * a server-authorized, sanitized aggregate endpoint with explicit consent,
 * expiry, and revocation. Until that endpoint exists, callers stay scoped to
 * their own team.
 */

export function useDataSharing() {
  return { useAllEventData: false, loading: false };
}

export default useDataSharing;
