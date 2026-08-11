-- =============================================================================
-- PINKSCOUT SECURITY HARDENING
-- =============================================================================
-- Review and apply this migration in STAGING before production. It deliberately
-- does not delete legacy rows: rows that cannot be reliably mapped to a team
-- remain inaccessible to normal users and are reported at the end.
--
-- Deployment order:
--   1. Backup / PITR snapshot
--   2. Apply this migration
--   3. Validate the RLS matrix with two test teams
--   4. Deploy the matching frontend/server changes
--
-- This migration replaces client-editable profile/team-code authorization with
-- team memberships, short-lived hashed invites, and team-scoped RLS.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS security;
REVOKE ALL ON SCHEMA security FROM PUBLIC;
-- RLS expressions call narrowly granted helper functions in this schema. They
-- need schema visibility, but authenticated callers never get CREATE rights.
GRANT USAGE ON SCHEMA security TO authenticated;
-- Prevent an untrusted browser role from putting an object ahead of a
-- security-definer function's qualified references.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Older installations may not have run the legacy sharing-setting migration.
-- Create the column so the profile-protection trigger below is portable.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS use_all_event_data BOOLEAN NOT NULL DEFAULT FALSE;

-- -----------------------------------------------------------------------------
-- Authoritative team and audit model
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Deliberately do not seed this table by email. A deployment operator must
-- bootstrap a pre-verified, reviewed auth.users UUID using the runbook after
-- the migration completes. Future changes are database/Edge workflow only.

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  frc_team_number INTEGER CHECK (frc_team_number BETWEEN 1 AND 99999),
  name TEXT CHECK (char_length(name) <= 120),
  -- Retained only to map legacy rows during the transition. It is never used
  -- as an authorization decision after this migration.
  legacy_lead_uid UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT teams_verified_requires_frc_number
    CHECK (verified_at IS NULL OR frc_team_number IS NOT NULL)
);

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.teams'::regclass
      AND conname = 'teams_verified_requires_frc_number'
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_verified_requires_frc_number
      CHECK (verified_at IS NULL OR frc_team_number IS NOT NULL);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.team_memberships (
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'scout')) DEFAULT 'scout',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (team_id, user_id)
);

-- PinkScout's current UI has one active team context. This index prevents an
-- invite from silently attaching a scout to a second team; multi-team support
-- can be added later with an explicit active-team chooser.
CREATE UNIQUE INDEX IF NOT EXISTS team_memberships_one_active_team_per_user
  ON public.team_memberships(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS team_memberships_active_team_idx
  ON public.team_memberships(team_id, user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.team_invites (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  role TEXT NOT NULL DEFAULT 'scout' CHECK (role IN ('admin', 'scout')),
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 25),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),
  CHECK (use_count <= max_uses)
);
CREATE INDEX IF NOT EXISTS team_invites_active_lookup_idx
  ON public.team_invites(team_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.team_invite_redemptions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  invite_id UUID NOT NULL REFERENCES public.team_invites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(invite_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.team_audit_log (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (char_length(action) <= 100),
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_audit_log_team_created_idx
  ON public.team_audit_log(team_id, created_at DESC);

-- Direct RPC calls do not pass through the Vercel gateway, so high-value
-- invite actions receive a persistent per-user throttle in Postgres as well.
-- Network-level/IP controls and CAPTCHA remain required deployment settings.
CREATE TABLE IF NOT EXISTS public.team_invite_rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'redeem')),
  window_started_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (user_id, action)
);

-- -----------------------------------------------------------------------------
-- Private helpers. These are security-definer functions with an immutable,
-- schema-qualified search path. They are not exposed as PostgREST RPCs.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION security.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION security.is_team_member(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships m
    WHERE m.team_id = p_team_id
      AND m.user_id = auth.uid()
      AND m.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION security.is_team_manager(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships m
    WHERE m.team_id = p_team_id
      AND m.user_id = auth.uid()
      AND m.revoked_at IS NULL
      AND m.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION security.current_team_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT m.team_id
  FROM public.team_memberships m
  WHERE m.user_id = auth.uid() AND m.revoked_at IS NULL
  ORDER BY m.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION security.legacy_lead_for_team(p_team_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT t.legacy_lead_uid FROM public.teams t WHERE t.id = p_team_id;
$$;

CREATE OR REPLACE FUNCTION security.hash_invite_token(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION security.enforce_invite_rate_limit(
  p_action TEXT,
  p_max_attempts INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_window TIMESTAMPTZ := date_trunc('hour', now());
  v_attempts INTEGER;
BEGIN
  IF auth.uid() IS NULL OR p_action NOT IN ('create', 'redeem')
     OR p_max_attempts < 1 OR p_max_attempts > 100 THEN
    RAISE EXCEPTION 'Request temporarily unavailable';
  END IF;

  INSERT INTO public.team_invite_rate_limits AS limits
    (user_id, action, window_started_at, attempts)
  VALUES (auth.uid(), p_action, v_window, 1)
  ON CONFLICT (user_id, action) DO UPDATE
    SET attempts = CASE
      WHEN limits.window_started_at < v_window THEN 1
      ELSE limits.attempts + 1
    END,
    window_started_at = v_window
  WHERE limits.window_started_at < v_window OR limits.attempts < p_max_attempts
  RETURNING attempts INTO v_attempts;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request temporarily unavailable';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION security.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.is_team_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.is_team_manager(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.current_team_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.legacy_lead_for_team(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.hash_invite_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.enforce_invite_rate_limit(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION security.is_team_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION security.is_team_manager(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Profile provisioning and protection. Authorization columns are immutable from
-- browser sessions; the auth trigger provisions profiles instead of the client.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION security.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Scout'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pinkscout_handle_new_user ON auth.users;
CREATE TRIGGER pinkscout_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION security.handle_new_user();

-- Backfill profiles for any existing Auth users that predate the trigger.
INSERT INTO public.profiles (id, email, display_name)
SELECT
  u.id,
  COALESCE(u.email, ''),
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'display_name', ''), split_part(COALESCE(u.email, ''), '@', 1), 'Scout')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

CREATE OR REPLACE FUNCTION security.protect_profile_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.team_number IS DISTINCT FROM OLD.team_number
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.scouting_id IS DISTINCT FROM OLD.scouting_id
     OR NEW.is_team_lead IS DISTINCT FROM OLD.is_team_lead
     OR NEW.team_lead_uid IS DISTINCT FROM OLD.team_lead_uid
     OR NEW.team_code IS DISTINCT FROM OLD.team_code
     OR NEW.use_all_event_data IS DISTINCT FROM OLD.use_all_event_data THEN
    RAISE EXCEPTION 'Profile authorization fields are managed by PinkScout security controls';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pinkscout_protect_profile_authorization ON public.profiles;
CREATE TRIGGER pinkscout_protect_profile_authorization
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION security.protect_profile_authorization();

-- -----------------------------------------------------------------------------
-- Legacy profile, team-code, and row-level lead fields were browser-editable
-- before this migration. They are evidence for an operator to review, never a
-- trustworthy authorization source. Do not create teams, memberships, or row
-- ownership from them automatically: every legacy row stays quarantined until
-- an operator independently verifies its team and roster.
-- -----------------------------------------------------------------------------

-- An unverified self-service claim must not squat an FRC number. Several
-- pending claims may coexist privately, but a partial unique index allows at
-- most one *verified* PinkScout team for each FRC number. The operator chooses
-- and records the legitimate claim during affiliation verification.
DROP INDEX IF EXISTS public.teams_frc_team_number_unique;
CREATE UNIQUE INDEX IF NOT EXISTS teams_verified_frc_team_number_unique
  ON public.teams(frc_team_number)
  WHERE frc_team_number IS NOT NULL AND verified_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Add immutable team ownership to every private data set and backfill it.
-- -----------------------------------------------------------------------------

ALTER TABLE public.scouting ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id);
ALTER TABLE public.scouting ADD COLUMN IF NOT EXISTS idempotency_key TEXT CHECK (char_length(idempotency_key) BETWEEN 16 AND 100);
ALTER TABLE public.pit_scouting ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id);
ALTER TABLE public.pit_scouting ADD COLUMN IF NOT EXISTS robot_image_path TEXT;
ALTER TABLE public.pit_scouting ADD COLUMN IF NOT EXISTS idempotency_key TEXT CHECK (char_length(idempotency_key) BETWEEN 16 AND 100);
ALTER TABLE public.strategy_drawings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id);
ALTER TABLE public.scouting_config ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id);
ALTER TABLE public.prescouting_data ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id);
ALTER TABLE public.alliance_compatibility ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id);

