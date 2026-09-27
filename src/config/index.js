require('dotenv').config();

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  return value;
}

module.exports = {
  port: Number(process.env.PORT) || 3000,

  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    ratingModel: required('CLAUDE_RATING_MODEL', 'claude-sonnet-5'),
    extractionModel: required('CLAUDE_EXTRACTION_MODEL', 'claude-sonnet-5'),
    routerModel: required('CLAUDE_ROUTER_MODEL', 'claude-haiku-4-5-20251001'),
    // When true, no real API calls are made — every Claude-powered step returns
    // canned sample output instead. Lets you test the whole app for free.
    mockMode: required('MOCK_MODE', 'false') === 'true',
  },

  google: {
    clientId: required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
    redirectUri: required('GOOGLE_REDIRECT_URI', 'http://localhost:3000/oauth2callback'),
    refreshToken: required('GOOGLE_REFRESH_TOKEN'),
  },

  cvScreening: {
    spreadsheetId: required('CV_SPREADSHEET_ID'),
    sheetName: required('CV_SHEET_NAME', 'Sheet1'),
    hrEmail: required('HR_EMAIL'),
    jobTitle: required('JOB_TITLE', 'Software Engineer'),
    jobDescription: required('JOB_DESCRIPTION', ''),
  },

  invoiceExtraction: {
    spreadsheetId: required('INVOICE_SPREADSHEET_ID'),
    sheetName: required('INVOICE_SHEET_NAME', 'Sheet1'),
    gmailQuery: required('INVOICE_GMAIL_QUERY', 'has:attachment subject:invoice is:unread'),
    pollerEnabled: required('ENABLE_INVOICE_POLLER', 'false') === 'true',
  },

  aiRouter: {
    routes: (required('AI_ROUTER_ROUTES', 'support,sales,technical,general'))
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  },
};
