# Cognitive Check-In — Backend

Supabase (Postgres) backend for the cognitive check-in platform. No separate
server — the frontend talks to Supabase directly using the anon key, and all
business logic (auth checks, scoring rules, the trend engine) lives in
Postgres functions (RPCs), enforced by row-level security.

## Setup (fresh Supabase project)

1. Create a project at supabase.com.
2. In the SQL Editor, run every file in `supabase/migrations/` **in order**
   (the numeric prefix is the order — 000001 first, 000009 last). Each one
   depends on the ones before it.
3. Enable the `pg_cron` extension: **Database → Extensions → pg_cron**.
4. Schedule the weekly trend engine run:
   ```sql
   select cron.schedule(
     'weekly-trend-engine',
     '0 3 * * 1',
     $$select run_trend_engine();$$
   );
   ```
5. Copy `.env.example` to `.env.local` in the frontend project and fill in
   your project's URL + anon key from **Project Settings → API**.

## What's in each migration

| File | What it adds |
|---|---|
| `000001_foundation_schema.sql` | Core tables: facilities, staff, residents, checkins, trend_flags + RLS |
| `000002_auth_functions.sql` | Facility code validation, staff signup linking |
| `000003_content_pool.sql` | Word-recall sets + fluency categories (initial 10 + 6) |
| `000004_expand_word_pool_per_resident.sql` | Expands to 30 word sets; per-resident daily rotation |
| `000005_checkin_pipeline.sql` | `submit_checkin` — validates and stores one day's results |
| `000006_delete_resident.sql` | Admin-only resident deletion (cascades to their history) |
| `000007_pairing_codes.sql` | Staff pre-creates residents; device pairs via 6-digit code |
| `000008_remove_register_resident.sql` | Removes the old typed-name onboarding path (superseded by pairing codes) |
| `000009_trend_engine.sql` | Baseline calculation + weekly sustained-decline detection |

## Architecture notes for whoever reads this next

- **Staff** have real logins (Supabase Auth). **Residents do not** — a
  resident's identity lives in their device's local storage, established once
  via a pairing code, never a password.
- Every write that a resident's device can trigger goes through a
  `security definer` Postgres function (not a raw table insert), because
  there's no `auth.uid()` to build RLS policies around for an unauthenticated
  resident. The function itself does the safety checking instead.
- The trend engine won't produce real flags until a resident has 5+ weeks of
  real history (2 weeks baseline + 3 weeks to detect sustained decline). See
  the seed-data script (Step 7, not yet built) for how the demo gets around
  that honestly.

## Still to build (see project plan)

- Step 6: dashboard data endpoints (roster, resident detail, facility summary queries)
- Step 7: seed script for backdated demo data
- Step 8: hardening pass
- Step 9: final run-through
