require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function upload(table, rows, conflict) {
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await supabase.from(table).upsert(rows.slice(i,i+300), { onConflict: conflict });
    if (error) console.error(`${table} error:`, error.message);
  }
  console.log(`✓ ${table}: ${rows.length} rows`);
}

async function run() {
  const sleep = require('./garmin-sleep.json');
  const health = require('./garmin-health.json');
  console.log('Uploading Garmin data to Supabase...\n');
  await upload('sleep', sleep, 'date');
  await upload('heart_rate', health, 'date');
  console.log('\nDone! Refresh your dashboard.');
}
run().catch(console.error);
