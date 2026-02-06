'use strict';

const crypto = require('crypto');

/**
 * Structured logger for repo-bridge.
 * Outputs JSON lines to stdout/stderr for easy parsing by log aggregators.
 * Every request gets a correlation ID for tracing.
 */

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info;

function generateRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

function formatEntry(level, message, context = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  });
}

function debug(message, context) {
  if (currentLevel <= LEVELS.debug) {
    process.stdout.write(formatEntry('debug', message, context) + '\n');
  }
}

function info(message, context) {
  if (currentLevel <= LEVELS.info) {
    process.stdout.write(formatEntry('info', message, context) + '\n');
  }
}

function warn(message, context) {
  if (currentLevel <= LEVELS.warn) {
    process.stderr.write(formatEntry('warn', message, context) + '\n');
  }
}

function error(message, context) {
  if (currentLevel <= LEVELS.error) {
    process.stderr.write(formatEntry('error', message, context) + '\n');
  }
}

/**
 * Serialize an error into a loggable object.
 * Captures status, message, code, and a truncated stack trace.
 */
function serializeError(err) {
  if (!err) return { error: 'unknown' };
  const out = {
    errorMessage: err.message || String(err),
  };
  if (err.status) out.httpStatus = err.status;
  if (err.code) out.errorCode = err.code;
  if (err.request?.url) out.requestUrl = err.request.url;
  if (err.response?.headers) {
    const h = err.response.headers;
    if (h['x-ratelimit-remaining']) out.rateLimitRemaining = h['x-ratelimit-remaining'];
    if (h['x-ratelimit-reset']) out.rateLimitReset = h['x-ratelimit-reset'];
    if (h['retry-after']) out.retryAfter = h['retry-after'];
  }
  if (err.stack) {
    // Keep first 5 lines of stack trace
    out.stack = err.stack.split('\n').slice(0, 5).join('\n');
  }
  return out;
}

module.exports = {
  generateRequestId,
  debug,
  info,
  warn,
  error,
  serializeError,
};
