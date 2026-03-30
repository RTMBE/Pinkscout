-- =============================================================================
-- MIGRATION: Add Data Sharing Setting for Team Leads
-- Date: 2026-03-30
-- Description: Adds a toggle for team leads to choose between:
--   - "Use all available data" (default ON) - See data from all teams at same event
--   - "My team only" - Only see data from their own team members
-- =============================================================================

-- Add use_all_event_data column to profiles table
-- Default is TRUE (use everyone's data at the event)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS use_all_event_data BOOLEAN DEFAULT TRUE;

-- Update existing Team Leads to have the default value explicitly set
UPDATE profiles SET use_all_event_data = TRUE WHERE is_team_lead = TRUE AND use_all_event_data IS NULL;

-- =============================================================================
-- VERIFICATION: Run this query to verify the migration worked
-- =============================================================================
-- SELECT id, display_name, is_team_lead, use_all_event_data FROM profiles WHERE is_team_lead = TRUE;

