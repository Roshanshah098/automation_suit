const express = require('express');
const config = require('../config');
const claudeService = require('../services/claudeService');
const logger = require('../utils/logger');
const { broadcast } = require('../utils/activityBus');

const router = express.Router();

/**
 * POST /api/ai-router
 * Recreates the n8n "Smart Webhook AI Router" workflow:
 * Incoming Webhook -> Claude Classifier -> Parse Classification -> Route Switch
 *                  -> Return Route Result
 *
 * Body can be any JSON payload (e.g. a support ticket, a lead form submission).
 * Response: { received, route, priority, summary }
 */
router.post('/', async (req, res, next) => {
  try {
    const payload = req.body && Object.keys(req.body).length > 0 ? req.body : req.query;
    broadcast('ai-router', 'processing', 'Classifying incoming request…');
    const classification = await claudeService.classifyRequest(payload, config.aiRouter.routes);

    logger.info('Classified webhook payload', classification);
    broadcast('ai-router', 'success', `Routed to "${classification.route}" (${classification.priority} priority)`, classification);

    // In n8n this fed a Switch node into per-route branches (CRM ticket,
    // Slack alert, etc). Add your own branch logic here, keyed on route:
    switch (classification.route) {
      case 'support':
        // e.g. create a helpdesk ticket
        break;
      case 'sales':
        // e.g. push a lead into a CRM
        break;
      case 'technical':
        // e.g. page on-call engineering
        break;
      default:
        // general / fallback
        break;
    }

    res.json({
      received: true,
      route: classification.route,
      priority: classification.priority,
      summary: classification.summary,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
