// backfill.js — imports your full Strava history into Supabase
// Run once: node backfill.js
require('dotenv').config();
const axios = require('axios');
const { getValidToken } = require('./token');
const { upsertActivity } = require('./strava');

async function backfill() {
  console.log('\n📦 Starting Strava backfill...\n');

  const token = await getValidToken();
  let page = 1;
  let total = 0;
  let failed = 0;

  while (true) {
    console.log(`Fetching page ${page}...`);

    let activities;
    try {
      const res = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          per_page: 100,
          page,
        },
      });
      activities = res.data;
    } catch (err) {
      console.error('Failed to fetch activities:', err.message);
      break;
    }

    if (!activities || activities.length === 0) {
      console.log('No more activities found.');
      break;
    }

    console.log(`  → Got ${activities.length} activities, upserting...`);

    for (const activity of activities) {
      const ok = await upsertActivity(activity);
      if (ok) {
        total++;
        const dist = activity.distance > 0
          ? `${(activity.distance / 1609.34).toFixed(1)} mi`
          : '';
        console.log(`  ✓ ${activity.start_date_local?.slice(0,10)} — ${activity.sport_type} ${activity.name} ${dist}`);
      } else {
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 50));
    }

    page++;

    // Strava rate limit: 100 requests/15min, 1000/day
    // Add a pause every 5 pages
    if (page % 5 === 0) {
      console.log('  Pausing 2s for rate limits...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\n✅ Backfill complete!`);
  console.log(`   ${total} activities imported`);
  if (failed > 0) console.log(`   ${failed} failed (check errors above)`);
  console.log('\nNow run: node server.js\n');
}

backfill().catch(err => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
