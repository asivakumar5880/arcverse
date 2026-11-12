import { isSessionValid, logout, getAppUrl } from "./auth.js";

import {
  anilistQuery,
  escapeHtml,
  pickImage,
  PLACEHOLDER_SVG,
  MEDIA_CARD_FIELDS,
} from "./api.js";
import {
  initLoadingScreen,
  showLoadingScreen,
  hideLoadingScreen,
} from "./loader.js";


/* ------------------ State ------------------ */
const GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Horror",
  "Sports",
  "Mystery",
  "Thriller",
  "Psychological",
  "Supernatural",
  "Music",
  "School",
];

const PER_PAGE = 30;
const SEEN_IDS = new Set();
const ANIME_BANNER_MAP = new Map();
const PRELOADED_URLS = new Set();
let activeBgLayer = "A";

const state = {
  search: "",
  genre: "", // "" = all
  sort: "POPULARITY_DESC",
  page: 1,
  hasNextPage: true,
  isLoading: false,
  fetchAbortController: null, // AbortController for canceling previous filter/search requests
  selectedId: null,
  currentBgUrl: "",
};

/* ------------------ DOM refs ------------------ */
const appBgA = document.getElementById("appBgA");
const appBgB = document.getElementById("appBgB");
const grid = document.getElementById("grid");
const sentinel = document.getElementById("sentinel");
const loadMoreWrap = document.getElementById("loadMoreWrap");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const emptyState = document.getElementById("emptyState");
const errorState = document.getElementById("errorState");
const errorBox = document.getElementById("errorBox");
const errorMsg = document.getElementById("errorMsg");
const retryBtn = document.getElementById("retryBtn");
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");
const sortSelect = document.getElementById("sortSelect");
const genreButtons = document.getElementById("genreButtons");
const backTop = document.getElementById("backTop");
const navLogoutBtn = document.getElementById("navLogoutBtn");

// Auth Button in Navbar (Sign In for guests, Sign Out for logged-in users)
function updateNavAuthButton() {
  if (!navLogoutBtn) return;
  if (isSessionValid()) {
    navLogoutBtn.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      <span>Sign Out</span>
    `;
    navLogoutBtn.title = "Sign Out";
    navLogoutBtn.onclick = () => logout();
  } else {
    navLogoutBtn.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
      <span>Sign In</span>
    `;
    navLogoutBtn.title = "Sign In";
    navLogoutBtn.onclick = () => {
      location.href = getAppUrl("login.html");
    };
  }
}
updateNavAuthButton();


/* ------------------ Dynamic Background & Preload ------------------ */
function getAnimeBannerUrl(media) {
  if (!media) return "";
  return media.bannerImage || pickImage(media.coverImage) || "";
}

function preloadBanner(url) {
  if (!url || PRELOADED_URLS.has(url)) return;
  PRELOADED_URLS.add(url);
  const img = new Image();
  img.src = url;
}

function setDynamicBackground(url) {
  if (!url || url === state.currentBgUrl) return;
  state.currentBgUrl = url;

  if (!appBgA || !appBgB) return;

  const currentLayer = activeBgLayer === "A" ? appBgA : appBgB;
  const nextLayer = activeBgLayer === "A" ? appBgB : appBgA;

  // Cross-fade with 500ms transition and zero white flash
  const applyNext = () => {
    nextLayer.style.backgroundImage = `url("${url}")`;
    nextLayer.classList.add("active");
    currentLayer.classList.remove("active");
    activeBgLayer = activeBgLayer === "A" ? "B" : "A";
  };

  const img = new Image();
  img.onload = applyNext;
  img.src = url;
  if (img.complete) {
    applyNext();
  }
}

