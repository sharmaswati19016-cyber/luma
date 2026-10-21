# Luma

**care that notices early**

Luma is a daily 2-minute cognitive check-in for elder-care facilities. It is **speak-and-tap only** (no reading, typing or accounts for residents), and it tracks every resident against **their own personal baseline** so staff can notice sustained change early, before it becomes a crisis.

Built for the UnivaBio hackathon, theme: *Artificial Intelligence for Human Health*.

> **Luma is a screening and awareness aid, not a diagnostic tool.** It flags a pattern that may be worth a doctor's attention. It does not determine the cause: infections, new medicines, hearing loss, poor sleep and low mood can all look the same. It is not yet clinically validated.

---

## Table of contents

1. [The problem](#the-problem)
2. [How it works](#how-it-works)
3. [Features](#features)
4. [Tech stack](#tech-stack)
5. [Architecture](#architecture)
6. [Project structure](#project-structure)
7. [Getting started](#getting-started)
8. [Demo data and trying it out](#demo-data-and-trying-it-out)
9. [Deployment (Vercel)](#deployment-vercel)
10. [Database reference](#database-reference)
11. [Design decisions and known limitations](#design-decisions-and-known-limitations)
12. [Roadmap](#roadmap)
13. [Branches](#branches)

---

## The problem

Early cognitive decline (mild cognitive impairment, early dementia) is subtle. In a care home, staff look after many residents at once, and one bad day (poor sleep, distraction) looks the same as the start of real decline. Meaningful change often goes unnoticed for months.

Many residents also have low literacy or limited comfort with technology, which rules out any app built on reading or typing.

## How it works

1. **Staff** create an account, add residents by name, and give each resident a **6-digit pairing code**.
2. A **resident** enters the code once on a tablet. The tablet remembers them. There are no passwords.
3. Each day the resident does a **2-minute check-in**. The result is saved to Supabase.
4. A **trend engine** (Postgres functions, run weekly) compares each week against the resident's own baseline.
5. **Staff** see who is *Steady*, *Worth watching*, or *Worth a check-up conversation*, with a plain-English reason.

Residents never see a score. They see a calm, non-clinical message at the end.

---

## Features

### Resident check-in (tablet, no login)

| Step | What the resident does | What it measures |
|---|---|---|
| Learning | Hears 3 words spoken aloud (and sees them briefly) | Sets up the recall tasks |
| Orientation | Taps today's day from 4 options | Orientation (also acts as a distractor) |
| Category fluency | Names as many items as they can from the day's category in 30 seconds | Processing speed and word retrieval |
| Free recall | Says the 3 words from the start | Free recall (the main memory signal) |
| Picture recognition | Taps the 3 words among 6 picture icons, with no text labels | Recognition (stored as a secondary score) |

- **Retry / Yes / Fix it:** after each spoken task the screen shows what the app heard. The resident can tap **Retry**, **Fix it** (correct the text) or **Yes**. A misheard word is visible and correctable instead of silently corrupting the score.
- **Live speech-to-text** with Deepgram (`nova-3`), so words appear on screen while the resident speaks.
- **Rotating category:** animals are the main tracked category. Other categories appear occasionally for variety; they are stored but kept out of the baseline and trend, so a "hard category day" never looks like decline.
- **Word pool:** 30 pre-validated word sets that rotate per resident per day, so difficulty does not drift and repeats are rare.
- **Look-alike protection:** icon words that look alike (for example mop and broom) never appear in the same set.
- **One check-in per day:** a second attempt shows a gentle "You've already done today's check-in" message with a **Back home** button.
- **Morning/evening greeting** on the home screen.

### Staff dashboard (login required)

| Page | Route | What it does |
|---|---|---|
| Dashboard | `/staff/dashboard` | Facility summary (for example "3 residents flagged this week") |
| All Residents | `/staff/residents` | Add a resident by name, see status and pairing code, **Regenerate code**, **Delete** |
| Progress | `/staff/progress` | Plain-English reason for each resident |
| Resident detail | `/staff/progress/[residentId]` | Three weekly trend charts (free recall, fluency words, response time) and a **Mark off day** button |

Staff only see residents of their own facility (enforced by row-level security).

### Trend engine

- **Baseline:** built from each resident's first 2 weeks. Two practice days at the start are recorded but excluded.
- **Weekly comparison:** each week is compared with that baseline using z-scores.
- **Flag rule:** a flag needs **two or more metrics declining together for 3+ consecutive weeks**. A single bad day or a single off metric never triggers anything.
- **Response time** uses the weekly median and carries less weight. A flag needs a drop in recall or fluency, not just slower tapping.
- **"Gone quiet" rule:** a separate condition for missed check-ins.
- **Off days:** staff can mark a day (unwell, new medicine, slept badly, and so on). Marked days are excluded from the baseline and trend.
- **Statuses:** *Steady*, *Worth watching*, *Worth a check-up conversation*. Raw scores are never shown to non-clinical staff.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript and JavaScript, Tailwind CSS 4 |
| Backend / database / auth | Supabase (Postgres, Supabase Auth, row-level security, RPC functions) |
| Scheduling | `pg_cron` (weekly trend engine run) |
| Speech-to-text | Deepgram streaming API (`nova-3`) over WebSocket |
| Text-to-speech | Browser `speechSynthesis` (no install needed) |
| Hosting | Vercel |

Dependencies are kept small: `next`, `react`, `react-dom` and `@supabase/supabase-js`. Deepgram is called with the browser's native `WebSocket` and `MediaRecorder`, so there is no Deepgram SDK.

---

## Architecture

There is no separate backend server. The browser talks to Supabase directly with the public anon key. All business logic (validation, scoring rules, the trend engine) lives in **Postgres functions (RPCs)** protected by **row-level security**.

```
Resident tablet ──► Next.js app ──► Supabase RPCs (security definer) ──► Postgres
                        │                                                  ▲
                        │ /api/deepgram-token (server only)                │
                        ▼                                                  │
                    Deepgram  (browser streams audio, 60-second token)     │
                                                                           │
Staff browser  ──► Next.js app ──► Supabase Auth + RLS-protected reads ────┘
                                              ▲
                                  pg_cron ──► run_trend_engine() weekly
```

Key points:

- **Staff** have real logins (Supabase Auth). **Residents do not.** A resident's identity is stored in the tablet's local storage, set once via a pairing code.
- Every write a resident's tablet can trigger goes through a `security definer` function (not a raw table insert), because an unauthenticated resident has no `auth.uid()` to build RLS around. The function does the safety checks itself.
- The dashboard read functions (`get_facility_roster` and similar) deliberately run as the **calling staff user**, so RLS filters results to that staff member's own facility automatically.
- **The Deepgram API key never reaches the browser.** The route `app/api/deepgram-token/route.ts` asks Deepgram for a token that expires after 60 seconds and returns only that.
- `submit_checkin` expects the fluency count **after** the resident has confirmed the transcribed words. Raw speech-to-text output is never scored directly.

---

## Project structure

```
app/
  page.tsx                         Landing screen
  role/                            Choose resident or staff
  resident/                        Resident tablet app (pairing, home, check-in)
  staff/
    login/, signup/                Staff authentication
    (protected)/                   Staff pages behind login
      dashboard/, residents/, progress/, progress/[residentId]/
  api/deepgram-token/route.ts      Server route that issues short-lived Deepgram tokens
src/components/
  checkin/                         CheckinController and the question text
  pairing/, home/, shared/         Pairing screen, home screen, landing and role screens
hooks/
  useDeepgramSTT.ts                Streaming speech-to-text hook
lib/
  api.ts                           Typed wrappers around every Supabase RPC
  supabase.ts                      Supabase client (reads env vars)
  resident.ts                      Resident id/name in local storage
  wordIcons.ts                     Icon word list, look-alike rules, picture options, free-recall scoring
  greeting.js                      Morning/evening greeting
public/icons/                      90 word icons (one PNG per word)
public/assets/                     Logos and illustrations
supabase/migrations/               Numbered SQL migrations (run in order)
```

---

## Getting started

### Prerequisites

- Node.js 20 or newer and npm
- A free [Supabase](https://supabase.com) project
- A [Deepgram](https://deepgram.com) account and API key

### 1. Clone and install

```bash
git clone https://github.com/sharmaswati19016-cyber/cognitive-checkin.git
cd cognitive-checkin
npm install
```

### 2. Set up Supabase

1. Create a project at supabase.com.
2. Open the **SQL Editor** and run every file in `supabase/migrations/` **in numeric order**. Each one depends on the ones before it.
3. Turn on the `pg_cron` extension (**Database → Extensions → pg_cron**), then schedule the weekly trend run:
   ```sql
   select cron.schedule(
     'weekly-trend-engine',
     '0 3 * * 1',
     $$select run_trend_engine();$$
   );
   ```
4. Turn **off** "Confirm email" (**Authentication → Providers → Email**). Staff sign-up expects a session right away, and shows an error if email confirmation is still on.

### 3. Create a Deepgram key

In the Deepgram console, create an API key that is allowed to create temporary tokens (the `keys:write` scope). A key without that permission makes `/api/deepgram-token` fail with "Insufficient permissions".

### 4. Add environment variables

Copy `.env.example` to `.env.local` and fill it in:

```bash
NEXT_PUBLIC_SUPABASE_URL=       # Project Settings → API → Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Project Settings → API → anon public key
DEEPGRAM_API_KEY=               # Deepgram console (server-side only)
```

`.env*` files are in `.gitignore`. Never commit real keys, and never put `DEEPGRAM_API_KEY` in a `NEXT_PUBLIC_` variable.

### 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Restart the dev server after changing `.env.local`.

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

> **Microphone note:** browsers only allow microphone access on `https://` pages or `localhost`. Test on a real tablet through your deployed HTTPS URL.

---

## Demo data and trying it out

The trend engine needs about 5 weeks of history before it can show a flag (2-week baseline plus 3 weeks of decline). To make that visible straight away, migration `20260901000012_seed_demo_data.sql` creates:

- A demo facility, **Sunrise Elder Care**, with facility code `SUNRISE01`
- 5 demo residents with pairing codes `900001` to `900005`
- 56 days of **seeded, backdated** check-ins per resident, engineered to give a mix of Steady, Worth watching and flagged results

**This data is simulated to demonstrate the trend engine. Live use builds history organically over weeks.**

Re-run the seed file at any time to reset the demo residents.

### Try the staff side

1. Go to `/staff/signup`, create an account with facility code `SUNRISE01`, and log in.
2. Look at **Dashboard**, **All Residents** and **Progress**. Open a resident to see the weekly charts.
3. Add your own test resident under **All Residents** to get a new pairing code.

### Try the resident side

1. Open `/resident` on a tablet or phone (use a test resident's code, such as one you created yourself).
2. Enter the 6-digit code, tap **Start Today's Check-in**, and allow the microphone.

> **Use your own test resident, not the five demo residents.** Check-ins change a resident's trend results, and only one check-in is allowed per resident per day.

---

## Deployment (Vercel)

1. Import the repository into Vercel.
2. Add the three environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DEEPGRAM_API_KEY`) under **Project Settings → Environment Variables**.
3. Deploy (or redeploy after adding variables). Vercel serves HTTPS, so the microphone works on tablets.

---

## Database reference

### Tables

`facilities`, `staff`, `residents`, `checkins`, `trend_flags`, plus content tables for word sets and fluency categories (with valid-word lists per category).

### Functions the frontend calls (all wrapped in `lib/api.ts`)

| Area | Functions |
|---|---|
| Staff sign-up | `validate_facility_code`, `create_staff_profile` |
| Residents (staff) | `create_resident_by_staff`, `regenerate_pairing_code`, `delete_resident` |
| Off days | `mark_off_day`, `unmark_off_day` |
| Resident pairing | `pair_device`, `get_resident_name` |
| Check-in setup | `get_daily_word_set_for_resident`, `get_daily_fluency_category_for_resident` |
| Check-in scoring and save | `count_valid_fluency_words`, `submit_checkin` |
| Dashboard | `get_facility_roster`, `get_facility_summary`, `get_resident_weekly_history` |
| Trend engine | `run_trend_engine` (scheduled weekly), `compute_and_flag_resident` |

### Migrations

Run in numeric order. The numbering is the dependency order.

| Range | What it adds |
|---|---|
| `000001` to `000002` | Foundation schema with row-level security; facility code validation and staff sign-up linking |
| `000003` to `000004` | Word-recall sets and fluency categories; expansion to 30 word sets with per-resident daily rotation |
| `000005` to `000008` | `submit_checkin`; resident deletion; pairing codes; removal of the old typed-name onboarding |
| `000009` to `000011` | Trend engine (baseline and sustained-decline detection); dashboard endpoints; trend engine hotfix |
| `000012` | Seed data for 5 demo residents |
| `000013` to `000018` | Check-in schema v2 (free recall, recognition, category, practice and off-day fields), `submit_checkin` v2, trend engine v2, animals-first rotation, roster/history v2, removal of room numbers |
| `000019` to `000020` | Look-alike fixes for word sets (so look-alike icons never share a set) |
| `000021` | `get_resident_name` (first name only, safe for the unauthenticated tablet) |

---

## Design decisions and known limitations

- **Personal baseline, not population average.** Each resident is compared with their own normal.
- **Sustained, multi-metric rule.** This mirrors how real cognitive assessments work: several domains, tracked over time.
- **Confirm-or-correct on every speech task.** Speech recognition can struggle with soft voices, accents and noisy common rooms. Showing the transcript turns a silent error into a visible, fixable one.
- **Cannot separate causes.** A UTI, new medication, hearing loss, poor sleep or depression can lower scores temporarily. Luma flags a pattern worth a doctor's attention and does not determine why. Off-day marking reduces false alarms from known temporary causes.
- **Practice effect.** A rotating pool of 30 word sets and several categories makes repeats rare.
- **Needs time to show a flag.** A flag needs 2 weeks of baseline plus 3 weeks of decline, so demos use seeded history.
- **Not clinically validated.**

---

## Roadmap

Not built yet:

- **Staff-assisted mode:** a caregiver runs the check-in verbally for residents who cannot use a device
- **Local language support:** local-language audio prompts, speech recognition and accepted answers
- **Family mode:** a family member linked to one relative living independently, seeing the same status and trends

---

## Branches

| Branch | Purpose |
|---|---|
| `main` | Integrated, submission-ready code |
| `backend` | Supabase migrations and database work |
| `frontend` | Next.js app work |

Please do not force-push (`git push -f`) to shared branches, and never commit `.env.local`.
