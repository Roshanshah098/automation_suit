const express = require('express');
const config = require('../config');
const gmailService = require('../services/gmailService');
const pdfService = require('../services/pdfService');
const claudeService = require('../services/claudeService');
const sheetsService = require('../services/sheetsService');
const logger = require('../utils/logger');
const { broadcast } = require('../utils/activityBus');

const router = express.Router();

/**
 * Fetches unread invoice emails, extracts PDF attachments, asks Claude to
 * structure the data, appends one Google Sheets row per line item, then
 * marks the source email as read.
 *
 * Recreates the n8n "PDF invoice data extraction" workflow:
 * Gmail Trigger -> Filter PDF attachments -> Extract invoice details with AI
 * -> Split out each invoice line -> Add invoice line to Google Sheets
 * (+ Mark a message as read)
 */
async function runInvoiceExtraction() {
  const summary = { messagesProcessed: 0, linesWritten: 0, errors: [] };

  broadcast('invoice-extraction', 'processing', 'Checking Gmail for new invoices…');
  const messages = await gmailService.listMessages(config.invoiceExtraction.gmailQuery);
  if (messages.length === 0) {
    logger.info('No matching invoice emails found.');
    broadcast('invoice-extraction', 'info', 'No new invoice emails found.');
    return summary;
  }
  broadcast('invoice-extraction', 'processing', `Found ${messages.length} matching email(s)`);

  for (const { id: messageId } of messages) {
    try {
      const message = await gmailService.getMessage(messageId);
      const pdfRefs = gmailService.extractPdfAttachmentRefs(message);

      if (pdfRefs.length === 0) {
        logger.warn('Message matched query but had no PDF attachment, skipping.', { messageId });
        continue;
      }

      for (const ref of pdfRefs) {
        broadcast('invoice-extraction', 'processing', `Reading attachment: ${ref.filename}`);
        const buffer = await gmailService.getAttachment(messageId, ref.attachmentId);
        const text = await pdfService.extractText(buffer);
        const extracted = await claudeService.extractInvoiceData(text);
        broadcast('invoice-extraction', 'processing', `Extracted invoice ${extracted.invoice_number || '(no number)'}`);

        const lines = Array.isArray(extracted.invoice_lines) && extracted.invoice_lines.length > 0
          ? extracted.invoice_lines
          : [{ description: '(no line items detected)', quantity: null, unit_price: null, line_total: null }];

        if (config.invoiceExtraction.spreadsheetId) {
          for (const line of lines) {
            await sheetsService.appendRow(
              config.invoiceExtraction.spreadsheetId,
              config.invoiceExtraction.sheetName,
              [
                extracted.invoice_number,
                extracted.invoice_date,
                extracted.due_date,
                extracted.vendor_name,
                extracted.customer_name,
                extracted.currency,
                extracted.total_amount,
                line.description,
                line.quantity,
                line.unit_price,
                line.line_total,
                ref.filename,
              ]
            );
            summary.linesWritten += 1;
          }
        } else {
          logger.warn('INVOICE_SPREADSHEET_ID not set — skipping Google Sheets append.');
        }
      }

      await gmailService.markAsRead(messageId);
      summary.messagesProcessed += 1;
      broadcast('invoice-extraction', 'success', 'Invoice saved to sheet, email marked read');
    } catch (err) {
      logger.error('Failed to process invoice message', { messageId, err: err.message });
      summary.errors.push({ messageId, error: err.message });
      broadcast('invoice-extraction', 'error', err.message);
    }
  }

  return summary;
}

/** POST /api/invoice-extraction/run — manually trigger one polling pass. */
router.post('/run', async (req, res, next) => {
  try {
    const summary = await runInvoiceExtraction();
    res.json({ success: true, ...summary });
  } catch (err) {
    next(err);
  }
});

router.get('/status', (req, res) => {
  res.json({
    pollerEnabled: config.invoiceExtraction.pollerEnabled,
    gmailQuery: config.invoiceExtraction.gmailQuery,
    spreadsheetConfigured: Boolean(config.invoiceExtraction.spreadsheetId),
  });
});

module.exports = { router, runInvoiceExtraction };
