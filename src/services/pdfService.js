const pdfParse = require('pdf-parse');

/**
 * Extracts plain text from a PDF file buffer.
 * Mirrors the n8n "Extract From File" (pdf operation) node.
 */
async function extractText(buffer) {
  const result = await pdfParse(buffer);
  return result.text.trim();
}

module.exports = { extractText };
