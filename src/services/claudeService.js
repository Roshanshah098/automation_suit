const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const logger = require('../utils/logger');

// Lazily created so a missing/unfunded API key never breaks app startup —
// it's only needed the first time a real (non-mock) call is made.
let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

if (config.anthropic.mockMode) {
  logger.warn(
    'MOCK_MODE=true — Claude calls are simulated with canned responses. ' +
      'No API key needed, no cost. Set MOCK_MODE=false once you have credits.'
  );
}

/** Pulls the concatenated text out of a Messages API response. */
function textFromResponse(response) {
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/** Strips ```json fences if Claude wraps its JSON output in a code block. */
function parseJsonLoose(raw) {
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Rates a candidate's resume against a job description.
 * Mirrors the n8n "Using AI Analysis & Rating" node.
 */
async function rateCandidate({ resumeText, jobTitle, jobDescription }) {
  if (config.anthropic.mockMode) {
    const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
    return (
      `[MOCK RESPONSE — no API call made]\n` +
      `1. Compatibility Rating: 7/10 — resume (${wordCount} words) shows relevant experience for ` +
      `${jobTitle}, though depth against the full job description can't be verified in mock mode.\n` +
      `2. Recommendation: Interview — worth a screening call to confirm hands-on skills. ` +
      `(Set MOCK_MODE=false with a funded ANTHROPIC_API_KEY for a real assessment.)`
    );
  }

  const response = await getClient().messages.create({
    model: config.anthropic.ratingModel,
    max_tokens: 400,
    system:
      'You are an expert talent-acquisition analyst. Compare the candidate resume against the ' +
      'job description and return a structured, professional assessment in plain text (no markdown, ' +
      'no asterisks). Keep it under 120 words. Structure your answer as:\n' +
      '1. Compatibility Rating: X/10 — one sentence of rationale.\n' +
      '2. Recommendation: Interview / Do not interview — one sentence of rationale.',
    messages: [
      {
        role: 'user',
        content: `Job title: ${jobTitle}\n\nJob description:\n${jobDescription}\n\nCandidate resume:\n${resumeText}`,
      },
    ],
  });

  return textFromResponse(response);
}

/**
 * Extracts structured invoice data (header fields + line items) from raw PDF text.
 * Mirrors the n8n "Extract invoice details with AI" (Cradl AI) node, using Claude instead.
 */
async function extractInvoiceData(invoiceText) {
  if (config.anthropic.mockMode) {
    return {
      invoice_number: 'MOCK-0001',
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      vendor_name: '[MOCK] Sample Vendor Inc.',
      customer_name: '[MOCK] Your Company',
      currency: 'USD',
      total_amount: 100,
      invoice_lines: [
        { description: '[MOCK] Sample line item — no API call made', quantity: 1, unit_price: 100, line_total: 100 },
      ],
      _mock: true,
    };
  }

  const response = await getClient().messages.create({
    model: config.anthropic.extractionModel,
    max_tokens: 1500,
    system:
      'You extract structured data from invoice text. Respond with ONLY valid JSON, no prose, ' +
      'no markdown fences, matching exactly this shape:\n' +
      '{\n' +
      '  "invoice_number": string|null,\n' +
      '  "invoice_date": string|null,\n' +
      '  "due_date": string|null,\n' +
      '  "vendor_name": string|null,\n' +
      '  "customer_name": string|null,\n' +
      '  "currency": string|null,\n' +
      '  "total_amount": number|null,\n' +
      '  "invoice_lines": [\n' +
      '    { "description": string, "quantity": number|null, "unit_price": number|null, "line_total": number|null }\n' +
      '  ]\n' +
      '}\n' +
      'If a field cannot be found, use null. If no line items can be identified, return an empty array.',
    messages: [{ role: 'user', content: `Invoice text:\n${invoiceText}` }],
  });

  const raw = textFromResponse(response);
  try {
    return parseJsonLoose(raw);
  } catch (err) {
    logger.error('Failed to parse invoice JSON from Claude', { raw, err: err.message });
    return { invoice_number: null, invoice_lines: [], _raw: raw, _parseError: true };
  }
}

/**
 * Classifies an inbound webhook payload into a route + priority + summary.
 * Mirrors the n8n "Claude Classifier" + "Parse Classification" nodes.
 */
async function classifyRequest(payload, routes) {
  if (config.anthropic.mockMode) {
    // Cheap keyword heuristic so the router still "feels" real while mocked.
    const text = JSON.stringify(payload).toLowerCase();
    const guesses = [
      { route: 'support', keywords: ['refund', 'broken', 'issue', 'problem', 'help', 'bug', 'fail'] },
      { route: 'sales', keywords: ['price', 'pricing', 'demo', 'buy', 'quote', 'purchase'] },
      { route: 'technical', keywords: ['api', 'error', 'integration', 'code', 'webhook', 'server'] },
    ];
    const match = guesses.find((g) => routes.includes(g.route) && g.keywords.some((k) => text.includes(k)));
    const route = match ? match.route : routes[routes.length - 1] || 'general';

    return {
      route,
      priority: match ? 'medium' : 'low',
      summary: `[MOCK — no API call made] Heuristically routed to "${route}" based on keyword match.`,
    };
  }

  const response = await getClient().messages.create({
    model: config.anthropic.routerModel,
    max_tokens: 150,
    system:
      'You are a request classifier. Analyze the incoming request and respond with ONLY a JSON ' +
      `object: {"route": "<route_name>", "priority": "high|medium|low", "summary": "<one sentence>"}\n` +
      `Available routes: ${routes.join(', ')}`,
    messages: [{ role: 'user', content: `Classify this request: ${JSON.stringify(payload)}` }],
  });

  const raw = textFromResponse(response);
  try {
    const parsed = parseJsonLoose(raw);
    return {
      route: routes.includes(parsed.route) ? parsed.route : 'general',
      priority: ['high', 'medium', 'low'].includes(parsed.priority) ? parsed.priority : 'medium',
      summary: parsed.summary || '',
    };
  } catch (err) {
    logger.error('Failed to parse classification JSON from Claude', { raw, err: err.message });
    return { route: 'general', priority: 'medium', summary: 'Unable to classify' };
  }
}

module.exports = { rateCandidate, extractInvoiceData, classifyRequest };
