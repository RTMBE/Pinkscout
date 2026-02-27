-- =============================================================================
-- FIX: Allow team members to view their Team Lead's profile
-- =============================================================================
-- Problem: Team members cannot save scouting data because the validation
-- requires fetching the Team Lead's profile (foreign key constraint check).
-- The RLS policy only allows Team Leads to view team members, not vice versa.
--
-- Solution: Add a policy allowing team members to view their Team Lead's profile.
-- =============================================================================

-- Step 1: Add policy for team members to view their Team Lead's profile
CREATE POLICY "Team members can view team lead profile" ON profiles
  FOR SELECT USING (
    -- Allow if this profile belongs to the current user's Team Lead
    id IN (
      SELECT team_lead_uid 
      FROM profiles 
      WHERE id = auth.uid() AND team_lead_uid IS NOT NULL
    )
  );

-- Note: This policy is additive - it doesn't replace existing policies.
-- With this policy, users can now:
-- 1. View their own profile (existing policy)
-- 2. View their Team Lead's profile (new policy)
-- 3. Team Leads can view their team members (existing policy)
-- 4. Master admin can view all (existing policy)

