const { google } = require('googleapis');
const { getAuthClient } = require('./googleAuth');
const logger = require('../utils/logger');

function getGmailClient() {
  const auth = getAuthClient();
  return google.gmail({ version: 'v1', auth });
}

function encodeBase64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Sends a plain-text email via the Gmail API.
 * Mirrors the n8n "Gmail" send-message nodes.
 */
async function sendEmail({ to, subject, text }) {
  const gmail = getGmailClient();

  const rawMessage = [
    `To: ${to}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    '',
    text,
  ].join('\n');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodeBase64Url(rawMessage) },
  });

  logger.info('Email sent', { to, subject, messageId: res.data.id });
  return res.data;
}

/**
 * Lists message IDs matching a Gmail search query
 * (e.g. "has:attachment subject:invoice is:unread").
 */
async function listMessages(query, maxResults = 20) {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
  return res.data.messages || [];
}

/** Fetches the full message (headers + MIME parts) for one message ID. */
async function getMessage(messageId) {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  return res.data;
}

/** Fetches raw attachment bytes given a message ID and attachment ID. */
async function getAttachment(messageId, attachmentId) {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  // Gmail attachment data is base64url encoded
  const buffer = Buffer.from(res.data.data, 'base64');
  return buffer;
}

/**
 * Walks a message's MIME parts and returns [{ filename, mimeType, attachmentId }]
 * for every PDF attachment found.
 */
function extractPdfAttachmentRefs(message) {
  const refs = [];

  function walk(part) {
    if (!part) return;
    const filename = part.filename || '';
    if (filename.toLowerCase().endsWith('.pdf') && part.body?.attachmentId) {
      refs.push({
        filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId,
      });
    }
    (part.parts || []).forEach(walk);
  }

  walk(message.payload);
  return refs;
}

/** Removes the UNREAD label, mirroring the n8n "Mark a message as read" node. */
async function markAsRead(messageId) {
  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
  logger.info('Marked message as read', { messageId });
}

module.exports = {
  sendEmail,
  listMessages,
  getMessage,
  getAttachment,
  extractPdfAttachmentRefs,
  markAsRead,
};