function selectAnime(id) {
  state.selectedId = id;
  const bannerUrl = ANIME_BANNER_MAP.get(id);
  if (bannerUrl) {
    setDynamicBackground(bannerUrl);
    try {
      sessionStorage.setItem("selectedAnimeId", String(id));
      sessionStorage.setItem("selectedAnimeBanner", bannerUrl);
    } catch {}
  }

  // Update selected class across all cards
  grid.querySelectorAll(".card").forEach((card) => {
    const isSelected = card.dataset.animeId === String(id);
    card.classList.toggle("selected", isSelected);
  });
}

/* ------------------ Build genre buttons ------------------ */
function buildGenreButtons() {
  const allBtn = makeGenreBtn("All", "");
  genreButtons.appendChild(allBtn);
  GENRES.forEach((g) => genreButtons.appendChild(makeGenreBtn(g, g)));
}

function makeGenreBtn(label, value) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "genre-btn" + (value === "" ? " active" : "");
  btn.textContent = label;
  btn.dataset.genre = value;
  btn.addEventListener("click", () => {
    if (state.genre === value) return;
    genreButtons.querySelectorAll(".genre-btn").forEach((b) =>
      b.classList.remove("active")
    );
    btn.classList.add("active");
    state.genre = value;
    resetAndLoad("section");
  });
  return btn;
}

/* ------------------ GraphQL query ------------------ */
function buildQuery() {
  // We use the Page query so we can paginate. Media sub-query filters here.
  const q = `
    ${MEDIA_CARD_FIELDS}
    query ($page: Int, $perPage: Int, $search: String, $genre: String, $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage currentPage }
        media(
          type: ANIME
          isAdult: false
          search: $search
          genre: $genre
          sort: $sort
        ) { ...CardFields }
      }
    }`;
  return q;
}

function buildVariables() {
  const v = {
    page: state.page,
    perPage: PER_PAGE,
    sort: [state.sort],
  };
  if (state.search.trim()) v.search = state.search.trim();
  if (state.genre) v.genre = state.genre;
  return v;
}

/* ------------------ Load a page ------------------ */
async function loadPage() {
  if (state.isLoading || !state.hasNextPage) return;
  state.isLoading = true;
  hideError();
  setLoadMoreLoading(true);

  // Capture current abort controller for this fetch
  const thisController = state.fetchAbortController;

  try {
    const data = await anilistQuery(buildQuery(), buildVariables(), thisController?.signal);
    const page = data.Page;
    state.hasNextPage = page.pageInfo.hasNextPage;

    const fresh = (page.media || []).filter(
      (m) => m && !m.isAdult && pickImage(m.coverImage) && !SEEN_IDS.has(m.id)
    );
    fresh.forEach((m) => {
      SEEN_IDS.add(m.id);
      const bannerUrl = getAnimeBannerUrl(m);
      ANIME_BANNER_MAP.set(m.id, bannerUrl);
      preloadBanner(bannerUrl);
    });

    if (state.page === 1) {
      if (fresh.length === 0) {
        if (state.genre) {
          showEmpty("No anime found in this genre");
        } else if (state.search) {
          showEmpty(`No anime found for "${escapeHtml(state.search)}". Try another name.`);
        } else {
          showEmpty("No results found. Try a different search term or filter.");
        }
      } else if (!state.selectedId) {
        // Default state: show the background of the first / featured anime when nothing is selected
        const featuredBanner = ANIME_BANNER_MAP.get(fresh[0].id);
        if (featuredBanner) {
          setDynamicBackground(featuredBanner);
        }
      }
      hideLoadingScreen();
    }

    appendCards(fresh);

    if (state.selectedId && ANIME_BANNER_MAP.has(state.selectedId)) {
      selectAnime(state.selectedId);
    }

    // Toggle load-more button visibility
    loadMoreWrap.style.display =
      state.hasNextPage && grid.children.length > 0 ? "flex" : "none";

    sentinel.style.display = state.hasNextPage ? "block" : "none";
  } catch (err) {
    // Ignore errors from aborted requests (user clicked another genre/filter)
    if (err?.name === "AbortError") return;

    hideLoadingScreen();
    showError(err.message || "Something went wrong. Please check your connection.");
  } finally {
    state.isLoading = false;
    setLoadMoreLoading(false);
  }
}

