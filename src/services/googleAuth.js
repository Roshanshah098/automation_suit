const { google } = require('googleapis');
const config = require('../config');

let cachedClient = null;

/**
 * Returns a configured OAuth2 client, authenticated with the long-lived
 * refresh token generated via `npm run get-google-token`.
 * The same client is reused across Gmail and Sheets calls.
 */
function getAuthClient() {
  if (cachedClient) return cachedClient;

  const { clientId, clientSecret, redirectUri, refreshToken } = config.google;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Google credentials are missing. Fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ' +
        'GOOGLE_REFRESH_TOKEN in your .env file (see README.md → "Google setup").'
    );
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  client.setCredentials({ refresh_token: refreshToken });

  cachedClient = client;
  return client;
}

module.exports = { getAuthClient };