-- A database row may only reference an object inside its own private prefix.
-- Storage RLS independently enforces the same boundary for the actual file.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pit_scouting'::regclass
      AND conname = 'pit_scouting_robot_image_team_path'
  ) THEN
    ALTER TABLE public.pit_scouting
      ADD CONSTRAINT pit_scouting_robot_image_team_path
      CHECK (
        robot_image_path IS NULL
        OR (team_id IS NOT NULL AND robot_image_path LIKE team_id::text || '/pit-scouting/%')
      );
  END IF;
END;
$$;

-- No automatic `team_id` backfill appears here. The reviewed, post-migration
-- operator procedure in the deployment runbook maps a team's legacy rows only
-- after its real-world roster and legacy owner are independently confirmed.

CREATE INDEX IF NOT EXISTS scouting_team_id_event_idx ON public.scouting(team_id, event_key);
CREATE UNIQUE INDEX IF NOT EXISTS scouting_team_idempotency_key_unique
  ON public.scouting(team_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS pit_scouting_team_id_event_idx ON public.pit_scouting(team_id, event_key);
CREATE UNIQUE INDEX IF NOT EXISTS pit_scouting_team_idempotency_key_unique
  ON public.pit_scouting(team_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS strategy_drawings_team_id_event_idx ON public.strategy_drawings(team_id, event_key);
CREATE INDEX IF NOT EXISTS scouting_config_team_id_year_idx ON public.scouting_config(team_id, year);
CREATE INDEX IF NOT EXISTS prescouting_data_team_id_year_idx ON public.prescouting_data(team_id, year);
CREATE INDEX IF NOT EXISTS alliance_compatibility_team_id_event_idx ON public.alliance_compatibility(team_id, event_key);

-- Retire legacy global uniqueness: teams may independently import the same
-- public FRC team/event data without colliding or learning of each other.
ALTER TABLE public.pit_scouting
  DROP CONSTRAINT IF EXISTS pit_scouting_team_number_event_key_team_lead_uid_key;
ALTER TABLE public.prescouting_data
  DROP CONSTRAINT IF EXISTS prescouting_data_team_number_year_event_key_key;
ALTER TABLE public.alliance_compatibility
  DROP CONSTRAINT IF EXISTS alliance_compatibility_team_a_team_b_year_event_key_key;

-- This maps the client pit-scouting upsert to the membership-scoped record.
-- NULL legacy team IDs remain distinct until their owner is reconciled.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pit_scouting'::regclass
      AND conname = 'pit_scouting_team_event_key'
  ) THEN
    ALTER TABLE public.pit_scouting
      ADD CONSTRAINT pit_scouting_team_event_key UNIQUE (team_id, team_number, event_key);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.prescouting_data'::regclass
      AND conname = 'prescouting_data_team_scope_key'
  ) THEN
    ALTER TABLE public.prescouting_data
      ADD CONSTRAINT prescouting_data_team_scope_key
      UNIQUE (team_id, team_number, year, event_key);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.alliance_compatibility'::regclass
      AND conname = 'alliance_compatibility_team_scope_key'
  ) THEN
    ALTER TABLE public.alliance_compatibility
      ADD CONSTRAINT alliance_compatibility_team_scope_key
      UNIQUE (team_id, team_a, team_b, year, event_key);
  END IF;
END;
$$;

-- Old `adjusted_epa` has a global primary key and must not contain team-private
-- calculations. Leave it locked down; use the team-keyed replacement below.
CREATE TABLE IF NOT EXISTS public.team_adjusted_epa (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  team_number INTEGER NOT NULL,
  event_key TEXT NOT NULL,
  year INTEGER,
  baseline_epa JSONB,
  adjustment JSONB,
  adjusted_epa JSONB,
  scouting_metrics JSONB,
  scouting_entries_count INTEGER NOT NULL DEFAULT 0,
  calculated_by UUID REFERENCES auth.users(id),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, team_number, event_key)
);
CREATE INDEX IF NOT EXISTS team_adjusted_epa_team_event_idx
  ON public.team_adjusted_epa(team_id, event_key);

