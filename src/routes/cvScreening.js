const express = require('express');
const upload = require('../middleware/upload');
const config = require('../config');
const pdfService = require('../services/pdfService');
const claudeService = require('../services/claudeService');
const sheetsService = require('../services/sheetsService');
const gmailService = require('../services/gmailService');
const logger = require('../utils/logger');
const { broadcast } = require('../utils/activityBus');

const router = express.Router();

/**
 * POST /api/cv-screening
 * multipart/form-data fields: fullName, email, expectation, linkedin, resume (PDF file)
 *
 * Recreates the n8n "AI CV Screening Workflow":
 * Application Form -> Convert Binary to Json -> Using AI Analysis & Rating
 * -> Candidate Lists (Sheets) -> Inform HR -> Confirmation of CV Submission
 */
router.post('/', upload.single('resume'), async (req, res, next) => {
  try {
    const { fullName, email, expectation, linkedin } = req.body;
    if (!fullName || !email || !expectation || !linkedin) {
      return res.status(400).json({
        error: true,
        message: 'fullName, email, expectation and linkedin are all required fields.',
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: true, message: 'A "resume" PDF file is required.' });
    }

    broadcast('cv-screening', 'processing', `Application received from ${fullName}`, { fullName, email });

    // 1. Extract resume text from the uploaded PDF
    const resumeText = await pdfService.extractText(req.file.buffer);
    broadcast('cv-screening', 'processing', `Resume parsed (${resumeText.split(/\s+/).filter(Boolean).length} words)`);

    // 2. Ask Claude to rate the candidate against the job description
    const aiRating = await claudeService.rateCandidate({
      resumeText,
      jobTitle: config.cvScreening.jobTitle,
      jobDescription: config.cvScreening.jobDescription,
    });
    broadcast('cv-screening', 'processing', 'AI rating generated', { aiRating });

    // 3. Append a row to the candidates Google Sheet
    if (config.cvScreening.spreadsheetId) {
      await sheetsService.appendRow(config.cvScreening.spreadsheetId, config.cvScreening.sheetName, [
        req.file.originalname,
        fullName,
        email,
        expectation,
        linkedin,
        aiRating,
      ]);
      broadcast('cv-screening', 'processing', 'Saved to Google Sheet');
    } else {
      logger.warn('CV_SPREADSHEET_ID not set — skipping Google Sheets append.');
    }

    // 4. Notify HR
    if (config.cvScreening.hrEmail) {
      await gmailService.sendEmail({
        to: config.cvScreening.hrEmail,
        subject: 'New Candidate CV Awaiting Review',
        text:
          `Hello HR,\n\nA new CV has been successfully received in our system. ` +
          `Please review the candidate's details at your earliest convenience.\n\n` +
          `Candidate Name: ${fullName}\n` +
          `Candidate E-mail: ${email}\n` +
          `Candidate LinkedIn: ${linkedin}\n` +
          `Candidate Expectation: ${expectation}\n` +
          `Candidate AI Rating: ${aiRating}\n\n` +
          `Thank you for your attention.\n\nBest regards,\nAutomated CV Screening`,
      });
      broadcast('cv-screening', 'processing', 'HR notified by email');
    }
 
    // 5. Confirm receipt to the candidate
    await gmailService.sendEmail({
      to: email,
      subject: 'We Have Received Your CV',
      text:
        `Dear ${fullName},\n\nThank you for submitting your CV. We have received it and will ` +
        `review it shortly.\n\nBest regards,\nHiring Team`,
    });
    broadcast('cv-screening', 'success', `Done — ${fullName} screened and notified`, { fullName, email, aiRating });

    res.json({
      success: true,
      fullName,
      email,
      aiRating,
    });
  } catch (err) {
    broadcast('cv-screening', 'error', err.message);
    next(err);
  }
});

module.exports = router;
