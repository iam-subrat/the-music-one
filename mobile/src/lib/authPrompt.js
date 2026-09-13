/**
 * Helpers for identifying auth / token-expiration failures across all actions
 * and gracefully prompting the user to sign in again.
 */

export function isAuthError(err) {
  if (!err) return false;
  if (err.status === 401 || err.statusCode === 401) return true;
  const msg = err.message || String(err);
  return (
    msg.includes("Invalid token") ||
    msg.includes("Not authenticated") ||
    msg.includes("No refresh token") ||
    msg.includes("Refresh failed")
  );
}

let isPrompting = false;

export function promptSignIn(message, returnTo) {
  if (isPrompting) return;
  isPrompting = true;

  try {
    const defaultMsg = "Your session has expired. Would you like to sign in again?";
    if (window.confirm(message || defaultMsg)) {
      const target = returnTo
        ? `/login?next=${encodeURIComponent(returnTo)}`
        : "/login";
      window.location.href = target;
    }
  } finally {
    setTimeout(() => {
      isPrompting = false;
    }, 2000);
  }
}

