require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const FitParser = require('fit-file-parser').default;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const fitDir = process.argv[2] || '.';
console.log(`\nParsing Garmin FIT files from: ${fitDir}\n`);

const garminDaily = {};

function processFile(data, filename) {
  // WELLNESS files have stress + body_battery
  const stressRecords = data.stress || [];
  for (const r of stressRecords) {
    const ts = r.stress_level_time;
    if (!ts) continue;
    const date = new Date(ts).toISOString().slice(0, 10);
    if (!garminDaily[date]) garminDaily[date] = { stress: [], battery: [] };

    const sv = r.stress_level_value;
    // 65534 = invalid/no reading, skip those
    if (sv !== undefined && sv < 100 && sv >= 0) {
      garminDaily[date].stress.push(sv);
    }
    const bb = r.body_battery;
    if (bb !== undefined && bb > 0 && bb <= 100) {
      garminDaily[date].battery.push(bb);
    }
  }
}

const files = fs.readdirSync(fitDir).filter(f => f.toLowerCase().endsWith('.fit'));
console.log(`Found ${files.length} FIT files\n`);

let parsed = 0;
const parseNext = (index) => {
  if (index >= files.length) { uploadAll(); return; }
  const file = files[index];
  const buf = fs.readFileSync(path.join(fitDir, file));
  const parser = new FitParser({ force: true, mode: 'cascade' });
  parser.parse(buf, (err, data) => {
    if (!err && data) { processFile(data, file); parsed++; }
    parseNext(index + 1);
  });
};

parseNext(0);

async function uploadAll() {
  console.log(`Parsed ${parsed} files\nUploading...\n`);

  const rows = Object.entries(garminDaily).map(([date, d]) => ({
    date,
    stress_avg: d.stress.length ? Math.round(d.stress.reduce((a,b)=>a+b,0)/d.stress.length) : null,
    body_battery_max: d.battery.length ? Math.max(...d.battery) : null,
    body_battery_min: d.battery.length ? Math.min(...d.battery) : null,
    source: 'garmin'
  })).filter(r => r.stress_avg !== null || r.body_battery_max !== null);

  if (rows.length) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('garmin_daily').upsert(rows.slice(i,i+500), { onConflict: 'date' });
      if (error) console.error('Error:', error.message);
    }
    console.log(`garmin_daily: ${rows.length} rows uploaded`);
    rows.forEach(r => console.log(`  ${r.date} — stress avg: ${r.stress_avg}, battery: ${r.body_battery_min}–${r.body_battery_max}`));
  } else {
    console.log('No data found');
  }
  console.log('\nDone!\n');
}
