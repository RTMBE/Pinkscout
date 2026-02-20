-- =============================================================================
-- SECURITY FIX: Team Codes Information Disclosure Vulnerability
-- =============================================================================
-- Date: 2026-02-19
-- Severity: MEDIUM
-- Issue: The "Anyone can validate team codes" policy allowed ANY user (even
--        unauthenticated) to see ALL active team codes, including codes
--        belonging to other users.
-- Fix: Remove the permissive policy and add a secure RPC function.
-- =============================================================================

-- STEP 1: Drop the vulnerable policy
DROP POLICY IF EXISTS "Anyone can validate team codes" ON team_codes;

-- STEP 2: Create secure RPC function for team code validation
-- This function only returns info for a SPECIFIC matching code, preventing
-- enumeration of all codes.
CREATE OR REPLACE FUNCTION validate_team_code(code_to_validate TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Authentication required');
  END IF;

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

-- STEP 3: Grant execute permission on the function
GRANT EXECUTE ON FUNCTION validate_team_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_team_code(TEXT) TO anon;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running this script, verify the fix by testing:
-- 1. As an authenticated user, try: SELECT * FROM team_codes;
--    Result: Should only see your own codes (if you're a team lead)
-- 2. Try the RPC function: SELECT validate_team_code('INVALID');
--    Result: Should return { valid: false, error: "Invalid or expired code" }
-- 3. Try with a valid code: SELECT validate_team_code('YOURCODE');
--    Result: Should return { valid: true, team_lead_uid: ..., team_lead_email: ... }
-- =============================================================================

