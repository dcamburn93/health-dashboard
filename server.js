require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { fetchActivityDetail, upsertActivity } = require('./strava');

const app = express();
app.use(express.json({ limit: '500mb' }));

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.STRAVA_VERIFY_TOKEN;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

app.get('/webhook/strava', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.json({ 'hub.challenge': challenge });
  }
  res.status(403).send('Forbidden');
});

app.post('/webhook/strava', async (req, res) => {
  const event = req.body;
  res.status(200).send('OK');
  if (event.object_type !== 'activity') return;
  if (!['create', 'update'].includes(event.aspect_type)) return;
  try {
    const activity = await fetchActivityDetail(event.object_id);
    const ok = await upsertActivity(activity);
    if (ok) console.log('Strava synced:', activity.sport_type, activity.name);
  } catch (err) {
    console.error('Strava error:', err.message);
  }
});

app.post('/webhook/health', async (req, res) => {
  res.status(200).send('OK');
  const metrics = req.body?.data?.metrics || [];
  console.log('Apple Health received:', metrics.length, 'metrics');
  console.log('Metric names:', metrics.map(m => m.name).join(', '));

  for (const metric of metrics) {
    const name = metric.name;
    const data = metric.data || [];

    for (const entry of data) {
      const date = (entry.date || entry.startDate || '').slice(0, 10);
      if (!date) continue;
      const val = parseFloat(entry.qty ?? entry.value ?? 0);

      try {
        if (name === 'resting_heart_rate') {
          await supabase.from('heart_rate').upsert({ date, resting_hr: Math.round(val), source: 'apple_health' }, { onConflict: 'date' });

        } else if (name === 'heart_rate_variability') {
          await supabase.from('heart_rate').upsert({ date, hrv_ms: parseFloat(val.toFixed(2)), source: 'apple_health' }, { onConflict: 'date' });

        } else if (name === 'step_count' || name === 'steps') {
          await supabase.from('daily_activity').upsert({ date, steps: Math.round(val), source: 'apple_health' }, { onConflict: 'date' });

        } else if (name === 'active_energy') {
          await supabase.from('daily_activity').upsert({ date, active_calories: Math.round(val), source: 'apple_health' }, { onConflict: 'date' });

        } else if (name === 'basal_energy_burned') {
          await supabase.from('daily_activity').upsert({ date, total_calories: Math.round(val), source: 'apple_health' }, { onConflict: 'date' });

        } else if (name === 'flights_climbed') {
          await supabase.from('daily_activity').upsert({ date, flights_climbed: Math.round(val), source: 'apple_health' }, { onConflict: 'date' });

        } else if (name === 'apple_exercise_time') {
          await supabase.from('daily_activity').upsert({ date, exercise_minutes: Math.round(val), source: 'apple_health' }, { onConflict: 'date' });

        } else if (name === 'body_mass' || name === 'weight_body_mass') {
          await supabase.from('body_metrics').upsert({ date, weight_lbs: parseFloat((val * 2.20462).toFixed(2)), source: 'apple_health' }, { onConflict: 'date' });

        } else if (name === 'body_fat_percentage') {
          await supabase.from('body_metrics').upsert({ date, body_fat_pct: parseFloat((val * 100).toFixed(2)), source: 'apple_health' }, { onConflict: 'date' });

        } else if (name === 'vo2_max') {
          await supabase.from('body_metrics').upsert({ date, vo2_max: parseFloat(val.toFixed(2)), source: 'apple_health' }, { onConflict: 'date' });

        } else if (name === 'sleep_analysis') {
          if (entry.value !== 'ASLEEP' && entry.value !== 'INBED') continue;
          if (entry.value === 'INBED') {
            const dur = parseFloat(((new Date(entry.endDate) - new Date(entry.startDate)) / 3600000).toFixed(2));
            await supabase.from('sleep').upsert({ date, in_bed_h: dur, source: 'apple_health' }, { onConflict: 'date' });
          } else {
            const dur = parseFloat(((new Date(entry.endDate) - new Date(entry.startDate)) / 3600000).toFixed(2));
            await supabase.from('sleep').upsert({ date, duration_h: dur, source: 'apple_health' }, { onConflict: 'date' });
          }
        }
      } catch (err) {
        console.error(`Error writing ${name}:`, err.message);
      }
    }
  }
  console.log('Apple Health sync complete');
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
