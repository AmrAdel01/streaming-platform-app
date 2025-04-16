const sanitizeHtml = require("sanitize-html");

const sanitizeInput = (input, allowFormatting = false) => {
  if (!input) return input;
  const options = allowFormatting
    ? {
        allowedTags: ["b", "i", "strong", "em"], // Allow basic formatting
        allowedAttributes: {}, // No attributes
        disallowedTagsMode: "discard",
      }
    : {
        allowedTags: [], // No tags
        allowedAttributes: {},
        disallowedTagsMode: "discard",
      };
  return sanitizeHtml(input, options).trim();
};

const sanitizeObject = (obj, allowFormatting = false) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizeInput(value, allowFormatting);
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeObject(value, allowFormatting);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

module.exports = { sanitizeInput, sanitizeObject };
