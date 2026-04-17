-- =============================================================================
-- CLEANUP SCRIPT: Delete scouting data for teams NOT attending Tallahassee 2026
-- =============================================================================
-- Event Key: 2026fltal (Tallahassee Regional 2026)
--
-- INSTRUCTIONS:
-- 1. First, update the team_numbers array below with the actual teams at Tallahassee
--    You can get this from: https://www.thebluealliance.com/event/2026fltal
-- 2. Run this script in Supabase SQL Editor as an admin
-- 3. This will delete scouting data for teams NOT in the Tallahassee event
-- =============================================================================

-- Step 1: Create a temporary table with Tallahassee teams
-- UPDATE THIS ARRAY with actual team numbers from TBA for 2026fltal event
CREATE TEMP TABLE tallahassee_teams (team_number INTEGER PRIMARY KEY);

-- INSERT the teams attending Tallahassee 2026
-- EXAMPLE - Replace with actual team numbers from TBA:
INSERT INTO tallahassee_teams (team_number) VALUES
-- Florida teams commonly at Tallahassee (UPDATE WITH 2026 ACTUAL DATA)
(78),    -- Team 78
(179),   -- Team 179  
(180),   -- Team 180
(233),   -- Team 233
(342),   -- Team 342
(386),   -- Team 386
(744),   -- Team 744
(1251),  -- Team 1251
(1251),  -- Team 1251
(1523),  -- Team 1523
(1551),  -- Hyperion
(1708),  -- Team 1708
(1747),  -- Team 1747
(2383),  -- Team 2383
(2451),  -- Team 2451
(3556),  -- Team 3556
(3627),  -- Team 3627
(4041),  -- Team 4041
(4087),  -- Team 4087
(4123),  -- Team 4123
(4213),  -- Team 4213
(4451),  -- Team 4451
(4935),  -- Team 4935
(5459),  -- Team 5459
(5472),  -- Team 5472
(6032),  -- Team 6032
(6528),  -- Team 6528
(7428),  -- Team 7428
(7531),  -- Team 7531
(7891),  -- Team 7891
(8033),  -- Team 8033
(8753),  -- Spectre (your team!)
(9006),  -- Team 9006
(9072),  -- Team 9072
(9225),  -- Team 9225
(9401),  -- Team 9401
(9496)   -- Team 9496
ON CONFLICT (team_number) DO NOTHING;

-- Step 2: Check what will be deleted (DRY RUN - no changes made)
SELECT 
  'PREVIEW: Scouting entries to delete' as action,
  COUNT(*) as count,
  array_agg(DISTINCT team_number ORDER BY team_number) as teams
FROM scouting
WHERE event_key = '2026fltal'
  AND team_number NOT IN (SELECT team_number FROM tallahassee_teams);

-- Step 3: Check what will be kept
SELECT 
  'PREVIEW: Scouting entries to KEEP' as action,
  COUNT(*) as count,
  array_agg(DISTINCT team_number ORDER BY team_number) as teams
FROM scouting
WHERE event_key = '2026fltal'
  AND team_number IN (SELECT team_number FROM tallahassee_teams);

-- =============================================================================
-- STEP 4: ACTUAL DELETION (UNCOMMENT TO EXECUTE)
-- =============================================================================
-- WARNING: This will permanently delete data. Make sure preview looks correct!

-- DELETE scouting data for non-Tallahassee teams
/*
DELETE FROM scouting
WHERE event_key = '2026fltal'
  AND team_number NOT IN (SELECT team_number FROM tallahassee_teams);
*/

-- DELETE adjusted EPA data for non-Tallahassee teams  
/*
DELETE FROM adjusted_epa
WHERE event_key = '2026fltal'
  AND team_number NOT IN (SELECT team_number FROM tallahassee_teams);
*/

-- DELETE pit scouting data for non-Tallahassee teams
/*
DELETE FROM pit_scouting
WHERE event_key = '2026fltal'
  AND team_number NOT IN (SELECT team_number FROM tallahassee_teams);
*/

-- =============================================================================
-- VERIFICATION: Run after deletion to confirm
-- =============================================================================
/*
SELECT 
  'AFTER DELETE: Remaining entries' as status,
  COUNT(*) as count,
  array_agg(DISTINCT team_number ORDER BY team_number) as remaining_teams
FROM scouting
WHERE event_key = '2026fltal';
*/

-- Clean up temp table
DROP TABLE IF EXISTS tallahassee_teams;
