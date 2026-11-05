// auth.js — Shared session guard for ArcVerse.
// Import this at the very top of every protected page script.

const ADMIN_TOKEN_KEY = "arcverse_admin_token";

/** Returns the stored JWT string or null. */
export function getSession() {
  try {
    return (
      localStorage.getItem(ADMIN_TOKEN_KEY) ||
      sessionStorage.getItem(ADMIN_TOKEN_KEY) ||
      null
    );
  } catch {
    return null;
  }
}

/** Returns true when the JWT is present and not expired. */
export function isSessionValid() {
  try {
    const token = getSession();
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearSession();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Clears the stored session token. */
export function clearSession() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem("arcverse_admin_auth");
  } catch {}
}

/**
 * Call at the top of every protected page.
 * If there is no valid session, redirects to /login.html immediately.
 * Returns true if session is valid (page may continue loading).
 */
export function requireAuth() {
  if (!isSessionValid()) {
    const dest = encodeURIComponent(location.pathname + location.search);
    location.replace("/login.html?next=" + dest);
    return false;
  }
  return true;
}

/** Sign the user out and return to the login page. */
export function logout() {
  const token = getSession();
  if (token) {
    fetch("/api/admin/logout", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    }).catch(() => {});
  }
  clearSession();
  location.replace("/login.html");
}
