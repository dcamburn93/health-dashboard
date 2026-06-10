// token.js — manages Strava OAuth tokens
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, '.strava_token.json');

function loadToken() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveToken(token) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

async function getValidToken() {
  let token = loadToken();

  if (!token) {
    throw new Error('No Strava token found. Run: node authorize.js first.');
  }

  // Refresh if expired (with 5 min buffer)
  if (token.expires_at < Math.floor(Date.now() / 1000) + 300) {
    console.log('Refreshing Strava token...');
    const res = await axios.post('https://www.strava.com/oauth/token', {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    });
    token = res.data;
    saveToken(token);
    console.log('Token refreshed.');
  }

  return token.access_token;
}

module.exports = { getValidToken, saveToken, loadToken };