// Safety timeout: hide loading screen after 4s even if network stalls
setTimeout(() => hideLoadingScreen(), 4000);

function setLoadMoreLoading(loading) {
  loadMoreBtn.disabled = loading;
  loadMoreBtn.textContent = loading ? "Loading…" : "Load More";
}

/* ------------------ Render (append-only) ------------------ */
function appendCards(items) {
  const frag = document.createDocumentFragment();
  items.forEach((m) => frag.appendChild(createCard(m)));
  grid.appendChild(frag);
}

function createCard(media) {
  const a = document.createElement("a");
  a.className = "card" + (state.selectedId === media.id ? " selected" : "");
  a.href = getAppUrl(`anime.html?id=${media.id}`);
  a.dataset.animeId = String(media.id);

  const cover = document.createElement("div");
  cover.className = "card-cover";

  const shimmer = document.createElement("div");
  shimmer.className = "shimmer";

  const img = document.createElement("img");
  img.alt = titleText(media) + " cover";
  img.loading = "lazy";
  img.decoding = "async";
  img.dataset.src = pickImage(media.coverImage);
  img.addEventListener("load", () => {
    img.classList.add("loaded");
    shimmer.remove();
  });
  img.addEventListener("error", () => onImgError(img, shimmer));
  img.src = img.dataset.src; // triggers load

  if (media.averageScore != null) {
    const badge = document.createElement("div");
    badge.className = "score-badge";
    badge.textContent = (media.averageScore / 10).toFixed(1) + "/10";
    cover.appendChild(badge);
  }

  cover.appendChild(shimmer);
  cover.appendChild(img);

  const body = document.createElement("div");
  body.className = "card-body";

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = titleText(media);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const fmt = media.format || "TV";
  const eps = media.episodes != null ? `${media.episodes} ep` : "—";
  meta.innerHTML =
    `<span>${escapeHtml(fmt)}</span>` +
    `<span class="dot">&bull;</span>` +
    `<span>${escapeHtml(eps)}</span>`;

  const actionBtn = document.createElement("span");
  actionBtn.className = "card-action-btn";
  actionBtn.innerHTML = `View Details &rarr;`;

  body.appendChild(title);
  body.appendChild(meta);
  a.appendChild(cover);
  a.appendChild(body);
  a.appendChild(actionBtn);

  // Click / tap interaction:
  // - First click selects anime and immediately crossfades background
  // - Second click or clicking "View Details" navigates to detail page
  a.addEventListener("click", (e) => {
    const isActionBtn = Boolean(e.target.closest(".card-action-btn"));
    const isAlreadySelected = state.selectedId === media.id;

    if (isActionBtn || isAlreadySelected) {
      selectAnime(media.id);
      return; // Proceed with navigation
    }

    e.preventDefault();
    selectAnime(media.id);
  });

  return a;
}

function titleText(m) {
  return m.title?.english || m.title?.romaji || "Untitled";
}

/* ------------------ Image error: retry once then placeholder ------------------ */
function onImgError(img, shimmer) {
  if (img.dataset.retried === "1") {
    img.src = PLACEHOLDER_SVG;
    img.classList.add("loaded");
    shimmer && shimmer.remove();
    return;
  }
  img.dataset.retried = "1";
  const orig = img.dataset.src;
  // small delay then retry same URL once
  setTimeout(() => {
    img.src = orig;
  }, 600);
}

/* ------------------ States ------------------ */
function showEmpty(msg) {
  const title = document.getElementById("emptyTitle");
  const desc = document.getElementById("emptyDesc");
  if (msg && title) {
    title.textContent = msg;
    if (desc) desc.textContent = "Try switching to another genre or clearing search.";
  }
  emptyState.style.display = "block";
}

function hideEmpty() {
  emptyState.style.display = "none";
}

