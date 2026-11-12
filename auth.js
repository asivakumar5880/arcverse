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

export function clearSession() {
  try {
    const keys = [
      ADMIN_TOKEN_KEY,
      "arcverse_admin_auth",
      "arcverse_admin_email",
      "arcverse_user_name",
      "arcverse_remember_email",
      "arcverse_lockout",
      "homeState",
      "selectedAnimeId",
      "selectedAnimeBanner",
    ];
    for (const k of keys) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
  } catch {}
}

/** Returns a URL with the correct Vite base prefix (e.g. /arcverse/index.html) */
export function getAppUrl(path = "") {
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : base + "/";
  const cleanPath = path.startsWith("./") ? path.slice(2) : path.startsWith("/") ? path.slice(1) : path;
  return cleanBase + cleanPath;
}

/**
 * Call on protected pages.
 * If there is no valid session, redirects to login.html with next parameter.
 * Returns true if session is valid.
 */
export function requireAuth() {
  if (!isSessionValid()) {
    const dest = encodeURIComponent(location.pathname + location.search);
    location.replace(getAppUrl("login.html?next=" + dest));
    return false;
  }
  return true;
}

/** Sign the user out and return to the home page. */
export function logout() {
  const token = getSession();
  if (token) {
    fetch("/api/admin/logout", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    }).catch(() => {});
  }
  clearSession();
  location.replace(getAppUrl("index.html"));
}
