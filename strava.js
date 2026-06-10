// strava.js — fetches and maps Strava activities to DB format
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { getValidToken } = require('./token');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function mapActivity(a) {
  return {
    strava_id:       a.id,
    date:            a.start_date_local?.slice(0, 10),
    sport_type:      a.sport_type || a.type,
    name:            a.name,
    description:     a.description || null,
    duration_s:      a.moving_time,
    distance_m:      a.distance,
    elevation_m:     a.total_elevation_gain,
    avg_speed_ms:    a.average_speed,
    max_speed_ms:    a.max_speed,
    avg_hr:          a.average_heartrate || null,
    max_hr:          a.max_heartrate || null,
    avg_cadence:     a.average_cadence || null,
    calories:        a.calories || null,
    relative_effort: a.suffer_score || null,
    pr_count:        a.pr_count || 0,
    kudos_count:     a.kudos_count || 0,
    source:          'strava',
  };
}

async function upsertActivity(activity) {
  const row = mapActivity(activity);
  const { error } = await supabase
    .from('workouts')
    .upsert(row, { onConflict: 'strava_id' });

  if (error) {
    console.error(`Failed to upsert activity ${activity.id}:`, error.message);
    return false;
  }
  return true;
}

async function fetchActivityDetail(activityId) {
  const token = await getValidToken();
  const res = await axios.get(
    `https://www.strava.com/api/v3/activities/${activityId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

module.exports = { mapActivity, upsertActivity, fetchActivityDetail };
