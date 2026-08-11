/**
 * Secure opaque team-invite contract tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../services/supabase', () => ({
  supabase: { rpc }
}));

import { isInviteToken, redeemTeamInvite } from '../services/teamCodeService';

const VALID_TOKEN = 'a'.repeat(64);
const GENERIC_REDEEM_FAILURE = 'Invite could not be redeemed. Check the token and try again.';

describe('secure team invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isInviteToken', () => {
    it('accepts a 256-bit hexadecimal token after trimming whitespace', () => {
      expect(isInviteToken(VALID_TOKEN)).toBe(true);
      expect(isInviteToken(`  ${VALID_TOKEN.toUpperCase()}  `)).toBe(true);
    });

    it('rejects legacy team codes and malformed values', () => {
      [
        '',
        'ABC123',
        'a'.repeat(63),
        'a'.repeat(65),
        'g'.repeat(64),
        null,
        undefined,
        42
      ].forEach((candidate) => {
        expect(isInviteToken(candidate)).toBe(false);
      });
    });
  });

  describe('redeemTeamInvite', () => {
    it('does not call the RPC for a malformed or legacy invite value', async () => {
      await expect(redeemTeamInvite('ABC123')).rejects.toThrow(GENERIC_REDEEM_FAILURE);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('normalizes a valid token before redeeming it through the RPC', async () => {
      const membership = { team_id: 'team-123', role: 'scout' };
      rpc.mockResolvedValue({ data: membership, error: null });

      await expect(redeemTeamInvite(` ${VALID_TOKEN.toUpperCase()} `)).resolves.toEqual(membership);
      expect(rpc).toHaveBeenCalledWith('redeem_team_invite', { p_token: VALID_TOKEN });
    });

    it('returns a generic failure even if the RPC contains sensitive detail', async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { message: 'Invite belongs to team 254 and expired yesterday.' }
      });

      const error = await redeemTeamInvite(VALID_TOKEN).catch((caughtError) => caughtError);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(GENERIC_REDEEM_FAILURE);
      expect(error.message).not.toContain('254');
      expect(error.message).not.toContain('expired');
    });

    it('treats the RPC’s generic failed-redemption response as a failure', async () => {
      rpc.mockResolvedValue({ data: { ok: false }, error: null });

      await expect(redeemTeamInvite(VALID_TOKEN)).rejects.toThrow(GENERIC_REDEEM_FAILURE);
    });
  });
});
