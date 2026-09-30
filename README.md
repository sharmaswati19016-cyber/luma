# Cognitive Check-In — Backend

Supabase (Postgres) backend for the cognitive check-in platform. No separate
server — the frontend talks to Supabase directly using the anon key, and all
business logic (auth checks, scoring rules, the trend engine) lives in
Postgres functions (RPCs), enforced by row-level security.

## Setup (fresh Supabase project)

1. Create a project at supabase.com.
2. In the SQL Editor, run every file in `supabase/migrations/` **in order**
   (the numeric prefix is the order — 000001 first, 000012 last). Each one
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
6. (Optional, for testing) Run `000012_seed_demo_data.sql` again anytime to
   reset 5 demo residents with known Flag/Watch/Steady outcomes.

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
| `000010_dashboard_endpoints.sql` | `get_facility_roster`, `get_facility_summary`, `get_resident_weekly_history` |
| `000011_fix_compute_and_flag_resident.sql` | Hotfix: rewrites the trend engine's metric-list logic using `array_append()` instead of `\|\|`, which was failing with a "malformed array literal" error |
| `000012_seed_demo_data.sql` | Seeds 5 demo residents (56 days of backdated history each) so the trend engine produces real Flag/Watch/Steady results without waiting 5+ real weeks |

## Functions the frontend calls, grouped by screen

- **Staff signup**: `validate_facility_code`, `create_staff_profile`
- **Add resident (staff dashboard)**: `create_resident_by_staff` → shows the returned pairing code
- **Resident onboarding (device)**: `pair_device` → save the returned `resident_id` to local storage
- **Daily check-in setup**: `get_daily_word_set_for_resident`, `get_daily_fluency_category_for_resident`
- **Daily check-in submit**: `submit_checkin`
- **Staff roster/dashboard**: `get_facility_roster`, `get_facility_summary`, `get_resident_weekly_history`
- **Admin**: `delete_resident`

## Architecture notes for whoever reads this next

- **Staff** have real logins (Supabase Auth). **Residents do not** — a
  resident's identity lives in their device's local storage, established once
  via a pairing code, never a password.
- Every write that a resident's device can trigger goes through a
  `security definer` Postgres function (not a raw table insert), because
  there's no `auth.uid()` to build RLS policies around for an unauthenticated
  resident. The function itself does the safety checking instead.
- The dashboard read functions (`get_facility_roster` etc.) are the opposite —
  they deliberately run as the *calling* user (no `security definer`), so the
  existing row-level security policies filter results to that staff member's
  own facility automatically.
- `submit_checkin`'s `p_fluency_count` expects the count **after** the
  resident/staff has confirmed the transcribed words on-screen — the raw
  speech-to-text output should never be passed straight through.

## Still to build

- Step 8: hardening pass (error handling review, response-shape sign-off with frontend)
- Step 9: final run-through before submission
