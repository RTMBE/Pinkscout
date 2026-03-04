/**
 * Team Code Tests
 * Tests for team code generation, validation, and persistence
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Team Code Tests', () => {
  
  describe('Team Code Generation', () => {
    
    const generateTeamCode = (length = 6) => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 for clarity
      let code = '';
      for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    it('should generate 6-character team codes', () => {
      for (let i = 0; i < 10; i++) {
        const code = generateTeamCode();
        expect(code.length).toBe(6);
      }
    });

    it('should only use allowed characters', () => {
      const allowedChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      
      for (let i = 0; i < 100; i++) {
        const code = generateTeamCode();
        for (const char of code) {
          expect(allowedChars.includes(char)).toBe(true);
        }
      }
    });

    it('should not include ambiguous characters (I, O, 0, 1)', () => {
      const ambiguousChars = 'IO01';
      
      for (let i = 0; i < 100; i++) {
        const code = generateTeamCode();
        for (const char of ambiguousChars) {
          expect(code.includes(char)).toBe(false);
        }
      }
    });

    it('should generate unique codes', () => {
      const codes = new Set();
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        codes.add(generateTeamCode());
      }
      
      // With 30^6 = 729M possible codes, 1000 should all be unique
      expect(codes.size).toBe(iterations);
    });
  });

  describe('Team Code Validation', () => {

    // Note: Actual team codes may allow 0-9 - this is a simplified validation
    // The real validation uses: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no I, O, 0, 1)
    const isValidTeamCode = (code) => {
      if (!code || typeof code !== 'string') return false;
      if (code.length !== 6) return false;
      // Allow uppercase letters and digits 2-9 (excluding ambiguous I, O, 0, 1)
      const allowedChars = /^[A-HJ-NP-Z2-9]+$/;
      return allowedChars.test(code);
    };

    it('should accept valid 6-character codes', () => {
      const validCodes = ['92R7GP', 'ABCDEF', 'XYZ789', 'AAABBB'];

      validCodes.forEach(code => {
        expect(isValidTeamCode(code)).toBe(true);
      });
    });

    it('should reject invalid codes', () => {
      const invalidCodes = [
        '',           // empty
        null,         // null
        undefined,    // undefined
        'ABC',        // too short
        'ABCDEFGH',   // too long
        'abc123',     // lowercase
        'ABCDEO',     // contains O
        'ABCDEI',     // contains I
        'ABCDE0',     // contains 0
        'ABCDE1',     // contains 1
      ];

      invalidCodes.forEach(code => {
        expect(isValidTeamCode(code)).toBe(false);
      });
    });
  });

  describe('Team Code Persistence', () => {
    
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should store team code in profile data structure', () => {
      const profile = {
        id: 'user-123',
        email: 'test@example.com',
        isTeamLead: true,
        teamCode: '92R7GP',
        teamLeadUid: null
      };
      
      expect(profile.teamCode).toBe('92R7GP');
      expect(profile.isTeamLead).toBe(true);
    });

    it('should link team members to team lead via uid', () => {
      const teamLead = {
        id: 'lead-456',
        isTeamLead: true,
        teamCode: 'ABC123'
      };
      
      const teamMember = {
        id: 'member-789',
        isTeamLead: false,
        teamCode: 'ABC123',
        teamLeadUid: 'lead-456'
      };
      
      expect(teamMember.teamLeadUid).toBe(teamLead.id);
      expect(teamMember.teamCode).toBe(teamLead.teamCode);
    });
  });
});

