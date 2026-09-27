const express = require('express');
const { bus } = require('../utils/activityBus');

const router = express.Router();

/**
 * GET /api/events
 * Server-Sent Events stream. The dashboard opens this once on load and
 * receives a live feed of every workflow action as it happens.
 */
router.get('/', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  send({
    workflow: 'system',
    status: 'info',
    message: 'Connected — watching for activity.',
    timestamp: new Date().toISOString(),
  });

  const listener = (event) => send(event);
  bus.on('activity', listener);

  // Keep the connection alive through proxies/idle timeouts.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('activity', listener);
  });
});

module.exports = router;
