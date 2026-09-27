const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

const cvScreeningRoute = require('./routes/cvScreening');
const { router: invoiceExtractionRoute } = require('./routes/invoiceExtraction');
const aiRouterRoute = require('./routes/aiRouter');
const eventsRoute = require('./routes/events');
const { startInvoicePoller } = require('./jobs/invoicePoller');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Workflow 1: AI CV Screening (was n8n "AI CV Screening Workflow")
app.use('/api/cv-screening', cvScreeningRoute);

// Workflow 2: Invoice data extraction (was n8n "Invoice data extraction ... Cradl AI")
app.use('/api/invoice-extraction', invoiceExtractionRoute);

// Workflow 3: Smart Webhook AI Router (was n8n "Claude Smart Webhook AI Router")
app.use('/api/ai-router', aiRouterRoute);

// Live activity feed for the dashboard (Server-Sent Events)
app.use('/api/events', eventsRoute);

app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`Claude Automation Suite listening on http://localhost:${config.port}`);
  logger.info(`  CV screening form:  http://localhost:${config.port}/cv-screening-form.html`);
  logger.info(`  Health check:       GET  /health`);
  logger.info(`  CV screening:       POST /api/cv-screening`);
  logger.info(`  Invoice run:        POST /api/invoice-extraction/run`);
  logger.info(`  AI router:          POST /api/ai-router`);
  startInvoicePoller();
});
