import { useNavigate } from "react-router-dom";

/**
 * Safe navigation utility for redirects.
 * Prevents open redirect vulnerabilities.
 */

const SAFE_REDIRECT_PATHS = {
  login: "/login",
  home: "/",
  dashboard: "/dashboard",
  notFound: "/404",
};

/**
 * Validates if a path is safe to redirect to.
 * Only allows internal paths, blocks external URLs.
 *
 * @param {string} path - Path to validate
 * @returns {boolean} Whether the path is safe
 */
export function isSafeRedirectPath(path) {
  if (!path) return false;

  // Block absolute URLs and protocol-relative URLs
  if (path.startsWith("//") || /^https?:\/\//.test(path)) {
    return false;
  }

  // Allow internal paths starting with /
  if (path.startsWith("/")) {
    return true;
  }

  return false;
}

/**
 * Safe redirect within the app.
 * Used for programmatic navigation.
 *
 * @param {string} path - Path to redirect to
 * @param {boolean} replace - Whether to replace history
 */
export function safeRedirect(path, replace = false) {
  if (!isSafeRedirectPath(path)) {
    console.warn("[SECURITY] Blocked unsafe redirect attempt:", path);
    // Fall back to home if path is unsafe
    window.location[replace ? "replace" : "href"] = SAFE_REDIRECT_PATHS.login;
    return;
  }

  window.location[replace ? "replace" : "href"] = path;
}

/**
 * React hook for safe navigation.
 */
export function useSafeNavigate() {
  const navigate = useNavigate();

  return (path, options = {}) => {
    if (!isSafeRedirectPath(path)) {
      console.warn("[SECURITY] Blocked unsafe navigation attempt:", path);
      // Fall back to home if path is unsafe
      navigate(SAFE_REDIRECT_PATHS.home, options);
      return;
    }

    navigate(path, options);
  };
}

export default {
  isSafeRedirectPath,
  safeRedirect,
  useSafeNavigate,
  SAFE_REDIRECT_PATHS,
};
