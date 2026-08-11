# PinkScout security deployment runbook

This release changes PinkScout from client-selected team identifiers to
membership-backed authorization. Do **not** deploy the frontend before the
database migration is reviewed and applied in a staging project.

## Release order

1. Rotate/revoke any TBA, Nexus, Firebase, or other provider credential that
   was ever committed or shipped to the browser **before any deployment or
   further use**. Set only the replacement TBA key in the server-side Vercel
   environment in step 5. If the provider cannot overlap old and new keys,
   accept a temporary outage rather than leaving a known public credential
   active.
2. Create a database backup and record row counts for every team-scoped table.
   Enable Point-in-Time Recovery for production if the plan supports it.
3. Apply `supabase/migrations/20260810120000_security_hardening.sql` to a staging copy with
   `supabase db push` (or the project’s reviewed migration workflow).
   Check the migration report for unmapped legacy rows. Those rows stay
   inaccessible to normal users until an authorized database operator maps
   them through the reviewed procedure below. Do not infer a team, owner, or
   membership from an old profile, team code, scouting ID, or row-level
   `team_lead_uid`: all of those were client-editable in the legacy system.
   The migration intentionally does not bootstrap a platform administrator by
   email. After independently verifying the intended account UUID and that its
   email is confirmed, an authorized database operator must add that exact UUID
   to `public.platform_admins` in the Supabase dashboard. Record the approval
   and UUID in the release evidence; never use an email-only `INSERT ... SELECT`
   or a browser workflow for this step.
   Team owners cannot create invites until a platform operator verifies the
   FRC affiliation. After checking the team number with the coach/mentor and
   recording the reviewer, set `verified_at` and `verified_by` on that exact
   `public.teams.id` through the audited dashboard procedure. Do not approve a
   team based only on an email-domain or self-entered FRC number. Pending
   claims intentionally do not reserve a number; verify only the legitimate
   claim, because the database permits just one verified team per FRC number.
   To recover a legitimate team’s legacy data, an authorized database operator
   must first independently verify the real owner account UUID and roster,
   create only those reviewed `team_memberships`, and ensure the verified
   `public.teams` row has that exact owner UUID in `legacy_lead_uid`. Then, in
   the audited Supabase SQL Editor (never through the browser/API), run:

   ```sql
   SELECT security.map_legacy_team_data(
     '<reviewed-team-uuid>'::uuid,
     '<reviewed-legacy-owner-uuid>'::uuid
   );
   ```

   The private function is not executable by API roles. It maps only rows that
   still have no `team_id` and exactly match that reviewed legacy owner, writes
   an audit event, and rolls back completely if a scoped uniqueness conflict is
   found. Preserve and review the returned counts before continuing. Do not
   disable triggers, grant this function to `authenticated`, or bulk-update
   `team_id` from legacy fields. Rows without a reviewed mapping remain
   quarantined.
4. Test the RLS matrix with two regular accounts from different teams:
   - Team A cannot read, create, update, delete, upload, or sign a Team B row
     or image by changing an ID in a browser request.
   - A scout cannot promote themself, alter membership, alter a row's team,
     create an invite for another team, or reuse an invite.
   - An owner/admin can create a single-use invite, a verified signed-in scout
     can redeem it once, and revocation takes effect immediately (including
     invalidating unused invites created by a removed manager).
5. Set the Vercel server-only variables in Preview and Production:

   ```text
   TBA_API_KEY=<rotated TBA key>
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=<Supabase publishable/anon key>
   ```

   Recommended for durable API rate limits and cache across serverless instances:

   ```text
   UPSTASH_REDIS_REST_URL=<url>
   UPSTASH_REDIS_REST_TOKEN=<token>
   ```

   These values must never use the `VITE_` prefix. Never put a Supabase
   service-role/secret key in Vercel client environment variables.
6. Deploy to Vercel Preview. Confirm that `GET /api/competition` returns 401
   without a bearer token and 403 for an account without an active team, then
   test a valid signed-in team request. Confirm no TBA key appears in the
   built JavaScript or in browser network requests.
