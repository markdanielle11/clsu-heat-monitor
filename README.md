# CLSU Heat Monitor

An iPhone app and backend that watch the forecast heat index for **Central Luzon State University (CLSU), Science City of Muñoz, Nueva Ecija** and send a push notification when it reaches **42°C or higher**.

- High warning: 42 to 51°C. Extreme warning: 52°C and above. Below 42°C: no alert.
- The **backend** checks the forecast every 15 minutes and sends the push, so alerts arrive even when the app is closed.
- The **app** updates itself while open: no pulling to refresh needed.
- The monitored location is fixed to CLSU (15.7328, 120.9311). It is a constant in the code and cannot be changed from the app or the API.

```
 iPhone app (Expo, TypeScript) <--HTTPS--> Backend (Node, Express, TypeScript) <--> Postgres
        ^                                      |  every 15 min: refresh forecast, decide, push
        |                                      v
        +------ push via Apple (APNs) <--- Expo Push Service        Open-Meteo (estimated forecast)
                                                                    PAGASA values (official, loaded by you)
```

## Read this first: PAGASA data

I looked for an official PAGASA source before writing any code. What exists, as of 19 Nov 2026:

| Finding | Consequence |
|---|---|
| PAGASA has **no documented public forecast API** for heat index. Its heat index forecasts are bulletins and the iHeatMAP website. | The app does not scrape PAGASA and does not invent endpoints. |
| PAGASA **suspended its daily heat index forecasts on 5 Jun 2026** at the start of the rainy season, and plans to resume on **1 Mar 2027** (Manila Bulletin). | Right now there is no official forecast to show. |
| Station data can be requested through PAGASA's climate data request process (CADS forms). | This is the legitimate route to official data. See "Loading official values". |

So the app has two clearly separated data paths, and it never mixes their labels:

