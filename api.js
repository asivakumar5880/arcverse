// api.js — Shared AniList GraphQL helper with cache, retry, and rate-limit handling.

const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Inline SVG placeholder shown when an image permanently fails to load.
export const PLACEHOLDER_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">' +
      '<rect width="300" height="450" fill="#1a1a2e"/>' +
      '<text x="150" y="225" font-family="sans-serif" font-size="20" fill="#4a4a6a" ' +
      'text-anchor="middle" dominant-baseline="middle">No Image</text></svg>'
  );

export const PLACEHOLDER_SQUARE_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">' +
      '<rect width="300" height="300" fill="#1a1a2e"/>' +
      '<text x="150" y="150" font-family="sans-serif" font-size="20" fill="#4a4a6a" ' +
      'text-anchor="middle" dominant-baseline="middle">No Image</text></svg>'
  );

/**
 * Escape arbitrary text for safe insertion into innerHTML (prevents XSS).
 */
export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strip HTML tags from AniList description strings (they contain <br>, <i>, etc).
 */
export function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * sessionStorage-backed cache. Keyed by query+variables. 10-minute expiry.
 * Wrapped in try/catch so private-mode browsers don't crash.
 */
function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.t > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function cacheSet(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

function cacheKey(query, variables) {
  return "ali:" + JSON.stringify({ q: query, v: variables });
}

/**
 * Core GraphQL request with:
 *  - up to 3 retries with exponential backoff
 *  - HTTP 429 rate-limit handling (honors Retry-After header)
 *  - sessionStorage cache (10 min)
 * Returns the parsed `data` object, or throws on terminal failure.
 */
export async function anilistQuery(query, variables = {}, signal = null) {
  const key = cacheKey(query, variables);
  const cached = cacheGet(key);
  if (cached) return cached;

  const body = JSON.stringify({ query, variables });
  let lastError;

  for (let attempt = 0; attempt < 3; attempt++) {
    // Bail immediately if aborted between retries
    if (signal?.aborted) throw new DOMException("AbortError", "AbortError");

    try {
      const res = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
        signal,
      });

      // Rate limited — read Retry-After (seconds), wait, then retry.
      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get("Retry-After") || "1");
        await sleep(Math.max(retryAfter, 0.5) * 1000);
        continue; // doesn't consume a normal attempt
      }

      if (!res.ok) {
        throw new Error(`AniList HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.errors && json.errors.length) {
        throw new Error(json.errors.map((e) => e.message).join("; "));
      }
      cacheSet(key, json.data);
      return json.data;
    } catch (err) {
      lastError = err;
      // Exponential backoff: ~0.5s, ~1s, ~2s before final give-up.
      if (attempt < 2) {
        await sleep(500 * Math.pow(2, attempt));
      }
    }
  }

  console.error("[ArcVerse AniList API Error]", lastError);
  throw lastError || new Error("AniList request failed");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ *
 * Reusable GraphQL fragments
 * ------------------------------------------------------------------ */

export const MEDIA_CARD_FIELDS = `
  fragment CardFields on Media {
    id
    title { romaji english }
    coverImage { extraLarge large medium }
    bannerImage
    averageScore
    episodes
    format
    isAdult
  }
`;

export const MEDIA_DETAIL_FIELDS = `
  fragment DetailFields on Media {
    id
    idMal
    title { romaji english native }
    description(asHtml: false)
    coverImage { extraLarge large medium }
    bannerImage
    averageScore
    meanScore
    status
    episodes
    season
    seasonYear
    format
    duration
    source
    genres
    studios(isMain: true) { nodes { name } }
  }
`;

/* ------------------------------------------------------------------ *
 * Image helper: pick the first available size from a list of fields.
 * Returns null if none exist.
 * ------------------------------------------------------------------ */
export function pickImage(cover) {
  if (!cover) return null;
  return cover.extraLarge || cover.large || cover.medium || null;
}