-- -----------------------------------------------------------------------------
-- Team-stamping triggers. A browser may not choose team_id, author, or legacy
-- lead fields. The active membership is looked up server-side on every write.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION security.stamp_scouting_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_team UUID;
  v_legacy_lead UUID;
BEGIN
  -- This narrow path is set only by the private, operator-only legacy mapping
  -- function below. Normal browser updates are still denied by RLS before
  -- they reach this trigger, and the function itself is never granted to an
  -- API role. It lets a reviewed operator attach an otherwise inaccessible
  -- legacy row without temporarily disabling the write protections.
  IF TG_OP = 'UPDATE'
     AND OLD.team_id IS NULL
     AND NEW.team_id IS NOT NULL
     AND NEW.team_id::TEXT = current_setting('pinkscout.legacy_mapping_team_id', true)
     AND NEW.team_lead_uid = security.legacy_lead_for_team(NEW.team_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND security.is_platform_admin() THEN
    v_team := OLD.team_id;
  ELSE
    v_team := security.current_team_id();
  END IF;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'An active team membership is required';
  END IF;
  SELECT legacy_lead_uid INTO v_legacy_lead FROM public.teams WHERE id = v_team;

  IF TG_OP = 'UPDATE' AND (NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.scouter_uid IS DISTINCT FROM OLD.scouter_uid) THEN
    RAISE EXCEPTION 'Team and author cannot be changed';
  END IF;

  NEW.team_id := v_team;
  IF TG_OP = 'INSERT' THEN
    NEW.scouter_uid := auth.uid();
  ELSE
    NEW.scouter_uid := OLD.scouter_uid;
  END IF;
  NEW.team_lead_uid := v_legacy_lead;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION security.stamp_pit_scouting_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_team UUID;
  v_legacy_lead UUID;
BEGIN
  -- See security.map_legacy_team_data for the only permitted legacy-mapping
  -- path. Do not remove this guard or expose that function to API roles.
  IF TG_OP = 'UPDATE'
     AND OLD.team_id IS NULL
     AND NEW.team_id IS NOT NULL
     AND NEW.team_id::TEXT = current_setting('pinkscout.legacy_mapping_team_id', true)
     AND NEW.team_lead_uid = security.legacy_lead_for_team(NEW.team_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND security.is_platform_admin() THEN
    v_team := OLD.team_id;
  ELSE
    v_team := security.current_team_id();
  END IF;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'An active team membership is required';
  END IF;
  SELECT legacy_lead_uid INTO v_legacy_lead FROM public.teams WHERE id = v_team;

  IF TG_OP = 'UPDATE' AND (NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.scouter_uid IS DISTINCT FROM OLD.scouter_uid) THEN
    RAISE EXCEPTION 'Team and author cannot be changed';
  END IF;

  NEW.team_id := v_team;
  IF TG_OP = 'INSERT' THEN
    NEW.scouter_uid := auth.uid();
  ELSE
    NEW.scouter_uid := OLD.scouter_uid;
  END IF;
  NEW.team_lead_uid := v_legacy_lead;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION security.stamp_strategy_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_team UUID;
  v_legacy_lead UUID;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.team_id IS NULL
     AND NEW.team_id IS NOT NULL
     AND NEW.team_id::TEXT = current_setting('pinkscout.legacy_mapping_team_id', true)
     AND NEW.team_lead_uid = security.legacy_lead_for_team(NEW.team_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND security.is_platform_admin() THEN
    v_team := OLD.team_id;
  ELSE
    v_team := security.current_team_id();
  END IF;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'An active team membership is required';
  END IF;
  SELECT legacy_lead_uid INTO v_legacy_lead FROM public.teams WHERE id = v_team;

  IF TG_OP = 'UPDATE' AND (NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'Team and author cannot be changed';
  END IF;

  NEW.team_id := v_team;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  END IF;
  NEW.team_lead_uid := v_legacy_lead;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION security.stamp_config_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_team UUID;
  v_legacy_lead UUID;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.team_id IS NULL
     AND NEW.team_id IS NOT NULL
     AND NEW.team_id::TEXT = current_setting('pinkscout.legacy_mapping_team_id', true)
     AND NEW.team_lead_uid = security.legacy_lead_for_team(NEW.team_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND security.is_platform_admin() THEN
    v_team := OLD.team_id;
  ELSE
    v_team := security.current_team_id();
  END IF;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'An active team membership is required';
  END IF;
  SELECT legacy_lead_uid INTO v_legacy_lead FROM public.teams WHERE id = v_team;
  IF TG_OP = 'UPDATE' AND NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    RAISE EXCEPTION 'Team cannot be changed';
  END IF;
  NEW.team_id := v_team;
  NEW.team_lead_uid := v_legacy_lead;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION security.stamp_prescouting_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_team UUID;
  v_legacy_lead UUID;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.team_id IS NULL
     AND NEW.team_id IS NOT NULL
     AND NEW.team_id::TEXT = current_setting('pinkscout.legacy_mapping_team_id', true)
     AND NEW.team_lead_uid = security.legacy_lead_for_team(NEW.team_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND security.is_platform_admin() THEN
    v_team := OLD.team_id;
  ELSE
    v_team := security.current_team_id();
  END IF;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'An active team membership is required';
  END IF;
  SELECT legacy_lead_uid INTO v_legacy_lead FROM public.teams WHERE id = v_team;
  IF TG_OP = 'UPDATE' AND (NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.imported_by IS DISTINCT FROM OLD.imported_by) THEN
    RAISE EXCEPTION 'Team and importer cannot be changed';
  END IF;
  NEW.team_id := v_team;
  IF TG_OP = 'INSERT' THEN
    NEW.imported_by := auth.uid();
  END IF;
  NEW.team_lead_uid := v_legacy_lead;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION security.stamp_compatibility_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_team UUID;
  v_legacy_lead UUID;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.team_id IS NULL
     AND NEW.team_id IS NOT NULL
     AND NEW.team_id::TEXT = current_setting('pinkscout.legacy_mapping_team_id', true)
     AND NEW.team_lead_uid = security.legacy_lead_for_team(NEW.team_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND security.is_platform_admin() THEN
    v_team := OLD.team_id;
  ELSE
    v_team := security.current_team_id();
  END IF;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'An active team membership is required';
  END IF;
  SELECT legacy_lead_uid INTO v_legacy_lead FROM public.teams WHERE id = v_team;
  IF TG_OP = 'UPDATE' AND (NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.calculated_by IS DISTINCT FROM OLD.calculated_by) THEN
    RAISE EXCEPTION 'Team and calculator cannot be changed';
  END IF;
  NEW.team_id := v_team;
  IF TG_OP = 'INSERT' THEN
    NEW.calculated_by := auth.uid();
  END IF;
  NEW.team_lead_uid := v_legacy_lead;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION security.stamp_adjusted_epa_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_team UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND security.is_platform_admin() THEN
    v_team := OLD.team_id;
  ELSE
    v_team := security.current_team_id();
  END IF;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'An active team membership is required';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.calculated_by IS DISTINCT FROM OLD.calculated_by) THEN
    RAISE EXCEPTION 'Team and calculator cannot be changed';
  END IF;
  NEW.team_id := v_team;
  IF TG_OP = 'INSERT' THEN
    NEW.calculated_by := auth.uid();
  END IF;
  NEW.calculated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pinkscout_stamp_scouting_team ON public.scouting;
CREATE TRIGGER pinkscout_stamp_scouting_team
  BEFORE INSERT OR UPDATE ON public.scouting
  FOR EACH ROW EXECUTE FUNCTION security.stamp_scouting_team();

DROP TRIGGER IF EXISTS pinkscout_stamp_pit_scouting_team ON public.pit_scouting;
CREATE TRIGGER pinkscout_stamp_pit_scouting_team
  BEFORE INSERT OR UPDATE ON public.pit_scouting
  FOR EACH ROW EXECUTE FUNCTION security.stamp_pit_scouting_team();

DROP TRIGGER IF EXISTS pinkscout_stamp_strategy_team ON public.strategy_drawings;
CREATE TRIGGER pinkscout_stamp_strategy_team
  BEFORE INSERT OR UPDATE ON public.strategy_drawings
  FOR EACH ROW EXECUTE FUNCTION security.stamp_strategy_team();

DROP TRIGGER IF EXISTS pinkscout_stamp_config_team ON public.scouting_config;
CREATE TRIGGER pinkscout_stamp_config_team
  BEFORE INSERT OR UPDATE ON public.scouting_config
  FOR EACH ROW EXECUTE FUNCTION security.stamp_config_team();

DROP TRIGGER IF EXISTS pinkscout_stamp_prescouting_team ON public.prescouting_data;
CREATE TRIGGER pinkscout_stamp_prescouting_team
  BEFORE INSERT OR UPDATE ON public.prescouting_data
  FOR EACH ROW EXECUTE FUNCTION security.stamp_prescouting_team();

DROP TRIGGER IF EXISTS pinkscout_stamp_compatibility_team ON public.alliance_compatibility;
CREATE TRIGGER pinkscout_stamp_compatibility_team
  BEFORE INSERT OR UPDATE ON public.alliance_compatibility
  FOR EACH ROW EXECUTE FUNCTION security.stamp_compatibility_team();

DROP TRIGGER IF EXISTS pinkscout_stamp_adjusted_epa_team ON public.team_adjusted_epa;
CREATE TRIGGER pinkscout_stamp_adjusted_epa_team
  BEFORE INSERT OR UPDATE ON public.team_adjusted_epa
  FOR EACH ROW EXECUTE FUNCTION security.stamp_adjusted_epa_team();

-- Legacy team identifiers were previously client-editable and cannot be used
-- to create access automatically. This private function is only a controlled
-- data-recovery path for a database operator *after* they have manually
-- created a verified team and reviewed owner membership for the real people.
-- It is deliberately in the non-PostgREST `security` schema and is never
-- granted to an API role. The transaction either maps every eligible row or
-- rolls back, including on a newly scoped uniqueness conflict.
CREATE OR REPLACE FUNCTION security.map_legacy_team_data(
  p_team_id UUID,
  p_legacy_lead_uid UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_scouting_count INTEGER := 0;
  v_pit_scouting_count INTEGER := 0;
  v_strategy_count INTEGER := 0;
  v_config_count INTEGER := 0;
  v_prescouting_count INTEGER := 0;
  v_compatibility_count INTEGER := 0;
BEGIN
  IF p_team_id IS NULL OR p_legacy_lead_uid IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.teams t
       JOIN public.team_memberships m
         ON m.team_id = t.id
        AND m.user_id = p_legacy_lead_uid
        AND m.role = 'owner'
        AND m.revoked_at IS NULL
       WHERE t.id = p_team_id
         AND t.verified_at IS NOT NULL
         AND t.legacy_lead_uid = p_legacy_lead_uid
     ) THEN
    RAISE EXCEPTION 'Legacy mapping requires a reviewed, verified team and active owner';
  END IF;

  -- The six BEFORE UPDATE triggers above honor this transaction-local marker
  -- only for NULL-to-reviewed-team mappings with the matching legacy owner.
  -- No browser-visible function can set it while bypassing the NULL-team RLS
  -- policies, and this helper is not executable by API roles.
  PERFORM set_config('pinkscout.legacy_mapping_team_id', p_team_id::TEXT, true);

  UPDATE public.scouting
  SET team_id = p_team_id
  WHERE team_id IS NULL AND team_lead_uid = p_legacy_lead_uid;
  GET DIAGNOSTICS v_scouting_count = ROW_COUNT;

  UPDATE public.pit_scouting
  SET team_id = p_team_id
  WHERE team_id IS NULL AND team_lead_uid = p_legacy_lead_uid;
  GET DIAGNOSTICS v_pit_scouting_count = ROW_COUNT;

  UPDATE public.strategy_drawings
  SET team_id = p_team_id
  WHERE team_id IS NULL AND team_lead_uid = p_legacy_lead_uid;
  GET DIAGNOSTICS v_strategy_count = ROW_COUNT;

  UPDATE public.scouting_config
  SET team_id = p_team_id
  WHERE team_id IS NULL AND team_lead_uid = p_legacy_lead_uid;
  GET DIAGNOSTICS v_config_count = ROW_COUNT;

  UPDATE public.prescouting_data
  SET team_id = p_team_id
  WHERE team_id IS NULL AND team_lead_uid = p_legacy_lead_uid;
  GET DIAGNOSTICS v_prescouting_count = ROW_COUNT;

  UPDATE public.alliance_compatibility
  SET team_id = p_team_id
  WHERE team_id IS NULL AND team_lead_uid = p_legacy_lead_uid;
  GET DIAGNOSTICS v_compatibility_count = ROW_COUNT;

  INSERT INTO public.team_audit_log (team_id, actor_id, action, metadata)
  VALUES (
    p_team_id,
    auth.uid(),
    'legacy.data_mapped',
    jsonb_build_object(
      'legacy_lead_uid', p_legacy_lead_uid,
      'scouting', v_scouting_count,
      'pit_scouting', v_pit_scouting_count,
      'strategy_drawings', v_strategy_count,
      'scouting_config', v_config_count,
      'prescouting_data', v_prescouting_count,
      'alliance_compatibility', v_compatibility_count
    )
  );

  RETURN jsonb_build_object(
    'scouting', v_scouting_count,
    'pit_scouting', v_pit_scouting_count,
    'strategy_drawings', v_strategy_count,
    'scouting_config', v_config_count,
    'prescouting_data', v_prescouting_count,
    'alliance_compatibility', v_compatibility_count
  );
END;
$$;
REVOKE ALL ON FUNCTION security.map_legacy_team_data(UUID, UUID) FROM PUBLIC;
-- Trigger functions are invoked by PostgreSQL, not as RPCs. Explicitly revoke
-- their default PUBLIC execute grant so `GRANT USAGE ON SCHEMA security` for
-- the RLS helpers cannot make a privileged trigger implementation callable.
REVOKE ALL ON FUNCTION security.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.protect_profile_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.stamp_scouting_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.stamp_pit_scouting_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.stamp_strategy_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.stamp_config_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.stamp_prescouting_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.stamp_compatibility_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.stamp_adjusted_epa_team() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- Public RPC contract. These functions expose only the caller's team context,
-- one-time invite plaintext, or limited member display data.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_team()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_membership RECORD;
BEGIN
  SELECT m.team_id, m.role, t.frc_team_number, (t.verified_at IS NOT NULL) AS team_verified
    INTO v_membership
  FROM public.team_memberships m
  JOIN public.teams t ON t.id = m.team_id
  WHERE m.user_id = auth.uid() AND m.revoked_at IS NULL
  ORDER BY m.created_at
  LIMIT 1;

  RETURN jsonb_build_object(
    'team_id', v_membership.team_id,
    'role', v_membership.role,
    'team_number', v_membership.frc_team_number,
    'team_verified', COALESCE(v_membership.team_verified, false),
    'is_platform_admin', security.is_platform_admin()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_my_team(p_team_number INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_team_id UUID;
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_team_number IS NOT NULL AND (p_team_number < 1 OR p_team_number > 99999) THEN
    RAISE EXCEPTION 'Invalid team number';
  END IF;
  IF security.current_team_id() IS NOT NULL THEN
    RAISE EXCEPTION 'You already belong to a team';
  END IF;
  -- Serialize new claims for a given public FRC number. Browser callers have
  -- no direct INSERT policy on teams, so this prevents a check/insert race.
  IF p_team_number IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(p_team_number);
  END IF;
  IF p_team_number IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams
    WHERE frc_team_number = p_team_number AND verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Team number already has a verified PinkScout team. Ask its owner for an invite.';
  END IF;

  INSERT INTO public.teams (frc_team_number, name, legacy_lead_uid, created_by)
  VALUES (p_team_number, CASE WHEN p_team_number IS NULL THEN NULL ELSE concat('FRC ', p_team_number) END, auth.uid(), auth.uid())
  RETURNING id INTO v_team_id;

  INSERT INTO public.team_memberships (team_id, user_id, role, created_by)
  VALUES (v_team_id, auth.uid(), 'owner', auth.uid());

  INSERT INTO public.team_audit_log (team_id, actor_id, action, target_user_id)
  VALUES (v_team_id, auth.uid(), 'team.created', auth.uid());

  SELECT public.get_my_team() INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_team_invite(p_expires_in_hours INTEGER DEFAULT 72)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_team_id UUID;
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_invite_id UUID;
  v_team_verified BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'Multi-factor authentication is required to create an invite';
  END IF;
  IF p_expires_in_hours IS NULL OR p_expires_in_hours < 1 OR p_expires_in_hours > 168 THEN
    RAISE EXCEPTION 'Invite expiry must be between 1 hour and 7 days';
  END IF;
  v_team_id := security.current_team_id();
  IF v_team_id IS NULL OR NOT security.is_team_manager(v_team_id) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  SELECT verified_at IS NOT NULL INTO v_team_verified
  FROM public.teams WHERE id = v_team_id;
  IF NOT COALESCE(v_team_verified, false) THEN
    RAISE EXCEPTION 'Team affiliation verification is required before creating an invite';
  END IF;
  -- This is intentionally after authorization. A rate-limit rejection performs
  -- no write, while successful calls commit their persistent attempt count.
  PERFORM security.enforce_invite_rate_limit('create', 10);

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + make_interval(hours => p_expires_in_hours);
  INSERT INTO public.team_invites (team_id, token_hash, expires_at, created_by)
  VALUES (v_team_id, security.hash_invite_token(v_token), v_expires_at, auth.uid())
  RETURNING id INTO v_invite_id;

  INSERT INTO public.team_audit_log (team_id, actor_id, action, metadata)
  VALUES (v_team_id, auth.uid(), 'invite.created', jsonb_build_object('invite_id', v_invite_id, 'expires_at', v_expires_at));

  -- This is the only time plaintext is returned. Do not log, persist, or put it
  -- in a URL. The browser should display it once and allow a private copy.
  RETURN jsonb_build_object('token', v_token, 'invite_id', v_invite_id, 'expires_at', v_expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_team_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_invite public.team_invites%ROWTYPE;
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  PERFORM security.enforce_invite_rate_limit('redeem', 20);
  -- Return an indistinguishable result for expected failures instead of
  -- raising: the throttle write above must commit for an invalid attempt.
  IF p_token IS NULL OR p_token !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO v_invite
  FROM public.team_invites
  WHERE token_hash = security.hash_invite_token(lower(p_token))
  FOR UPDATE;

  IF NOT FOUND OR v_invite.revoked_at IS NOT NULL
     OR v_invite.expires_at <= now()
     OR v_invite.use_count >= v_invite.max_uses
     OR NOT EXISTS (
       SELECT 1
       FROM public.team_memberships creator
       WHERE creator.team_id = v_invite.team_id
         AND creator.user_id = v_invite.created_by
         AND creator.revoked_at IS NULL
         AND creator.role IN ('owner', 'admin')
     )
     OR security.current_team_id() IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  -- A concurrent redemption with a different invite can violate the one-team
  -- constraint. Catch it in a nested transaction so the outer throttle write
  -- remains committed and the caller still gets the same generic outcome.
  BEGIN
    INSERT INTO public.team_memberships (team_id, user_id, role, created_by)
    VALUES (v_invite.team_id, auth.uid(), v_invite.role, v_invite.created_by);

    INSERT INTO public.team_invite_redemptions (invite_id, user_id)
    VALUES (v_invite.id, auth.uid());

    UPDATE public.team_invites
    SET use_count = use_count + 1
    WHERE id = v_invite.id;

    INSERT INTO public.team_audit_log (team_id, actor_id, action, target_user_id, metadata)
    VALUES (v_invite.team_id, auth.uid(), 'invite.redeemed', auth.uid(), jsonb_build_object('invite_id', v_invite.id));
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false);
  END;

  SELECT public.get_my_team() INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_team_members()
RETURNS TABLE (user_id UUID, display_name TEXT, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT m.user_id, p.display_name, m.role
  FROM public.team_memberships m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.team_id = security.current_team_id()
    AND m.revoked_at IS NULL
    AND security.is_team_manager(m.team_id)
  ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, p.display_name;
$$;

CREATE OR REPLACE FUNCTION public.list_my_team_invites()
RETURNS TABLE (
  invite_id UUID,
  role TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  use_count INTEGER,
  max_uses INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT i.id, i.role, i.created_at, i.expires_at, i.use_count, i.max_uses
  FROM public.team_invites i
  WHERE i.team_id = security.current_team_id()
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
    AND i.use_count < i.max_uses
    AND security.is_team_manager(i.team_id)
  ORDER BY i.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.revoke_team_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_team_id UUID;
  v_changed INTEGER;
BEGIN
  IF auth.uid() IS NULL
     OR COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'Invite could not be revoked';
  END IF;
  v_team_id := security.current_team_id();
  IF v_team_id IS NULL OR NOT security.is_team_manager(v_team_id) THEN
    RAISE EXCEPTION 'Invite could not be revoked';
  END IF;

  UPDATE public.team_invites
  SET revoked_at = now(), revoked_by = auth.uid()
  WHERE id = p_invite_id
    AND team_id = v_team_id
    AND revoked_at IS NULL;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN
    RAISE EXCEPTION 'Invite could not be revoked';
  END IF;

  INSERT INTO public.team_audit_log (team_id, actor_id, action, metadata)
  VALUES (v_team_id, auth.uid(), 'invite.revoked', jsonb_build_object('invite_id', p_invite_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_team_member(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_team_id UUID;
  v_actor_role TEXT;
  v_target_role TEXT;
  v_changed INTEGER;
  v_revoked_invite_count INTEGER;
BEGIN
  IF auth.uid() IS NULL
     OR p_user_id IS NULL
     OR p_user_id = auth.uid()
     OR COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'Member could not be removed';
  END IF;
  v_team_id := security.current_team_id();
  SELECT role INTO v_actor_role
  FROM public.team_memberships
  WHERE team_id = v_team_id AND user_id = auth.uid() AND revoked_at IS NULL;
  SELECT role INTO v_target_role
  FROM public.team_memberships
  WHERE team_id = v_team_id AND user_id = p_user_id AND revoked_at IS NULL;

  IF v_team_id IS NULL OR v_actor_role NOT IN ('owner', 'admin')
     OR v_target_role IS NULL OR v_target_role = 'owner'
     OR (v_actor_role = 'admin' AND v_target_role <> 'scout') THEN
    RAISE EXCEPTION 'Member could not be removed';
  END IF;

  UPDATE public.team_memberships
  SET revoked_at = now(), revoked_by = auth.uid()
  WHERE team_id = v_team_id AND user_id = p_user_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN
    RAISE EXCEPTION 'Member could not be removed';
  END IF;

  -- An ex-manager's unused invites must not remain a back door after their
  -- membership is revoked. Redemption independently rechecks this as defense
  -- in depth in case historical data contains a stale invite.
  UPDATE public.team_invites
  SET revoked_at = now(), revoked_by = auth.uid()
  WHERE team_id = v_team_id
    AND created_by = p_user_id
    AND revoked_at IS NULL
    AND use_count < max_uses;
  GET DIAGNOSTICS v_revoked_invite_count = ROW_COUNT;

  INSERT INTO public.team_audit_log (team_id, actor_id, action, target_user_id, metadata)
  VALUES (
    v_team_id,
    auth.uid(),
    'member.revoked',
    p_user_id,
    jsonb_build_object('revoked_unused_invites', v_revoked_invite_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_my_team(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_team_invite(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_team_invite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_my_team_members() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_my_team_invites() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_team_invite(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_team_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_team(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_invite(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_team_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_team_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_team_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_team_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_team_member(UUID) TO authenticated;

-- Retire the unauthenticated 6-character invite endpoint completely.
DROP FUNCTION IF EXISTS public.validate_team_code(TEXT);

-- -----------------------------------------------------------------------------
-- RLS reset: remove every existing permissive policy on the protected tables,
-- then add explicit authenticated policies with USING and WITH CHECK clauses.
-- -----------------------------------------------------------------------------

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'team_codes', 'teams', 'team_memberships', 'team_invites',
        'team_invite_redemptions', 'team_audit_log', 'scouting', 'pit_scouting',
        'strategy_drawings', 'scouting_config', 'prescouting_data',
        'alliance_compatibility', 'team_sharing', 'adjusted_epa',
        'team_adjusted_epa', 'platform_admins', 'team_invite_rate_limits',
        'admins', 'questions', 'epa_baseline', 'user_settings', 'saved_events'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END;
$$;

-- All legacy policies have now been removed. Retire their public SECURITY
-- DEFINER helpers so no browser session can invoke the old email-based model.
DROP FUNCTION IF EXISTS public.is_admin(TEXT);
DROP FUNCTION IF EXISTS public.is_master_admin(TEXT);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invite_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pit_scouting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouting_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescouting_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_sharing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjusted_epa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_adjusted_epa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invite_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epa_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY security_profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY security_profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY security_teams_select ON public.teams
  FOR SELECT TO authenticated
  USING (security.is_team_member(id));

CREATE POLICY security_memberships_select ON public.team_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR security.is_team_manager(team_id)
  );

CREATE POLICY security_audit_select ON public.team_audit_log
  FOR SELECT TO authenticated
  USING (security.is_team_manager(team_id));

-- `team_codes`, `team_invites`, `team_invite_redemptions`, `team_sharing`, and
-- `platform_admins`, `team_invite_rate_limits`, and legacy `admins` table
-- intentionally have no browser-table policies. Their
-- narrowly-scoped security-definer functions above are the only client API.

CREATE POLICY security_questions_select ON public.questions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY security_epa_baseline_select ON public.epa_baseline
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY security_user_settings_select ON public.user_settings
  FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY security_user_settings_insert ON public.user_settings
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY security_user_settings_update ON public.user_settings
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY security_user_settings_delete ON public.user_settings
  FOR DELETE TO authenticated
  USING (id = auth.uid());

CREATE POLICY security_saved_events_select ON public.saved_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY security_saved_events_insert ON public.saved_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY security_saved_events_update ON public.saved_events
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY security_saved_events_delete ON public.saved_events
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY security_scouting_select ON public.scouting
  FOR SELECT TO authenticated
  USING (security.is_team_member(team_id));
CREATE POLICY security_scouting_insert ON public.scouting
  FOR INSERT TO authenticated
  WITH CHECK (security.is_team_member(team_id));
CREATE POLICY security_scouting_update ON public.scouting
  FOR UPDATE TO authenticated
  USING (
    security.is_team_member(team_id)
    AND (scouter_uid = auth.uid() OR security.is_team_manager(team_id))
  )
  WITH CHECK (security.is_team_member(team_id));
CREATE POLICY security_scouting_delete ON public.scouting
  FOR DELETE TO authenticated
  USING (
    security.is_team_member(team_id)
    AND (scouter_uid = auth.uid() OR security.is_team_manager(team_id))
  );

CREATE POLICY security_pit_scouting_select ON public.pit_scouting
  FOR SELECT TO authenticated
  USING (security.is_team_member(team_id));
CREATE POLICY security_pit_scouting_insert ON public.pit_scouting
  FOR INSERT TO authenticated
  WITH CHECK (security.is_team_member(team_id));
CREATE POLICY security_pit_scouting_update ON public.pit_scouting
  FOR UPDATE TO authenticated
  USING (
    security.is_team_member(team_id)
    AND (scouter_uid = auth.uid() OR security.is_team_manager(team_id))
  )
  WITH CHECK (security.is_team_member(team_id));
CREATE POLICY security_pit_scouting_delete ON public.pit_scouting
  FOR DELETE TO authenticated
  USING (
    security.is_team_member(team_id)
    AND (scouter_uid = auth.uid() OR security.is_team_manager(team_id))
  );

CREATE POLICY security_strategy_select ON public.strategy_drawings
  FOR SELECT TO authenticated
  USING (security.is_team_member(team_id));
CREATE POLICY security_strategy_insert ON public.strategy_drawings
  FOR INSERT TO authenticated
  WITH CHECK (security.is_team_member(team_id));
CREATE POLICY security_strategy_update ON public.strategy_drawings
  FOR UPDATE TO authenticated
  USING (
    security.is_team_member(team_id)
    AND (created_by = auth.uid() OR security.is_team_manager(team_id))
  )
  WITH CHECK (security.is_team_member(team_id));
CREATE POLICY security_strategy_delete ON public.strategy_drawings
  FOR DELETE TO authenticated
  USING (
    security.is_team_member(team_id)
    AND (created_by = auth.uid() OR security.is_team_manager(team_id))
  );

CREATE POLICY security_config_select ON public.scouting_config
  FOR SELECT TO authenticated
  USING (security.is_team_member(team_id));
CREATE POLICY security_config_insert ON public.scouting_config
  FOR INSERT TO authenticated
  WITH CHECK (security.is_team_manager(team_id));
CREATE POLICY security_config_update ON public.scouting_config
  FOR UPDATE TO authenticated
  USING (security.is_team_manager(team_id))
  WITH CHECK (security.is_team_manager(team_id));
CREATE POLICY security_config_delete ON public.scouting_config
  FOR DELETE TO authenticated
  USING (security.is_team_manager(team_id));

CREATE POLICY security_prescouting_select ON public.prescouting_data
  FOR SELECT TO authenticated
  USING (security.is_team_member(team_id));
CREATE POLICY security_prescouting_insert ON public.prescouting_data
  FOR INSERT TO authenticated
  WITH CHECK (security.is_team_manager(team_id));
CREATE POLICY security_prescouting_update ON public.prescouting_data
  FOR UPDATE TO authenticated
  USING (security.is_team_manager(team_id))
  WITH CHECK (security.is_team_manager(team_id));
CREATE POLICY security_prescouting_delete ON public.prescouting_data
  FOR DELETE TO authenticated
  USING (security.is_team_manager(team_id));

CREATE POLICY security_compatibility_select ON public.alliance_compatibility
  FOR SELECT TO authenticated
  USING (security.is_team_member(team_id));
CREATE POLICY security_compatibility_insert ON public.alliance_compatibility
  FOR INSERT TO authenticated
  WITH CHECK (security.is_team_member(team_id));
CREATE POLICY security_compatibility_update ON public.alliance_compatibility
  FOR UPDATE TO authenticated
  USING (
    security.is_team_member(team_id)
    AND (calculated_by = auth.uid() OR security.is_team_manager(team_id))
  )
  WITH CHECK (security.is_team_member(team_id));
CREATE POLICY security_compatibility_delete ON public.alliance_compatibility
  FOR DELETE TO authenticated
  USING (
    security.is_team_member(team_id)
    AND (calculated_by = auth.uid() OR security.is_team_manager(team_id))
  );

CREATE POLICY security_team_adjusted_epa_select ON public.team_adjusted_epa
  FOR SELECT TO authenticated
  USING (security.is_team_member(team_id));
CREATE POLICY security_team_adjusted_epa_insert ON public.team_adjusted_epa
  FOR INSERT TO authenticated
  WITH CHECK (security.is_team_member(team_id));
CREATE POLICY security_team_adjusted_epa_update ON public.team_adjusted_epa
  FOR UPDATE TO authenticated
  USING (security.is_team_member(team_id))
  WITH CHECK (security.is_team_member(team_id));
CREATE POLICY security_team_adjusted_epa_delete ON public.team_adjusted_epa
  FOR DELETE TO authenticated
  USING (security.is_team_manager(team_id));

-- Keep legacy adjusted EPA private while the frontend moves to
-- `team_adjusted_epa`; browser clients have no policy for it.

-- -----------------------------------------------------------------------------
-- Private robot image storage. New records store a path, never a public URL.
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-robot-images',
  'team-robot-images',
  false,
  4194304,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The former public bucket must not remain internet-readable. Existing images
-- need re-upload/migration to the new bucket before they can be displayed.
UPDATE storage.buckets SET public = false WHERE id = 'robot-images';

DROP POLICY IF EXISTS security_team_robot_images_select ON storage.objects;
DROP POLICY IF EXISTS security_team_robot_images_insert ON storage.objects;
DROP POLICY IF EXISTS security_team_robot_images_update ON storage.objects;
DROP POLICY IF EXISTS security_team_robot_images_delete ON storage.objects;
DROP POLICY IF EXISTS security_legacy_robot_images_block ON storage.objects;
DROP POLICY IF EXISTS security_anon_team_robot_images_block ON storage.objects;
DROP POLICY IF EXISTS security_team_robot_images_select_boundary ON storage.objects;
DROP POLICY IF EXISTS security_team_robot_images_insert_boundary ON storage.objects;
DROP POLICY IF EXISTS security_team_robot_images_update_boundary ON storage.objects;
DROP POLICY IF EXISTS security_team_robot_images_delete_boundary ON storage.objects;

-- Policies compose with OR by default. These restrictive guards make any
-- unknown legacy permissive policy harmless for the retired bucket and ensure
-- it cannot bypass the new team/object boundary.
CREATE POLICY security_legacy_robot_images_block ON storage.objects
  AS RESTRICTIVE FOR ALL TO public
  USING (bucket_id <> 'robot-images')
  WITH CHECK (bucket_id <> 'robot-images');
CREATE POLICY security_anon_team_robot_images_block ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon
  USING (bucket_id <> 'team-robot-images')
  WITH CHECK (bucket_id <> 'team-robot-images');
CREATE POLICY security_team_robot_images_select_boundary ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id <> 'team-robot-images'
    OR (
      name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      AND security.is_team_member(split_part(name, '/', 1)::uuid)
    )
  );
CREATE POLICY security_team_robot_images_insert_boundary ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'team-robot-images'
    OR (
      name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      AND security.is_team_member(split_part(name, '/', 1)::uuid)
    )
  );
CREATE POLICY security_team_robot_images_update_boundary ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    bucket_id <> 'team-robot-images'
    OR (
      name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      AND security.is_team_member(split_part(name, '/', 1)::uuid)
      AND (
        owner_id = auth.uid()
        OR security.is_team_manager(split_part(name, '/', 1)::uuid)
      )
    )
  )
  WITH CHECK (
    bucket_id <> 'team-robot-images'
    OR (
      name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      AND security.is_team_member(split_part(name, '/', 1)::uuid)
      AND (
        owner_id = auth.uid()
        OR security.is_team_manager(split_part(name, '/', 1)::uuid)
      )
    )
  );
CREATE POLICY security_team_robot_images_delete_boundary ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id <> 'team-robot-images'
    OR (
      name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      AND security.is_team_member(split_part(name, '/', 1)::uuid)
      AND (
        owner_id = auth.uid()
        OR security.is_team_manager(split_part(name, '/', 1)::uuid)
      )
    )
  );

CREATE POLICY security_team_robot_images_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'team-robot-images'
    AND CASE
      WHEN name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      THEN security.is_team_member(split_part(name, '/', 1)::uuid)
      ELSE false
    END
  );
CREATE POLICY security_team_robot_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-robot-images'
    AND CASE
      WHEN name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      THEN security.is_team_member(split_part(name, '/', 1)::uuid)
      ELSE false
    END
  );
CREATE POLICY security_team_robot_images_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'team-robot-images'
    AND CASE
      WHEN name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      THEN security.is_team_member(split_part(name, '/', 1)::uuid)
        AND (owner_id = auth.uid()
          OR security.is_team_manager(split_part(name, '/', 1)::uuid))
      ELSE false
    END
  )
  WITH CHECK (
    bucket_id = 'team-robot-images'
    AND CASE
      WHEN name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      THEN security.is_team_member(split_part(name, '/', 1)::uuid)
        AND (owner_id = auth.uid()
          OR security.is_team_manager(split_part(name, '/', 1)::uuid))
      ELSE false
    END
  );
CREATE POLICY security_team_robot_images_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-robot-images'
    AND CASE
      WHEN name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      THEN security.is_team_member(split_part(name, '/', 1)::uuid)
        AND (owner_id = auth.uid()
          OR security.is_team_manager(split_part(name, '/', 1)::uuid))
      ELSE false
    END
  );

-- Run after the migration and retain the result with the release evidence. Counts
-- greater than zero require a deliberate owner mapping before those legacy rows
-- are made visible again.
SELECT 'scouting' AS table_name, count(*) AS unmapped_rows FROM public.scouting WHERE team_id IS NULL
UNION ALL SELECT 'pit_scouting', count(*) FROM public.pit_scouting WHERE team_id IS NULL
UNION ALL SELECT 'strategy_drawings', count(*) FROM public.strategy_drawings WHERE team_id IS NULL
UNION ALL SELECT 'scouting_config', count(*) FROM public.scouting_config WHERE team_id IS NULL
UNION ALL SELECT 'prescouting_data', count(*) FROM public.prescouting_data WHERE team_id IS NULL
UNION ALL SELECT 'alliance_compatibility', count(*) FROM public.alliance_compatibility WHERE team_id IS NULL;
