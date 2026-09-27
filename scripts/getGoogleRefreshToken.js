/**
 * Run this once locally: `npm run get-google-token`
 *
 * It prints a Google consent URL. Open it, log in, approve access, and you'll
 * be redirected to GOOGLE_REDIRECT_URI with a "?code=..." query param.
 * Paste that code back into the terminal when prompted, and this script will
 * print a refresh token to copy into your .env as GOOGLE_REFRESH_TOKEN.
 */
require('dotenv').config();
const readline = require('readline');
const { google } = require('googleapis');

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env first.');
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets',
];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // forces a refresh_token to be issued every time
  scope: SCOPES,
});

console.log('\n1. Open this URL in your browser and approve access:\n');
console.log(authUrl);
console.log('\n2. Paste the "code" query param from the redirect URL below.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Code: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oAuth2Client.getToken(code.trim());
    console.log('\nSuccess! Add this to your .env file:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('');
  } catch (err) {
    console.error('Failed to exchange code for tokens:', err.message);
    process.exit(1);
  }
});
