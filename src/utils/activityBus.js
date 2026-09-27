const { EventEmitter } = require('events');

/**
 * A tiny in-memory pub/sub bus. Routes call broadcast() at each meaningful
 * step of a workflow; the SSE endpoint (src/routes/events.js) relays those
 * to any connected dashboard so a human can watch automation happen live.
 */
const bus = new EventEmitter();
bus.setMaxListeners(50);

/**
 * @param {string} workflow - 'cv-screening' | 'invoice-extraction' | 'ai-router'
 * @param {string} status - 'info' | 'processing' | 'success' | 'error'
 * @param {string} message - short human-readable description of what just happened
 * @param {object} [extra] - optional structured payload for the UI (e.g. route, rating)
 */
function broadcast(workflow, status, message, extra = {}) {
  const event = {
    workflow,
    status,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  bus.emit('activity', event);
  return event;
}

module.exports = { bus, broadcast };