1. **Estimate** (default). Temperature and humidity forecast for the CLSU coordinates from [Open-Meteo](https://open-meteo.com/) (a public weather model). The app calculates the heat index with the NWS Rothfusz formula. Every screen and every notification marks it as *Estimate, not an official PAGASA forecast*.
2. **PAGASA official**. When you load a real PAGASA value for a date, it replaces the estimate for that date and is labelled *PAGASA official* with its issue time.

Limits of the estimate you should know about:
- It comes from a weather-model grid cell (several km wide), not a PAGASA station. It can differ from PAGASA's published numbers, usually reading lower on very hot days.
- Open-Meteo's free tier is for **non-commercial** use and requires attribution (the app credits it). Fine for a class project; get a commercial plan before charging for the app.
- Alerts are never sent from an estimate older than 6 hours.

## What you need

| Need | Cost | Why |
|---|---|---|
| Node.js 22 LTS and Git | free | run and build |
| Postgres database: [Supabase](https://supabase.com) or [Neon](https://neon.tech) free tier | free | no local database to install, light on your PC |
| Backend hosting: [Render](https://render.com) or similar | free to about $7/month | the scheduler must be running 24/7 (see "Keeping it live") |
| Expo account (EAS) | free | builds the iPhone app in the cloud |
| **Apple Developer Program** | **about $99/year** | required for real push notifications on an iPhone. There is no free way around this. |

You do not need a Mac. iPhone builds happen on Expo's servers (EAS Build), and your Windows PC only runs commands. Everything below works in PowerShell.

## 1. Run the backend

```powershell
cd backend
npm install
copy .env.example .env      # then edit .env
```

Fill `.env`:
- `DATABASE_URL`: the connection string from Supabase or Neon (add `?sslmode=require`).
- `ADMIN_API_KEY` and `TOKEN_SECRET`: two long random strings. Generate each with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  Never change `TOKEN_SECRET` after launch (stored push tokens are encrypted with it).

```powershell
npm run migrate    # creates the tables
npm run dev        # http://localhost:3000/api/health
```

Run the tests (the integration tests need a Postgres URL; the unit tests do not):

```powershell
npm test
$env:TEST_DATABASE_URL="postgres://user:pass@host/db"; npm test    # also runs the 20 pipeline tests; they wipe that database
```

## 2. Deploy the backend

1. Push this folder to a GitHub repository.
2. On Render: New, Blueprint, select the repo (`render.yaml` is included), and set `DATABASE_URL`. `ADMIN_API_KEY` and `TOKEN_SECRET` are generated for you; copy them somewhere safe.
3. Open `https://YOUR-SERVICE.onrender.com/api/health`. You should see `{"ok":true,...}`.

Any host that runs a Docker container or `node dist/index.js` works (Railway, Fly.io, a VPS). Run `npm run build` then `npm start` without Docker.

### Keeping it live

The scheduler lives inside the backend process, so the backend must stay awake. Free plans that sleep when idle will miss checks. Pick one:
- **A plan that does not sleep** (Render Starter, Railway, Fly.io). Simplest and most reliable.
- **The included GitHub Actions backup** (`.github/workflows/forecast-check.yml`). It calls the backend every 15 minutes, which wakes a sleeping free host and runs a check. Add the secrets `API_URL` and `ADMIN_API_KEY` in the repository settings. GitHub's schedule is best-effort and can run a few minutes late. Duplicate pushes are not possible (database lock plus per-day de-duplication), so you can run both.

## 3. Build the iPhone app

```powershell
cd mobile
npm install
npx eas-cli login
npx eas-cli init                 # creates the EAS project and writes its ID into app.json
```

Then:
1. In `eas.json`, replace `https://YOUR-BACKEND.onrender.com` with your backend URL (all three profiles).
2. In `app.json`, change `ios.bundleIdentifier` to one you own (for example `com.yourname.clsuheatmonitor`).
3. Enroll in the Apple Developer Program, then pick one way to install:
   - **TestFlight** (easiest to share): `npx eas-cli build -p ios --profile production`, then `npx eas-cli submit -p ios`. Install through the TestFlight app.
   - **Direct install on your own devices**: `npx eas-cli device:create` (register your iPhone), then `npx eas-cli build -p ios --profile preview` and open the install link on the iPhone.
4. EAS creates and stores the Apple push key (APNs) for you the first time you build. Accept the prompts.

Open the app, go to **Settings**, turn on **Heat alerts**, and allow notifications. Then tap **Send a test notification**.

## Open it on your phone (GitHub Pages web version)

The same app also builds as a website, so you can open it in Safari or Chrome on any phone without installing anything. GitHub hosts the page for free.

1. Deploy the backend first (section 2) and note its URL, for example `https://clsu-heat-api.onrender.com`.
2. On the backend host, set `CORS_ORIGINS=https://markdanielle11.github.io` so the browser is allowed to call it.
3. In this GitHub repository: **Settings, Secrets and variables, Actions, Variables**, add `API_URL` with the backend URL.
4. **Settings, Pages, Source: GitHub Actions** (already set if the repo was created by the setup script). Then run **Actions, Deploy web app to GitHub Pages, Run workflow**.
5. Open `https://markdanielle11.github.io/clsu-heat-monitor/` on your phone. On iPhone: Share, **Add to Home Screen** gives it an app icon.

What the web version does: Now, Forecast, Alerts screens, live updates, light and dark mode. What it cannot do: **push notifications**. Phones only allow push for an installed app, so alerts that arrive with the app closed need the iPhone build from section 3. The web page shows live data while it is open.

Until `API_URL` is set, the page opens but shows "The app is not connected to a server".

## 4. Test a real alert without waiting for a heat wave

Using your deployed database in `backend/.env`:

```powershell
cd backend
npm run demo -- --tmax 37 --rhmin 52 --check
```

This stores a hot synthetic forecast and runs the real alert pipeline, so every registered iPhone receives a real push, and it appears in the Alerts tab. The next scheduled refresh replaces the synthetic data with the real forecast. Do not run it while others rely on real alerts. It refuses to run when `NODE_ENV=production`.

## How "live" works

| Layer | What updates | How often |
|---|---|---|
| Backend | fetches the forecast, recomputes the heat index, decides who to notify | every 15 minutes (`FORECAST_CRON`) |
| Now tab | current values, today's peak, "Live, updated X min ago" | every 60 s while open, plus on return to the app |
| Forecast tab | chart and hourly strip, "Now" marker | every 5 min while open, marker every minute |
| Alerts tab | history and delivery status | on open, and the moment a push arrives |
| Any push received while the app is open | triggers an immediate refetch of everything | instant |

Polling stops when the app is in the background and resumes the moment it returns. A failed refresh never blanks the screen: the last data stays visible with an "offline" notice, and a "Live / Outdated" indicator shows data age.

## How alerts behave

- One notification per **forecast day and severity**. The same warning is never sent twice.
- 42 to 51°C sends a **High** warning. If the same day later reaches 52°C or more, an **Extreme** warning is sent.
- If the peak rises by 3°C or more within the same severity, an **UPDATED** warning is sent.
- If an alert was sent from an estimate and a PAGASA official value later confirms it, one **CONFIRMED** notification is sent.
- Forecasts that fall do not trigger a push. The Alerts tab keeps the earlier warning.
- It looks at today and tomorrow (Manila time). A peak that already passed this afternoon never alerts in the evening.
- Settings per device: alerts on/off, threshold (35 to 52°C, default 42), High on/off, Extreme on/off.
- Failures: a send that fails for a temporary reason is retried on the next check. Expo delivery receipts are checked every 10 minutes: a dead token (app uninstalled) is retired and never retried. The Alerts tab shows Sent, Delivered or Not delivered. "Delivered" means Apple's push service accepted it; iOS does not report when it appears on the screen.

Notification wording follows your template, with a source line added:

```
HIGH HEAT INDEX WARNING
CLSU Heat Index Alert: 42°C
The forecast indicates that the heat index at Central Luzon State University may reach 42°C on Thu, 19 Nov, around 1:00 PM.
Stay hydrated, avoid prolonged outdoor activities, and minimize direct sun exposure.
Source: app estimate from a weather model forecast. Not an official PAGASA forecast.
```

## Loading official PAGASA values

Only load numbers copied from a real PAGASA product (bulletin, iHeatMAP, or data supplied through a PAGASA request). PowerShell example:

```powershell
$body = @{ entries = @(@{ date = "2027-03-10"; heatIndexC = 44; issuedAt = "2027-03-09T17:00:00+08:00"; station = "Science City of Muñoz"; sourceUrl = "https://www.pagasa.dost.gov.ph/" }) } | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post -Uri "https://YOUR-API/api/admin/official-forecast" -Headers @{ "x-admin-key" = "YOUR_ADMIN_API_KEY" } -ContentType "application/json; charset=utf-8" -Body $body
```

For a thesis or capstone, ask PAGASA (CADS) whether they can provide the heat index forecast or station data for the Science City of Muñoz station in a machine-readable form. If they do, the ingest endpoint is where a script plugs in.

## Security

- Push tokens are encrypted at rest (AES-256-GCM) and looked up by a keyed hash. A database leak alone does not expose usable tokens.
- Each install gets a random API key; only its SHA-256 hash is stored. Admin routes need `ADMIN_API_KEY` (constant-time compare).
- Helmet headers, request size limits and rate limits are on. Settings and history are per device. Deleting a device removes its history.
- Public endpoints (`/api/dashboard`, `/api/forecast`, `/api/info`) return only public weather data.

## API summary

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | liveness and database check |
| `GET /api/dashboard`, `/api/forecast`, `/api/info` | none | app data and source descriptions |
| `POST /api/devices/register` | none (rate limited) | register an Expo push token, returns device credentials |
| `GET/PATCH/DELETE /api/devices/me` | device | read, change or delete settings |
| `GET /api/alerts` | device | alert history |
| `POST /api/devices/me/test-notification` | device | send a labelled test push (5 per hour) |
| `POST /api/admin/official-forecast` | admin key | load official PAGASA values |
| `POST /api/admin/run-check` | admin key | run a forecast check now |

## What has and has not been tested

Tested here: heat index math against NWS chart values; PAGASA categories; the 42/52 rules, de-duplication, escalation, updates and official confirmation (57 unit tests); the full pipeline against a real PostgreSQL with a fake push service (20 tests: registration, auth, settings, scheduling logic, failed sends, dead tokens, receipts, stale data, locking, deletion); the compiled production server; the app's logic in three time zones; and every screen rendered in light and dark mode with the real backend.

**Not tested, because it could not be from here:** a real iPhone (the screens were checked in a browser rendering, not on iOS), real Apple push delivery, the EAS build, and live calls to Open-Meteo (the build environment blocks outside APIs, so that provider was tested against recorded response shapes and a fake `fetch`). Test these first on your side: Open-Meteo returns data for CLSU on the first check, the test notification arrives, and a demo alert arrives with the app closed.

## Project layout

```
backend/   Express API, scheduler, alert engine, Postgres access, tests, Dockerfile
mobile/    Expo app (expo-router): Now, Forecast, Alerts, Settings, Sources, About
render.yaml                  Render blueprint for the backend
.github/workflows/           ci.yml (tests), pages.yml (web app on GitHub Pages), forecast-check.yml (15-minute backup trigger)
```

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0). This is an independent project, not an official PAGASA, DOST or CLSU application.
