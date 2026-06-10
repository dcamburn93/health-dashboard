# Health Dashboard — Backend Setup

## What this does
- **backfill.js** — imports your entire Strava history into Supabase (run once)
- **server.js** — listens for new Strava activities and syncs them automatically
- **authorize.js** — one-time Strava OAuth setup

---

## Prerequisites
- Node.js installed (check: `node --version`)
- If not installed: https://nodejs.org → download the LTS version

---

## Setup (do this once)

### 1. Install dependencies
```bash
cd health-dashboard
npm install
```

### 2. Authorize with Strava
```bash
node authorize.js
```
- Copy the URL it prints and open it in your browser
- Click "Authorize" on Strava
- You'll be redirected to localhost — the script catches it automatically
- You should see "✅ Token saved!" in the terminal

### 3. Backfill your Strava history
```bash
node backfill.js
```
- This imports every activity you've ever logged on Strava
- Takes a few minutes depending on how many activities you have
- You'll see each one printed as it imports

### 4. Start the webhook server
```bash
node server.js
```
- Leave this running in the background
- Every time you finish a workout and sync to Strava, it'll appear in your database within seconds

---

## Exposing the webhook (so Strava can reach your laptop)

Strava needs to send events to your server, but your laptop isn't publicly accessible.
Use **ngrok** (free) to create a temporary public URL:

### Install ngrok
https://ngrok.com/download — download and install

### Run ngrok
```bash
ngrok http 3000
```
It'll give you a URL like: `https://abc123.ngrok-free.app`

### Register your webhook with Strava
Run this in a new terminal (replace YOUR_NGROK_URL):
```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=257067 \
  -d client_secret=5d28f89ce72121719f5377816fb179ca676910e0 \
  -d callback_url=YOUR_NGROK_URL/webhook/strava \
  -d verify_token=health_dash_verify_2026
```

You should get back a subscription ID — save it.

---

## Adding Apple Health data (Health Auto Export app)

1. Download **Health Auto Export** from the App Store
2. Open app → Export → Webhook
3. Set the webhook URL to: `YOUR_NGROK_URL/webhook/health`
4. Select metrics: Sleep, Heart Rate, HRV, Steps, Active Calories, Weight
5. Set schedule: daily at 6am

(The webhook handler for this will be added in the next step)

---

## Checking your data

Go to your Supabase dashboard → Table Editor → workouts
You should see all your Strava activities there.

Or run a quick check:
```
https://csylhxbnpqsfwicqrsex.supabase.co/rest/v1/workouts?select=date,sport_type,name&order=date.desc&limit=10
```
(Add header: `apikey: sb_publishable_sWgNLaMZQba18okU49M--A_eIYijz2v`)
