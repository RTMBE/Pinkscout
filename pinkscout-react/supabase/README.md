# Supabase migration workflow

`migrations/` at the repository root contains historical SQL editor scripts.
Do not re-run those scripts after security hardening; several preserve the old
profile/team-code authorization model.

The deployable security migration is:

`supabase/migrations/20260810120000_security_hardening.sql`

For an existing PinkScout project, apply it only after a staging backup and the
RLS test matrix in [the security runbook](../docs/SECURITY_DEPLOYMENT.md).
Use `supabase db push` from this directory’s parent; do not paste individual
legacy snippets into the SQL editor.

The migration intentionally quarantines legacy team relationships instead of
trusting old browser-editable profile or team-code fields. If preserving legacy
rows is required, follow the runbook’s reviewed, operator-only
`security.map_legacy_team_data(...)` procedure after independently verifying
the team owner and roster. Never grant that private helper to browser/API roles
or populate memberships automatically from legacy fields.

For a brand-new project that still needs the historical baseline schema, a
platform operator must apply `supabase-schema.sql` to an otherwise private,
unexposed project and immediately run this security migration before allowing
any browser client to sign in. The baseline file contains transitional legacy
policies and is not a production authorization configuration by itself.
