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
  -- 2026 REBUILT game fields
  auto_fuel_scored INTEGER DEFAULT 0,
  auto_tower_climb TEXT,
  teleop_fuel_active INTEGER DEFAULT 0,
  teleop_fuel_inactive INTEGER DEFAULT 0,
  teleop_cycle_count INTEGER DEFAULT 0,
  endgame_tower_level TEXT,
  defense_rating INTEGER DEFAULT 0,
  hub_control_first BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE POLICY "Team leads can manage their codes" ON team_codes
  FOR ALL USING (team_lead_uid = auth.uid());

CREATE POLICY "Master admin full access to team_codes" ON team_codes
  FOR ALL USING (is_master_admin(auth.email()));

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

