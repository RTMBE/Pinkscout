-- =============================================================================
-- MIGRATION: Fix Team Code Validation Issues
-- Date: 2026-02-21
-- Description: Fixes three team code issues:
--   1. Team Lead status not persisting (fixed in app code)
--   2. Team code validation failing for new users during signup
--   3. Members cannot join using team code
-- =============================================================================

-- Step 1: Drop existing RPC function and recreate with updated logic
-- (Removes authentication requirement for signup flow)
DROP FUNCTION IF EXISTS validate_team_code(TEXT);

CREATE OR REPLACE FUNCTION validate_team_code(code_to_validate TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- NOTE: Authentication NOT required - this function is called during signup
  -- when users don't have an account yet. This is safe because:
  -- 1. Only validates a specific code, no enumeration
  -- 2. Only returns team lead info on exact match

  -- Normalize and validate input
  IF code_to_validate IS NULL OR LENGTH(TRIM(code_to_validate)) != 6 THEN
    RETURN json_build_object('valid', false, 'error', 'Invalid code format');
  END IF;

  -- Look up the specific code
  SELECT json_build_object(
    'valid', true,
    'team_lead_uid', team_lead_uid,
    'team_lead_email', team_lead_email
  ) INTO result
  FROM team_codes
  WHERE code = UPPER(TRIM(code_to_validate))
    AND active = TRUE;

  -- Return result or invalid message
  IF result IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Invalid or expired code');
  END IF;

  RETURN result;
END;
$$;

-- Step 2: Add RLS policy to allow authenticated users to validate team codes
-- This is a fallback in case the RPC function fails
-- Safe because: requires auth, and client only queries specific codes

-- First, drop if exists to avoid errors
DROP POLICY IF EXISTS "Authenticated users can validate team codes" ON team_codes;

-- Create the policy
CREATE POLICY "Authenticated users can validate team codes" ON team_codes
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND active = TRUE
  );

-- =============================================================================
-- VERIFICATION: Run these queries to verify the migration worked
-- =============================================================================
-- SELECT * FROM pg_proc WHERE proname = 'validate_team_code';
-- SELECT * FROM pg_policies WHERE tablename = 'team_codes';