7. After Preview passes, deploy the frontend and verify mobile sign-in,
   service-worker update, scouting writes, signed robot-image URLs, and invite
   redemption.

## Credential incident response

Treat every provider key ever shipped in a browser bundle or committed to Git
history as compromised. This repository historically tracked a generated
browser bundle containing a TBA credential. Rotate/revoke it before deployment
as required above, and audit/rotate any historical Firebase or Nexus
credentials.

Removing a file from the current branch does not remove it from a public Git
history. An authorized repository administrator must use the host's secret
scanning/history-rewrite process (or make the repository private) after
rotation. Do not paste old or replacement keys into an issue, PR, chat, or
commit.

## Required Supabase dashboard settings

- Require email confirmation, configure a production SMTP sender, enable
  leaked-password protection and strong password requirements.
- Enable CAPTCHA for sign-up and review Auth rate limits. Rate-limit custom
  invite redemption separately (it is not an Auth endpoint).
- Require TOTP MFA for team owners/admins. This migration enforces AAL2 for
  creating/revoking invites and removing members; use the same guard for any
  future sharing, export, role-change, or destructive-action endpoint.
  PinkScout’s Profile page provides the TOTP enrollment and per-session
  verification flow; confirm TOTP enrollment/challenge/verification are
  enabled in Supabase Auth before rollout.
- Browser platform-operations accounts deliberately have no bypass to read
  team scouting rows, profiles, memberships, or robot images. Perform
  exceptional production maintenance only in the audited Supabase operator
  workflow with organization MFA; do not add a browser RLS bypass for it.
- Allow only exact production redirect URLs (and narrowly scoped Preview URLs
  if actually needed). Do not leave broad redirect wildcards in production.
- Keep `team-robot-images` private. Do not make the bucket or its object list
  public; use short-lived (currently 60-second) signed URLs only after
  membership checks. A URL already downloaded cannot be revoked, so do not
  increase this lifetime without a documented risk review.
- Enable the Supabase Security Advisor and fix every exposed security-definer
  function, mutable `search_path`, or permissive RLS warning.
- Before applying to production, retain the Storage-policy preflight result:

  ```sql
  SELECT policyname, roles, cmd, permissive, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects';
  ```

  The migration adds restrictive guards for both the retired and new robot
  image buckets, but broad legacy policies should still be removed deliberately
  after confirming they are not needed by another feature.

## Required Vercel controls

- Configure a Vercel Firewall rate rule for `/api/competition*`, initially
  around 600 requests/minute/IP to accommodate a venue Wi-Fi network. The
  function also enforces a lower per-authenticated-user limit.
- Set a custom production domain before relying on HSTS. Verify the Content
  Security Policy in Preview on login, OAuth return, image display, and PWA
  installation before production rollout.
- Review Vercel access logs and function errors during competitions. Provider
  responses are cached only on the server; browser/API responses are marked
  `private, no-store`.

## Operational rules

- Treat an invite token like a password: share it privately, it is displayed
  only once, expires, and is single-use. The database stores only a SHA-256
  hash.
- An FRC number is an identity claim, not proof of affiliation. Before a team
  starts inviting scouts in production, have a coach/mentor or platform
  operator verify the claimant. Pending claims do not block the real team, but
  the database permits only one verified claim per FRC number.
- Team sharing remains disabled in this release. Do not re-enable raw
  cross-team table access. A later sharing feature must return sanitized,
  read-only aggregates through a server-side endpoint and record audit events.
- Shared scouting tablets intentionally use a tab-scoped session. Sign out and
  close the tab at the end of a shift; a reload in the same tab preserves the
  session so PKCE email/OAuth redirects work. Pending offline records
  are bound to the signing user/team and cleared on sign-out rather than being
  silently submitted under the next scout's account.
- If email confirmation opens in a new tab, return to the original signup tab
  to finish a pending team action, or sign in and paste the invite token again.

## Sources

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase Auth MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
