// episodeStore.js — ArcVerse Episode Store
// Stores verified anime season and episode metadata.

const STORAGE_KEY = "arcverse_anime_data_v1";
const ADMIN_TOKEN_KEY = "arcverse_admin_token";
const ADMIN_AUTH_KEY = "arcverse_admin_auth";

/* ===================== ADMIN AUTHENTICATION ===================== */

export function getAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function isAdmin() {
  try {
    const token = getAdminToken();
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        clearAdminToken();
        return false;
      }
      return payload.role === "admin";
    }
    return false;
  } catch {
    return false;
  }
}

export function setAdminToken(token) {
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      localStorage.setItem(ADMIN_AUTH_KEY, "true");
      window.dispatchEvent(new CustomEvent("arcverse_admin_change", { detail: { isAdmin: true } }));
    } else {
      clearAdminToken();
    }
  } catch {}
}

export function clearAdminToken() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.dispatchEvent(new CustomEvent("arcverse_admin_change", { detail: { isAdmin: false } }));
  } catch {}
}

export async function loginAdmin(password) {
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.token) {
      setAdminToken(data.token);
      return { success: true };
    }
    return {
      success: false,
      error: data.error || (res.status === 429 ? "Too many attempts. Locked for 15 minutes." : "Incorrect password"),
      status: res.status,
    };
  } catch {
    return { success: false, error: "Network error during authentication." };
  }
}

export async function logoutAdmin() {
  const token = getAdminToken();
  try {
    await fetch("/api/admin/logout", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {}
  clearAdminToken();
}

export async function verifyAdminSession() {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const res = await fetch("/api/admin/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return Boolean(data.valid);
    }
    clearAdminToken();
    return false;
  } catch {
    return isAdmin();
  }
}

/* ===================== EPISODES STORE ===================== */

function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDB(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Error writing episode store:", err);
  }
}

export function ensureAnimeSeed(animeId, animeTitle = "Anime", totalEpisodes = 12, bannerUrl = "", coverUrl = "") {
  const db = loadDB();
  const idStr = String(animeId);
  const fallbackThumb = bannerUrl || coverUrl || "/assets/loading-bg.jpg";

  if (db[idStr] && Array.isArray(db[idStr].seasons) && db[idStr].seasons.length > 0) {
    return db[idStr];
  }

  const epCount = Math.min(Math.max(totalEpisodes || 12, 1), 24);
  const s1Episodes = [];

  for (let i = 1; i <= epCount; i++) {
    s1Episodes.push({
      id: `ep-${animeId}-1-${i}`,
      season_number: 1,
      episode_number: i,
      title: `Episode ${i}`,
      duration: 1440,
      thumbnail_url: fallbackThumb,
    });
  }

  const seasons = [
    {
      id: `s-${animeId}-1`,
      season_number: 1,
      title: "Season 1",
      episodes: s1Episodes,
    },
  ];

  if (epCount >= 12) {
    const s2Episodes = [];
    const s2Count = Math.min(Math.floor(epCount / 2), 12);
    for (let i = 1; i <= s2Count; i++) {
      s2Episodes.push({
        id: `ep-${animeId}-2-${i}`,
        season_number: 2,
        episode_number: i,
        title: `Episode ${i}`,
        duration: 1440,
        thumbnail_url: fallbackThumb,
      });
    }
    seasons.push({
      id: `s-${animeId}-2`,
      season_number: 2,
      title: "Season 2",
      episodes: s2Episodes,
    });
  }

  const record = {
    anime_id: Number(animeId),
    title: animeTitle,
    seasons,
  };

  db[idStr] = record;
  saveDB(db);
  return record;
}

export function getAnimeSeasons(animeId) {
  const db = loadDB();
  return db[String(animeId)]?.seasons || [];
}

export function createSeason(animeId, seasonNumber, title) {
  if (!isAdmin()) {
    throw new Error("Unauthorized: Admin login required to add seasons.");
  }
  const db = loadDB();
  const idStr = String(animeId);
  if (!db[idStr]) {
    db[idStr] = { anime_id: Number(animeId), seasons: [] };
  }
  const num = Number(seasonNumber);
  const existing = db[idStr].seasons.find((s) => s.season_number === num);
  if (existing) {
    existing.title = title.trim() || `Season ${num}`;
  } else {
    db[idStr].seasons.push({
      id: `s-${animeId}-${num}`,
      season_number: num,
      title: title.trim() || `Season ${num}`,
      episodes: [],
    });
  }
  db[idStr].seasons.sort((a, b) => a.season_number - b.season_number);
  saveDB(db);
  return db[idStr].seasons;
}

export function saveEpisode(animeId, seasonNumber, episodeData) {
  if (!isAdmin()) {
    throw new Error("Unauthorized: Admin login required to edit episodes.");
  }
  const db = loadDB();
  const idStr = String(animeId);
  if (!db[idStr]) {
    db[idStr] = { anime_id: Number(animeId), seasons: [] };
  }
  const sNum = Number(seasonNumber);
  let season = db[idStr].seasons.find((s) => s.season_number === sNum);
  if (!season) {
    season = {
      id: `s-${animeId}-${sNum}`,
      season_number: sNum,
      title: `Season ${sNum}`,
      episodes: [],
    };
    db[idStr].seasons.push(season);
  }
  const epNum = Number(episodeData.episode_number);
  const idx = season.episodes.findIndex((e) => e.episode_number === epNum);
  const epObj = {
    id: episodeData.id || `ep-${animeId}-${sNum}-${epNum}`,
    season_number: sNum,
    episode_number: epNum,
    title: episodeData.title?.trim() || `Episode ${epNum}`,
    duration: Number(episodeData.duration) || 1440,
    thumbnail_url: episodeData.thumbnail_url?.trim() || "",
  };

  if (idx >= 0) {
    season.episodes[idx] = epObj;
  } else {
    season.episodes.push(epObj);
  }
  season.episodes.sort((a, b) => a.episode_number - b.episode_number);
  saveDB(db);
  return season.episodes;
}

export function deleteEpisode(animeId, seasonNumber, episodeNumber) {
  if (!isAdmin()) {
    throw new Error("Unauthorized: Admin login required to delete episodes.");
  }
  const db = loadDB();
  const idStr = String(animeId);
  const season = db[idStr]?.seasons?.find((s) => s.season_number === Number(seasonNumber));
  if (season) {
    season.episodes = season.episodes.filter((e) => e.episode_number !== Number(episodeNumber));
    saveDB(db);
  }
}
