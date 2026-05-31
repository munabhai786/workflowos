/**
 * Safe, production-ready logger for the frontend.
 * Never exposes raw error details to users.
 * Sanitizes messages before display.
 */

const isDevelopment = import.meta.env.DEV;

/**
 * Safely logs an error without exposing sensitive details.
 * In development, logs full error to console.
 * In production, only logs to console and captures for monitoring.
 *
 * @param {Error|string} error - The error to log
 * @param {string} context - What was happening when the error occurred
 * @param {Object} metadata - Additional context for debugging
 */
export function logError(error, context = "", metadata = {}) {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    context,
    isDevelopment,
    metadata,
  };

  // Extract error details safely
  if (error instanceof Error) {
    errorInfo.name = error.name;
    errorInfo.message = error.message;
    // Only include stack in development
    if (isDevelopment) {
      errorInfo.stack = error.stack;
    }
  } else if (typeof error === "string") {
    errorInfo.message = error;
  } else {
    errorInfo.message = String(error);
  }

  // Log to console in development
  if (isDevelopment) {
    console.error(`[${context}]`, error, metadata);
  } else {
    // In production, use a minimal console.error
    console.error(`[ERROR] ${context}:`, errorInfo.message);
  }

  // TODO: Send to error monitoring service (Sentry, etc.)
  // if (!isDevelopment) {
  //   captureException(error, { contexts: { errorInfo } });
  // }

  return errorInfo;
}

/**
 * Safely logs a warning without exposing sensitive details.
 *
 * @param {string} message - The warning message
 * @param {string} context - What was happening
 * @param {Object} metadata - Additional context
 */
export function logWarning(message, context = "", metadata = {}) {
  if (isDevelopment) {
    console.warn(`[${context}]`, message, metadata);
  }
}

/**
 * Safely logs debug information (development only).
 *
 * @param {string} message - The debug message
 * @param {Object} data - Debug data to log
 */
export function logDebug(message, data = {}) {
  if (isDevelopment) {
    console.log(`[DEBUG]`, message, data);
  }
}

/**
 * Gets a safe user-friendly message for an error.
 * Returns a message suitable for display in the UI.
 *
 * @param {Error|Object} error - The error object
 * @param {string} fallback - Fallback message if we can't determine the error
 * @returns {string} Safe message for the user
 */
export function getSafeErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  // Check for API error with message
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  // Check for API error with detail
  if (error?.response?.data?.detail?.message) {
    return error.response.data.detail.message;
  }

  // Check for network timeout
  if (error?.code === "ECONNABORTED") {
    return "The request took too long. Please try again.";
  }

  // Check for no network connection
  if (!error?.response && error?.message !== "Request failed with status code 401") {
    return "Unable to reach the server. Please try again.";
  }

  // Return fallback
  return fallback;
}

/**
 * Safe alert that logs and shows user-friendly error.
 *
 * @param {Error|string} error - The error
 * @param {string} context - What was happening
 * @param {string} userMessage - Optional custom user message
 */
export function safeAlert(error, context = "Unknown error", userMessage = null) {
  logError(error, context);

  const message = userMessage || getSafeErrorMessage(error);
  // Note: This is typically called from within a catch block
  // The caller should handle displaying the message (toast, etc)
  return message;
}

export default {
  logError,
  logWarning,
  logDebug,
  getSafeErrorMessage,
  safeAlert,
};
