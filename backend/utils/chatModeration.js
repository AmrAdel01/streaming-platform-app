const axios = require("axios");

// Basic regex patterns for common inappropriate content
const PROFANITY_PATTERNS = [
  /\b(bad_word1|bad_word2|bad_word3)\b/gi,
  /(https?:\/\/[^\s]+)/g, // URLs
  /<[^>]*>/g, // HTML tags
];

// Configuration for Perspective API
const PERSPECTIVE_API_KEY = process.env.PERSPECTIVE_API_KEY;
const PERSPECTIVE_API_URL =
  "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze";

class ChatModeration {
  constructor() {
    this.isPerspectiveEnabled = !!PERSPECTIVE_API_KEY;
  }

  // Basic regex-based filtering
  filterBasicContent(message) {
    let filteredMessage = message;

    // Apply regex patterns
    PROFANITY_PATTERNS.forEach((pattern) => {
      filteredMessage = filteredMessage.replace(pattern, "[REDACTED]");
    });

    // Remove excessive whitespace
    filteredMessage = filteredMessage.trim().replace(/\s+/g, " ");

    return filteredMessage;
  }

  // Check message length
  validateMessageLength(message, maxLength = 500) {
    return message.length <= maxLength;
  }

  // Check for spam patterns
  detectSpam(message, recentMessages = []) {
    // Check for repeated characters
    if (/(.)\1{4,}/.test(message)) {
      return true;
    }

    // Check for repeated messages
    if (recentMessages.includes(message)) {
      return true;
    }

    // Check for excessive caps
    const upperCaseRatio =
      message.replace(/[^a-zA-Z]/g, "").length / message.length;
    if (upperCaseRatio > 0.7) {
      return true;
    }

    return false;
  }

  // Advanced content analysis using Perspective API
  async analyzeWithPerspective(message) {
    if (!this.isPerspectiveEnabled) {
      return { isToxic: false, confidence: 0 };
    }

    try {
      const response = await axios.post(
        `${PERSPECTIVE_API_URL}?key=${PERSPECTIVE_API_KEY}`,
        {
          comment: { text: message },
          languages: ["en"],
          requestedAttributes: {
            TOXICITY: {},
            SEVERE_TOXICITY: {},
            IDENTITY_ATTACK: {},
            THREAT: {},
          },
        }
      );

      const attributes = response.data.attributeScores;
      const toxicityScore = attributes.TOXICITY.summaryScore.value;
      const severeToxicityScore = attributes.SEVERE_TOXICITY.summaryScore.value;
      const identityAttackScore = attributes.IDENTITY_ATTACK.summaryScore.value;
      const threatScore = attributes.THREAT.summaryScore.value;

      // Consider message toxic if any score exceeds threshold
      const isToxic =
        toxicityScore > 0.7 ||
        severeToxicityScore > 0.7 ||
        identityAttackScore > 0.7 ||
        threatScore > 0.7;

      return {
        isToxic,
        confidence: Math.max(
          toxicityScore,
          severeToxicityScore,
          identityAttackScore,
          threatScore
        ),
      };
    } catch (error) {
      console.error("Perspective API error:", error.message);
      return { isToxic: false, confidence: 0 };
    }
  }

  // Main moderation function
  async moderateMessage(message, recentMessages = []) {
    // Basic validation
    if (!this.validateMessageLength(message)) {
      return {
        isAllowed: false,
        reason: "Message too long",
        moderatedMessage: null,
      };
    }

    // Check for spam
    if (this.detectSpam(message, recentMessages)) {
      return {
        isAllowed: false,
        reason: "Spam detected",
        moderatedMessage: null,
      };
    }

    // Basic content filtering
    const filteredMessage = this.filterBasicContent(message);
    if (filteredMessage !== message) {
      return {
        isAllowed: true,
        reason: "Content filtered",
        moderatedMessage: filteredMessage,
      };
    }

    // Advanced content analysis
    const analysis = await this.analyzeWithPerspective(message);
    if (analysis.isToxic) {
      return {
        isAllowed: false,
        reason: "Toxic content detected",
        moderatedMessage: null,
      };
    }

    return {
      isAllowed: true,
      reason: "Message approved",
      moderatedMessage: message,
    };
  }
}

module.exports = new ChatModeration();
