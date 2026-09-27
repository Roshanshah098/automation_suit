const cron = require('node-cron');
const config = require('../config');
const { runInvoiceExtraction } = require('../routes/invoiceExtraction');
const logger = require('../utils/logger');

/** Starts a minute-by-minute Gmail poll, mirroring the n8n "everyMinute" trigger. */
function startInvoicePoller() {
  if (!config.invoiceExtraction.pollerEnabled) {
    logger.info('Invoice poller disabled (ENABLE_INVOICE_POLLER=false).');
    return;
  }

  logger.info('Starting invoice poller (every minute)...');
  cron.schedule('* * * * *', async () => {
    try {
      const summary = await runInvoiceExtraction();
      if (summary.messagesProcessed > 0) {
        logger.info('Invoice poller run complete', summary);
      }
    } catch (err) {
      logger.error('Invoice poller run failed', err.message);
    }
  });
}

module.exports = { startInvoicePoller };
