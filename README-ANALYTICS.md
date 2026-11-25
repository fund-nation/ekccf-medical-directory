# Analytics setup — Vercel + Vercel KV

The directory's Admin panel can either show just your own browser's activity
(default, no setup needed) OR aggregate data from every visitor via a tiny
serverless backend hosted on Vercel. This file walks through the backend.

**End state:** every scroll, click, search, and section-view from every
visitor flows into a Redis list on Vercel's free tier. Opening Admin and
clicking "Pull from server" shows the aggregated dashboard.

## What's in the repo

- `api/track.js` — POST endpoint. Receives JSON events from the page and
  appends them to a Vercel KV list. CORS-open, no auth (it's a public
  collector, like any analytics tracker).
- `api/events.js` — GET endpoint. Returns recent events as JSON, gated by
  the `ADMIN_PASS` environment variable.
- `vercel.json` — tells Vercel the root is `index.html` and `/api/*` are
  serverless functions.
- `package.json` — declares `@vercel/kv` as the only dependency.

## One-time setup (~10 minutes)

### 1. Push this repo to Vercel

1. Create a free Vercel account at [vercel.com](https://vercel.com) using
   your GitHub login.
2. Click **Add New → Project**, pick `fund-nation/ekccf-medical-directory`,
   and import it. Leave all build settings at their defaults — Vercel
   detects the static HTML and the `api/` folder automatically.
3. Click **Deploy**. You'll get a URL like
   `https://ekccf-medical-directory.vercel.app`.

### 2. Create the KV store

1. In the Vercel dashboard, open your new project.
2. Click **Storage** in the top nav → **Create Database** → **KV**.
3. Name it something like `ekccf-analytics`, pick the region nearest Kern
   County (us-west-1 is good), click **Create**.
4. On the next screen click **Connect Project** and select this project.
   Leave the environment set to **All environments** and click **Connect**.
   This adds `KV_URL`, `KV_REST_API_URL`, and `KV_REST_API_TOKEN` to your
   project's environment variables.

### 3. Add your admin password as an env var

1. Project **Settings → Environment Variables**.
2. Add a new one:
   - Name: `ADMIN_PASS`
   - Value: the password you want. Use something strong — anyone who has
     it can read every visitor event. (This is **not** the same as the
     `ADMIN_PASS` constant inside `index.html` that gates the modal UI,
     but you probably want them to match.)
   - Environment: Production, Preview, Development.
3. Save.

### 4. Redeploy so the function picks up the env vars

Click **Deployments → ...** on the latest deployment → **Redeploy**.

### 5. Point the HTML at your deployment

In `index.html`, find the block near the bottom that looks like:

```js
const GA_ID = "";
const DEPLOY_URL = "";
```

Paste your Vercel URL between the DEPLOY_URL quotes (no trailing slash):

```js
const DEPLOY_URL = "https://ekccf-medical-directory.vercel.app";
```

Also make sure the `ADMIN_PASS` constant just below matches the one you
put in Vercel's env vars:

```js
const ADMIN_PASS = "the-same-password-you-set-in-vercel";
```

Commit and push. Vercel auto-deploys on push to main.

## How to use it

- Open the live site, scroll around, click some cards.
- Click **Admin** in the header, enter the password.
- Click **Pull from server (all visitors)**.
- The tiles and lists now reflect every visitor's activity.

## Costs & limits

- **Vercel Hobby plan** (free): 100 GB-hours of function execution, 100 GB
  bandwidth / month. The collector runs on the Edge runtime (cheap) and is
  tiny. You're not going to hit these on a resource-directory site.
- **Vercel KV free tier**: 3,000 requests/day, 256 MB storage. Each visitor
  generates ~5–15 events per session, so this covers roughly a thousand
  visitors/day comfortably. The collector auto-trims old events past 50,000.
- No credit card required for either.

## Security & privacy notes

- IP addresses are **not** stored raw. The collector hashes them server-side
  (SHA-1, truncated to 12 chars) so you can count unique devices without
  retaining personal data.
- The admin password sits in the published HTML (anyone viewing source can
  read it). That's fine for the modal gate, but the **`ADMIN_PASS`
  environment variable in Vercel is what actually protects
  `/api/events`** — rotate it in Vercel if you ever need to lock people
  out, and update `index.html` to match.
- The POST endpoint is intentionally open — any browser can send events to
  it, which is normal for analytics. If you want to lock it to your own
  domain only, add an `Access-Control-Allow-Origin` check in
  `api/track.js`.
- For public-health compliance (HIPAA, etc.): you're collecting pageview
  behavior, not PHI. No names, no diagnoses, no form submissions. Standard
  analytics-grade data.

## Troubleshooting

- **"Pull from server" returns 403.** `ADMIN_PASS` in Vercel doesn't match
  the one in `index.html`. Re-check both, redeploy after any change.
- **No events show up server-side.** Open the browser console on the live
  site and scroll — the beacon call is fire-and-forget so you won't see
  errors in the console, but the Vercel **Logs** tab for the `track`
  function will show incoming requests. If it's empty, `DEPLOY_URL` in the
  HTML is wrong or the deployment failed.
- **"kv error" on the response.** The KV store isn't connected to the
  project. Re-run step 2.4 ("Connect Project").
