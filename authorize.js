// authorize.js — run once to get your Strava OAuth token
// Usage: node authorize.js
require('dotenv').config();
const axios = require('axios');
const http = require('http');
const { saveToken } = require('./token');

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/auth/callback';

const authUrl = `https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&approval_prompt=force&scope=read,activity:read_all`;

console.log('\n🏃 Strava Authorization\n');
console.log('1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Authorize the app — you\'ll be redirected to localhost');
console.log('3. This script will automatically capture the token\n');

// Temporary server to catch the OAuth callback
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/auth/callback')) return;

  const url = new URL(req.url, 'http://localhost:3000');
  const code = url.searchParams.get('code');

  if (!code) {
    res.end('Error: no code received');
    return;
  }

  try {
    const tokenRes = await axios.post('https://www.strava.com/oauth/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });

    saveToken(tokenRes.data);

    res.end('<h2>✅ Authorization successful!</h2><p>You can close this tab and go back to the terminal.</p>');
    console.log('✅ Token saved! You can now run:');
    console.log('   node backfill.js   — to import all your Strava history');
    console.log('   node server.js     — to start the webhook listener\n');

    server.close();
  } catch (err) {
    res.end('Error exchanging token: ' + err.message);
    console.error('Token exchange failed:', err.message);
    server.close();
  }
});

server.listen(3000, () => {
  console.log('Waiting for Strava redirect on http://localhost:3000...\n');
});