function showError(msg) {
  if (grid.children.length === 0) {
    errorMsg.textContent = msg;
    errorBox.classList.add("show");
    errorState.style.display = "block";
  } else {
    // in-grid error: just soften the load-more button
    loadMoreBtn.textContent = "Retry";
    loadMoreWrap.style.display = "flex";
  }
}

function hideError() {
  errorState.style.display = "none";
  errorBox.classList.remove("show");
}

/* ------------------ Reset & load ------------------ */
function resetAndLoad(variant = "section") {
  // Cancel any in-flight filter/search request
  if (state.fetchAbortController) {
    state.fetchAbortController.abort();
    state.fetchAbortController = null;
  }
  state.fetchAbortController = new AbortController();

  state.page = 1;
  state.hasNextPage = true;
  state.selectedId = null;
  SEEN_IDS.clear();
  grid.innerHTML = "";
  hideEmpty();
  hideError();

  // Show SA Monogram loading screen with beach photo & gold ring
  showLoadingScreen(variant);

  sentinel.style.display = "block";
  loadMoreWrap.style.display = "none";
  loadPage();
}

/* ------------------ Search (debounced 400ms) ------------------ */
let searchTimer = null;
searchInput.addEventListener("input", () => {
  const val = searchInput.value;
  searchClear.classList.toggle("show", val.length > 0);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = val;
    resetAndLoad("section");
  }, 400);
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.classList.remove("show");
  state.search = "";
  clearTimeout(searchTimer);
  resetAndLoad("section");
  searchInput.focus();
});

sortSelect.addEventListener("change", () => {
  state.sort = sortSelect.value;
  resetAndLoad("section");
});

retryBtn.addEventListener("click", () => resetAndLoad("section"));
loadMoreBtn.addEventListener("click", () => {
  if (loadMoreBtn.textContent === "Retry") {
    loadMoreBtn.textContent = "Load More";
  }
  state.page += 1;
  loadPage();
});

/* ------------------ Infinite scroll ------------------ */
const io = new IntersectionObserver(
  (entries) => {
    if (entries[0].isIntersecting && !state.isLoading && state.hasNextPage) {
      state.page += 1;
      loadPage();
    }
  },
  { rootMargin: "600px" }
);
io.observe(sentinel);

/* ------------------ Back to top ------------------ */
window.addEventListener("scroll", () => {
  backTop.classList.toggle("show", window.scrollY > 600);
});
backTop.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" })
);

/* ------------------ Save/restore scroll & filters ------------------ */
function saveState() {
  try {
    sessionStorage.setItem(
      "homeState",
      JSON.stringify({
        scroll: window.scrollY,
        search: state.search,
        genre: state.genre,
        sort: state.sort,
        selectedId: state.selectedId,
        currentBgUrl: state.currentBgUrl,
      })
    );
  } catch {}
}

function restoreState() {
  try {
    const raw = sessionStorage.getItem("homeState");
    if (!raw) return false;
    const s = JSON.parse(raw);
    state.search = s.search || "";
    state.genre = s.genre || "";
    state.sort = s.sort || "POPULARITY_DESC";
    state.selectedId = s.selectedId || null;
    if (s.currentBgUrl) {
      setDynamicBackground(s.currentBgUrl);
    }
    searchInput.value = state.search;
    searchClear.classList.toggle("show", state.search.length > 0);
    sortSelect.value = state.sort;
    genreButtons.querySelectorAll(".genre-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.genre === state.genre);
    });
    if (s.scroll) {
      // restore after first render
      requestAnimationFrame(() =>
        requestAnimationFrame(() => window.scrollTo(0, s.scroll))
      );
    }
    return true;
  } catch {
    return false;
  }
}

window.addEventListener("beforeunload", saveState);
// also save whenever we navigate to a detail page
document.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (card) saveState();
});

/* ------------------ Init ------------------ */
initLoadingScreen();
buildGenreButtons();
restoreState();
showLoadingScreen("fullscreen");
loadPage();
