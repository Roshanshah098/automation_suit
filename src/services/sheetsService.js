const { google } = require('googleapis');
const { getAuthClient } = require('./googleAuth');
const logger = require('../utils/logger');

/**
 * Appends one row to the given spreadsheet/sheet.
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {Array<string|number>} rowValues - values in column order
 */
async function appendRow(spreadsheetId, sheetName, rowValues) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [rowValues] },
  });

  logger.info('Appended row to sheet', { spreadsheetId, sheetName, updates: res.data.updates });
  return res.data;
}

module.exports = { appendRow };
