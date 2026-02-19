-- =============================================================================
-- PINKSCOUT SUPABASE SCHEMA
-- =============================================================================
-- Run this in Supabase SQL Editor to create all tables
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- PROFILES TABLE (replaces Firestore users/{uid})
-- =============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT DEFAULT 'scout' CHECK (role IN ('scout', 'scoutLead', 'masterAdmin')),
  team_number INTEGER,
  scouting_id TEXT,
  is_team_lead BOOLEAN DEFAULT FALSE,
  team_lead_uid UUID REFERENCES profiles(id),
  team_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TEAM_CODES TABLE (replaces Firestore teamCodes/{code})
-- =============================================================================
CREATE TABLE IF NOT EXISTS team_codes (
  code TEXT PRIMARY KEY,
  team_lead_uid UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_lead_email TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ
);

-- =============================================================================
-- SCOUTING TABLE (replaces Firestore scouting/{docId})
-- =============================================================================
CREATE TABLE IF NOT EXISTS scouting (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  event_key TEXT NOT NULL,
  event_year INTEGER,
  scouter_name TEXT,
  scouter_uid UUID NOT NULL REFERENCES profiles(id),
  scouting_id TEXT,
  team_lead_uid UUID REFERENCES profiles(id),
  alliance_color TEXT CHECK (alliance_color IN ('red', 'blue')),
  -- Match Info
  starting_position TEXT CHECK (starting_position IN ('left', 'center', 'right')),
  -- 2026 REBUILT game fields - Auto Period
  auto_fuel_scored INTEGER DEFAULT 0,
  auto_shots_attempted INTEGER DEFAULT 0,
  auto_cycles_completed INTEGER DEFAULT 0,
  auto_tower_climb TEXT,
  -- 2026 REBUILT game fields - Teleop Period
  teleop_fuel_active INTEGER DEFAULT 0,
  teleop_fuel_inactive INTEGER DEFAULT 0,
  teleop_balls_cycled INTEGER DEFAULT 0,
  -- Legacy field (keep for backward compatibility)
  teleop_cycle_count INTEGER DEFAULT 0,
  -- 2026 REBUILT game fields - Endgame
  endgame_tower_level TEXT,
  endgame_fuel_scored INTEGER DEFAULT 0,
  -- Performance metrics
  defense_rating INTEGER DEFAULT 0,
  hub_control_first BOOLEAN DEFAULT FALSE,
  robot_role TEXT CHECK (robot_role IN ('shooter', 'cycler', 'defense')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- MIGRATION: Add missing columns to existing scouting table
-- Run this if the table already exists
-- =============================================================================
ALTER TABLE scouting ADD COLUMN IF NOT EXISTS starting_position TEXT CHECK (starting_position IN ('left', 'center', 'right'));
ALTER TABLE scouting ADD COLUMN IF NOT EXISTS auto_shots_attempted INTEGER DEFAULT 0;
ALTER TABLE scouting ADD COLUMN IF NOT EXISTS auto_cycles_completed INTEGER DEFAULT 0;
ALTER TABLE scouting ADD COLUMN IF NOT EXISTS teleop_balls_cycled INTEGER DEFAULT 0;
ALTER TABLE scouting ADD COLUMN IF NOT EXISTS endgame_fuel_scored INTEGER DEFAULT 0;
ALTER TABLE scouting ADD COLUMN IF NOT EXISTS robot_role TEXT CHECK (robot_role IN ('shooter', 'cycler', 'defense'));

-- =============================================================================
-- QUESTIONS TABLE (replaces Firestore questions/{docId})
-- =============================================================================
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text TEXT NOT NULL,
  category TEXT,
  type TEXT,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ADMINS TABLE (replaces Firestore settings/admins)
-- =============================================================================
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE
);

-- Insert primary admin
INSERT INTO admins (email) VALUES ('rtmbe20@gmail.com') ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- EPA_BASELINE TABLE (replaces Firestore epaBaseline/{teamNumber_year})
-- =============================================================================
CREATE TABLE IF NOT EXISTS epa_baseline (
  id TEXT PRIMARY KEY, -- format: teamNumber_year
  team_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  epa_total NUMERIC DEFAULT 0,
  epa_auto NUMERIC DEFAULT 0,
  epa_teleop NUMERIC DEFAULT 0,
  epa_endgame NUMERIC DEFAULT 0,
  epa_unitless NUMERIC DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  source TEXT DEFAULT 'statbotics',
  raw_data JSONB,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ADJUSTED_EPA TABLE (replaces Firestore adjustedEPA/{teamNumber_eventKey})
-- =============================================================================
CREATE TABLE IF NOT EXISTS adjusted_epa (
  id TEXT PRIMARY KEY, -- format: teamNumber_eventKey
  team_number INTEGER NOT NULL,
  event_key TEXT NOT NULL,
  year INTEGER,
  baseline_epa JSONB,
  adjustment JSONB,
  adjusted_epa JSONB,
  scouting_metrics JSONB,
  scouting_entries_count INTEGER DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_scouting_team ON scouting(team_number);
CREATE INDEX IF NOT EXISTS idx_scouting_event ON scouting(event_key);
CREATE INDEX IF NOT EXISTS idx_scouting_scouter ON scouting(scouter_uid);
CREATE INDEX IF NOT EXISTS idx_scouting_team_lead ON scouting(team_lead_uid);
CREATE INDEX IF NOT EXISTS idx_scouting_scouting_id ON scouting(scouting_id);
CREATE INDEX IF NOT EXISTS idx_profiles_team_lead ON profiles(team_lead_uid);
CREATE INDEX IF NOT EXISTS idx_team_codes_lead ON team_codes(team_lead_uid);
CREATE INDEX IF NOT EXISTS idx_epa_baseline_team ON epa_baseline(team_number, year);
CREATE INDEX IF NOT EXISTS idx_adjusted_epa_event ON adjusted_epa(event_key);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scouting ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE epa_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE adjusted_epa ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user is master admin
CREATE OR REPLACE FUNCTION is_master_admin(user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN LOWER(user_email) = 'rtmbe20@gmail.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Check if user is in admins table
CREATE OR REPLACE FUNCTION is_admin(user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM admins WHERE LOWER(email) = LOWER(user_email));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PROFILES POLICIES
-- =============================================================================
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Team leads can view team members" ON profiles
  FOR SELECT USING (
    team_lead_uid = auth.uid() OR
    is_master_admin(auth.email())
  );

-- =============================================================================
-- TEAM_CODES POLICIES
-- =============================================================================
CREATE POLICY "Anyone can validate team codes" ON team_codes
  FOR SELECT USING (active = TRUE);

-- Allow users to create their own team codes (becoming a Team Lead)
CREATE POLICY "Users can create team codes" ON team_codes
  FOR INSERT WITH CHECK (team_lead_uid = auth.uid());

-- Team leads can view their own codes
CREATE POLICY "Team leads can view their codes" ON team_codes
  FOR SELECT USING (team_lead_uid = auth.uid());

-- Team leads can update their own codes
CREATE POLICY "Team leads can update their codes" ON team_codes
  FOR UPDATE USING (team_lead_uid = auth.uid());

-- Team leads can delete their own codes
CREATE POLICY "Team leads can delete their codes" ON team_codes
  FOR DELETE USING (team_lead_uid = auth.uid());

CREATE POLICY "Master admin full access to team_codes" ON team_codes
  FOR ALL USING (is_master_admin(auth.email()))
  WITH CHECK (is_master_admin(auth.email()));

-- =============================================================================
-- SCOUTING POLICIES (matching Firestore rules)
-- =============================================================================
-- Master admin sees all
CREATE POLICY "Master admin full access to scouting" ON scouting
  FOR ALL USING (is_master_admin(auth.email()));

-- Team leads see all data with matching team_lead_uid
CREATE POLICY "Team leads see team scouting data" ON scouting
  FOR SELECT USING (team_lead_uid = auth.uid());

-- Users can see data with matching scouting_id
CREATE POLICY "Users see scouting_id data" ON scouting
  FOR SELECT USING (
    scouting_id = (SELECT scouting_id FROM profiles WHERE id = auth.uid())
  );

-- Users can see their own entries
CREATE POLICY "Users see own scouting entries" ON scouting
  FOR SELECT USING (scouter_uid = auth.uid());

-- Users can insert scouting data
CREATE POLICY "Users can insert scouting data" ON scouting
  FOR INSERT WITH CHECK (scouter_uid = auth.uid());

-- Users can update their own entries
CREATE POLICY "Users can update own scouting" ON scouting
  FOR UPDATE USING (scouter_uid = auth.uid());

-- Users can delete their own entries
CREATE POLICY "Users can delete own scouting" ON scouting
  FOR DELETE USING (scouter_uid = auth.uid());

-- =============================================================================
-- QUESTIONS POLICIES
-- =============================================================================
CREATE POLICY "Anyone can read questions" ON questions
  FOR SELECT USING (TRUE);

CREATE POLICY "Admins can manage questions" ON questions
  FOR ALL USING (is_admin(auth.email()));

-- =============================================================================
-- ADMINS POLICIES
-- =============================================================================
CREATE POLICY "Admins can read admin list" ON admins
  FOR SELECT USING (is_admin(auth.email()));

CREATE POLICY "Master admin can manage admins" ON admins
  FOR ALL USING (is_master_admin(auth.email()));

-- =============================================================================
-- EPA POLICIES (read-only for users, write for system/admin)
-- =============================================================================
CREATE POLICY "Anyone can read EPA baseline" ON epa_baseline
  FOR SELECT USING (TRUE);

CREATE POLICY "Admins can manage EPA baseline" ON epa_baseline
  FOR ALL USING (is_admin(auth.email()));

CREATE POLICY "Anyone can read adjusted EPA" ON adjusted_epa
  FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can write adjusted EPA" ON adjusted_epa
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update adjusted EPA" ON adjusted_epa
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- =============================================================================
-- TRIGGER: Auto-update updated_at on profiles
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- PIT SCOUTING TABLE (NEW - Pre-event robot capability collection)
-- =============================================================================
CREATE TABLE IF NOT EXISTS pit_scouting (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_number INTEGER NOT NULL,
  event_key TEXT NOT NULL,

  -- Robot Configuration
  drive_type TEXT CHECK (drive_type IN ('tank', 'mecanum', 'swerve', 'other')),
  climb_level TEXT CHECK (climb_level IN ('none', 'level1', 'level2', 'level3')),
  shooter_type TEXT CHECK (shooter_type IN ('fixed_turret', 'adjustable_turret', 'none')),
  intake_type TEXT CHECK (intake_type IN ('over_bumper', 'under_bumper', 'both', 'none')),
  preferred_strategy TEXT,

  -- Optional robot image
  robot_image_url TEXT,

  -- Ownership for RLS
  scouter_uid UUID NOT NULL REFERENCES profiles(id),
  scouter_name TEXT,
  team_lead_uid UUID REFERENCES profiles(id),
  scouting_id TEXT,

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one pit scout entry per team per event (per team lead)
  UNIQUE(team_number, event_key, team_lead_uid)
);

-- Indexes for pit_scouting
CREATE INDEX IF NOT EXISTS idx_pit_scouting_team ON pit_scouting(team_number);
CREATE INDEX IF NOT EXISTS idx_pit_scouting_event ON pit_scouting(event_key);
CREATE INDEX IF NOT EXISTS idx_pit_scouting_team_lead ON pit_scouting(team_lead_uid);

-- Enable RLS on pit_scouting
ALTER TABLE pit_scouting ENABLE ROW LEVEL SECURITY;

-- Pit Scouting RLS Policies
CREATE POLICY "Master admin full access to pit_scouting" ON pit_scouting
  FOR ALL USING (is_master_admin(auth.email()));

CREATE POLICY "Team leads see team pit scouting data" ON pit_scouting
  FOR SELECT USING (team_lead_uid = auth.uid());

CREATE POLICY "Users see own pit scouting entries" ON pit_scouting
  FOR SELECT USING (scouter_uid = auth.uid());

CREATE POLICY "Users can insert pit scouting data" ON pit_scouting
  FOR INSERT WITH CHECK (scouter_uid = auth.uid());

CREATE POLICY "Users can update own pit scouting" ON pit_scouting
  FOR UPDATE USING (scouter_uid = auth.uid());

CREATE POLICY "Users can delete own pit scouting" ON pit_scouting
  FOR DELETE USING (scouter_uid = auth.uid());

-- Trigger for pit_scouting updated_at
CREATE TRIGGER pit_scouting_updated_at
  BEFORE UPDATE ON pit_scouting
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- STRATEGY DRAWINGS TABLE (NEW - Strategy board drawings)
-- =============================================================================
CREATE TABLE IF NOT EXISTS strategy_drawings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Match identification (null for default/general strategy)
  match_key TEXT,
  event_key TEXT NOT NULL,

  -- Drawing data stored as JSON
  drawing_data JSONB NOT NULL,

  -- Metadata
  title TEXT,
  is_default BOOLEAN DEFAULT FALSE,

  -- Ownership for RLS
  created_by UUID NOT NULL REFERENCES profiles(id),
  team_lead_uid UUID REFERENCES profiles(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for strategy_drawings
CREATE INDEX IF NOT EXISTS idx_strategy_drawings_event ON strategy_drawings(event_key);
CREATE INDEX IF NOT EXISTS idx_strategy_drawings_match ON strategy_drawings(match_key);
CREATE INDEX IF NOT EXISTS idx_strategy_drawings_team_lead ON strategy_drawings(team_lead_uid);

-- Enable RLS on strategy_drawings
ALTER TABLE strategy_drawings ENABLE ROW LEVEL SECURITY;

-- Strategy Drawings RLS Policies
CREATE POLICY "Master admin full access to strategy_drawings" ON strategy_drawings
  FOR ALL USING (is_master_admin(auth.email()));

CREATE POLICY "Team leads see team strategy drawings" ON strategy_drawings
  FOR SELECT USING (team_lead_uid = auth.uid());

CREATE POLICY "Users see own strategy drawings" ON strategy_drawings
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "Users can insert strategy drawings" ON strategy_drawings
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own strategy drawings" ON strategy_drawings
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Users can delete own strategy drawings" ON strategy_drawings
  FOR DELETE USING (created_by = auth.uid());

-- Trigger for strategy_drawings updated_at
CREATE TRIGGER strategy_drawings_updated_at
  BEFORE UPDATE ON strategy_drawings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- USER SETTINGS TABLE (NEW - User preferences including large button mode)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  -- UI Preferences
  large_button_mode BOOLEAN DEFAULT FALSE,
  theme TEXT DEFAULT 'default' CHECK (theme IN ('default', 'frc_red', 'frc_blue', 'high_contrast')),

  -- Offline settings
  offline_enabled BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- User Settings RLS Policies
CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own settings" ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger for user_settings updated_at
CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

