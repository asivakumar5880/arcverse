// anime.js — Anime Detail & Episode Information Guide
// Powered by AniList official anime data.

import { isSessionValid, logout, getAppUrl } from "./auth.js";

import {
  anilistQuery,
  escapeHtml,
  stripHtml,
  pickImage,
  PLACEHOLDER_SVG,
  PLACEHOLDER_SQUARE_SVG,
  MEDIA_DETAIL_FIELDS,
} from "./api.js";
import {
  initLoadingScreen,
  showLoadingScreen,
  hideLoadingScreen,
} from "./loader.js";
import {
  ensureAnimeSeed,
  getAnimeSeasons,
  isAdmin,
  loginAdmin,
  logoutAdmin,
  verifyAdminSession,
  getAdminToken,
  createSeason,
  saveEpisode,
  deleteEpisode,
} from "./episodeStore.js";

/* ------------------ DOM Refs ------------------ */
const detailContent = document.getElementById("detailContent");
const errorState = document.getElementById("errorState");
const errorTitle = document.getElementById("errorTitle");
const errorMsg = document.getElementById("errorMsg");
const banner = document.getElementById("banner");
const coverWrap = document.getElementById("coverWrap");
const coverImg = document.getElementById("coverImg");
const coverShimmer = coverWrap?.querySelector(".shimmer");
const titleEl = document.getElementById("title");
const subTitleEl = document.getElementById("subTitle");
const statsEl = document.getElementById("stats");
const genresEl = document.getElementById("genres");
const descriptionEl = document.getElementById("description");
const charGrid = document.getElementById("charGrid");
const charLoadMoreWrap = document.getElementById("charLoadMoreWrap");
const charLoadMoreBtn = document.getElementById("charLoadMoreBtn");
const charLoading = document.getElementById("charLoading");
const backBtn = document.getElementById("backBtn");
const backTop = document.getElementById("backTop");

// Admin Login Modal DOM Refs
const adminLoginModal = document.getElementById("adminLoginModal");
const adminLoginBox = document.getElementById("adminLoginBox");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const toggleAdminPasswordBtn = document.getElementById("toggleAdminPasswordBtn");
const eyeShowIcon = document.getElementById("eyeShowIcon");
const eyeHideIcon = document.getElementById("eyeHideIcon");
const adminLoginError = document.getElementById("adminLoginError");
const cancelAdminLoginBtn = document.getElementById("cancelAdminLoginBtn");
const submitAdminLoginBtn = document.getElementById("submitAdminLoginBtn");

// Episodes Section DOM Refs
const adminToolbar = document.getElementById("adminToolbar");
const adminToggleBtn = document.getElementById("adminToggleBtn");
const adminStatusText = document.getElementById("adminStatusText");
const adminActions = document.getElementById("adminActions");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");
const addEpisodeBtn = document.getElementById("addEpisodeBtn");
const addSeasonBtn = document.getElementById("addSeasonBtn");
const seasonTabs = document.getElementById("seasonTabs");
const episodeList = document.getElementById("episodeList");

// Episode Modal DOM Refs
const episodeModal = document.getElementById("episodeModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const episodeForm = document.getElementById("episodeForm");
const modalTitle = document.getElementById("modalTitle");
const modalEpEditId = document.getElementById("modalEpEditId");
const modalSeasonSelect = document.getElementById("modalSeasonSelect");
const modalEpNumber = document.getElementById("modalEpNumber");
const modalEpTitle = document.getElementById("modalEpTitle");
const modalDuration = document.getElementById("modalDuration");
const modalThumbnailUrl = document.getElementById("modalThumbnailUrl");

// Background DOM Refs
const appBgA = document.getElementById("appBgA");
const appBgB = document.getElementById("appBgB");
let activeBgLayer = "A";

/* ------------------ State ------------------ */
let currentAnimeId = null;
let currentAnimeData = null;
let currentSeasonNumber = 1;
let editingEpisode = null;

/* ------------------ Background Cross-fade ------------------ */
function setDetailBackground(imageUrl) {
  if (!imageUrl || !appBgA || !appBgB) return;
  const currentLayer = activeBgLayer === "A" ? appBgA : appBgB;
  const nextLayer = activeBgLayer === "A" ? appBgB : appBgA;

  const applyBg = () => {
    nextLayer.style.backgroundImage = `url("${imageUrl}")`;
    nextLayer.classList.add("active");
    currentLayer.classList.remove("active");
    activeBgLayer = activeBgLayer === "A" ? "B" : "A";
  };

  const img = new Image();
  img.onload = applyBg;
  img.src = imageUrl;
  if (img.complete) applyBg();
}

/* ------------------ Initialize Page ------------------ */
const params = new URLSearchParams(window.location.search);
const rawId = params.get("id");
currentAnimeId = parseInt(rawId, 10);

try {
  const cachedBg = sessionStorage.getItem("selectedAnimeBanner");
  const cachedId = sessionStorage.getItem("selectedAnimeId");
  if (cachedBg && (!currentAnimeId || String(currentAnimeId) === cachedId)) {
    setDetailBackground(cachedBg);
  }
} catch {}

initLoadingScreen();

if (!currentAnimeId || Number.isNaN(currentAnimeId)) {
  showFatalError("Invalid link", "This anime link is missing a valid ID. Please return to the home page.");
} else {
  showLoadingScreen("fullscreen");
  loadAnimeDetail(currentAnimeId);
}

/* ------------------ Load Anime Metadata ------------------ */
async function loadAnimeDetail(id) {
  try {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          ...DetailFields
        }
      }
      ${MEDIA_DETAIL_FIELDS}
    `;
    const data = await anilistQuery(query, { id });
    const media = data.Media;
    if (!media) throw new Error("Anime details not found.");

    currentAnimeData = media;
    document.title = `${media.title?.english || media.title?.romaji || "Anime"} — ArcVerse`;

    // Render metadata & background
    renderDetail(media);

    const title = media.title?.english || media.title?.romaji || "Anime";
    const bannerUrl = media.bannerImage || pickImage(media.coverImage) || "";
    const coverUrl = pickImage(media.coverImage) || "";

    // Initialize Episode Store information cards
    ensureAnimeSeed(id, title, media.episodes || 12, bannerUrl, coverUrl);

    // Verify Admin Session on load
    await verifyAdminSession();
    syncAdminState();

    // Render Season Tabs and Episode Cards
    renderSeasonTabs();
    renderEpisodeList();

    detailContent.style.display = "block";
    hideLoadingScreen();

    // Load characters list
    loadCharacters(id, 1, true);
  } catch (err) {
    hideLoadingScreen();
    showFatalError("Couldn't load this anime", err.message || "Please check your connection and try again.");
  }
}

/* ------------------ Render Detail Metadata ------------------ */
function renderDetail(m) {
  const coverUrl = pickImage(m.coverImage);
  const bgUrl = m.bannerImage || coverUrl;
  if (bgUrl) setDetailBackground(bgUrl);

  if (m.bannerImage) {
    banner.style.backgroundImage = `url("${m.bannerImage}")`;
    banner.classList.add("has-image");
  } else {
    banner.classList.add("no-image");
  }

  coverImg.alt = (m.title?.english || m.title?.romaji || "Anime") + " poster";
  coverImg.addEventListener("load", () => {
    coverImg.classList.add("loaded");
    coverShimmer && coverShimmer.remove();
  });
  coverImg.addEventListener("error", () => {
    coverImg.src = PLACEHOLDER_SVG;
    coverImg.classList.add("loaded");
    coverShimmer && coverShimmer.remove();
  });
  coverImg.src = coverUrl || PLACEHOLDER_SVG;

  titleEl.textContent = m.title?.english || m.title?.romaji || "Untitled";
  if (m.title?.romaji && m.title.english && m.title.romaji !== m.title.english) {
    subTitleEl.textContent = m.title.romaji;
  } else if (m.title?.native) {
    subTitleEl.textContent = m.title.native;
  }

  // Format stats
  const stats = [];
  if (m.format) stats.push(`Format: ${m.format}`);
  if (m.episodes != null) stats.push(`${m.episodes} episodes`);
  if (m.duration) stats.push(`${m.duration} min/ep`);
  if (m.status) stats.push(m.status.replace(/_/g, " "));
  if (m.seasonYear) stats.push(`${m.season || ""} ${m.seasonYear}`.trim());
  if (m.averageScore != null) {
    stats.push(`Rating: ${(m.averageScore / 10).toFixed(1)}/10`);
  }
  statsEl.innerHTML = stats.map((s) => `<span>${escapeHtml(s)}</span>`).join("");

  // Genres
  if (m.genres && m.genres.length) {
    genresEl.innerHTML = m.genres.map((g) => `<span class="genre-pill">${escapeHtml(g)}</span>`).join("");
  }

  // Synopsis
  descriptionEl.innerHTML = m.description ? stripHtml(m.description) : "<em>No synopsis available.</em>";
}

/* ===================== EPISODES SECTION ===================== */

function renderSeasonTabs() {
  const seasons = getAnimeSeasons(currentAnimeId);
  seasonTabs.innerHTML = "";

  if (seasons.length === 0) {
    seasonTabs.innerHTML = '<span style="color: var(--text-dim); font-size: 0.85rem;">No seasons available</span>';
    return;
  }

  seasons.forEach((season) => {
    const btn = document.createElement("button");
    btn.className = `season-tab ${season.season_number === currentSeasonNumber ? "active" : ""}`;
    btn.textContent = season.title || `Season ${season.season_number}`;
    btn.addEventListener("click", () => {
      currentSeasonNumber = season.season_number;
      renderSeasonTabs();
      renderEpisodeList();
    });
    seasonTabs.appendChild(btn);
  });
}

function renderEpisodeList() {
  const seasons = getAnimeSeasons(currentAnimeId);
  const currentSeason = seasons.find((s) => s.season_number === currentSeasonNumber) || seasons[0];
  episodeList.innerHTML = "";

  if (!currentSeason || !currentSeason.episodes || currentSeason.episodes.length === 0) {
    episodeList.innerHTML = '<p class="no-episodes-msg" style="color: var(--text-dim); padding: 20px 0;">No episodes listed for this season.</p>';
    return;
  }

  const isUserAdmin = isAdmin();
  const fallbackThumb =
    currentAnimeData?.bannerImage ||
    pickImage(currentAnimeData?.coverImage) ||
    getAppUrl("assets/loading-bg.jpg");

  currentSeason.episodes.forEach((ep) => {
    const card = document.createElement("div");
    card.className = "episode-card";
    card.dataset.epId = ep.id;

    // Thumbnail Wrap
    const thumbWrap = document.createElement("div");
    thumbWrap.className = "ep-thumb-wrap";
    const thumbImg = document.createElement("img");
    thumbImg.className = "ep-thumb-img";
    thumbImg.src = ep.thumbnail_url || fallbackThumb;
    thumbImg.alt = `Episode ${ep.episode_number}`;
    thumbImg.loading = "lazy";
    thumbImg.addEventListener("error", () => {
      thumbImg.src = fallbackThumb;
    });

    const numPill = document.createElement("span");
    numPill.className = "ep-num-pill";
    numPill.textContent = `EP ${ep.episode_number}`;

    thumbWrap.appendChild(thumbImg);
    thumbWrap.appendChild(numPill);

    // Info Wrap
    const infoWrap = document.createElement("div");
    infoWrap.className = "ep-info-wrap";

    const titleRow = document.createElement("div");
    titleRow.className = "ep-title-row";
    const titleText = document.createElement("h4");
    titleText.className = "ep-title-text";
    titleText.textContent = ep.title || `Episode ${ep.episode_number}`;
    titleRow.appendChild(titleText);

    const metaRow = document.createElement("div");
    metaRow.className = "ep-meta-row";
    const durationMins = ep.duration ? Math.round(ep.duration / 60) : 24;
    metaRow.innerHTML = `<span class="ep-duration">${durationMins}m</span>`;

    infoWrap.appendChild(titleRow);
    infoWrap.appendChild(metaRow);

    card.appendChild(thumbWrap);
    card.appendChild(infoWrap);

    // Admin action buttons (Edit & Delete)
    if (isUserAdmin) {
      const adminActionsEl = document.createElement("div");
      adminActionsEl.className = "admin-ep-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "ep-action-btn";
      editBtn.innerHTML = "&#9998;";
      editBtn.title = "Edit Episode";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditEpisodeModal(currentSeason.season_number, ep);
      });

      const delBtn = document.createElement("button");
      delBtn.className = "ep-action-btn delete";
      delBtn.innerHTML = "&#128465;";
      delBtn.title = "Delete Episode";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Delete Episode ${ep.episode_number}: "${ep.title}"?`)) {
          deleteEpisode(currentAnimeId, currentSeason.season_number, ep.episode_number);
          renderEpisodeList();
        }
      });

      adminActionsEl.appendChild(editBtn);
      adminActionsEl.appendChild(delBtn);
      card.appendChild(adminActionsEl);
    }

    episodeList.appendChild(card);
  });
}

// Admin Episode Modal Handling
function populateSeasonOptions(selectEl, selectedNum) {
  const seasons = getAnimeSeasons(currentAnimeId);
  selectEl.innerHTML = "";
  seasons.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = String(s.season_number);
    opt.textContent = s.title || `Season ${s.season_number}`;
    if (s.season_number === selectedNum) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

addEpisodeBtn.addEventListener("click", () => {
  editingEpisode = null;
  modalTitle.textContent = "Add Episode";
  modalEpEditId.value = "";
  populateSeasonOptions(modalSeasonSelect, currentSeasonNumber);
  episodeForm.reset();
  modalDuration.value = "24";
  episodeModal.style.display = "flex";
});

function openEditEpisodeModal(seasonNum, ep) {
  editingEpisode = ep;
  modalTitle.textContent = `Edit Episode ${ep.episode_number}`;
  modalEpEditId.value = ep.id;
  populateSeasonOptions(modalSeasonSelect, seasonNum);
  modalSeasonSelect.value = String(seasonNum);
  modalEpNumber.value = ep.episode_number;
  modalEpTitle.value = ep.title || "";
  modalDuration.value = ep.duration ? Math.round(ep.duration / 60) : 24;
  modalThumbnailUrl.value = ep.thumbnail_url || "";
  episodeModal.style.display = "flex";
}

function closeEpisodeModal() {
  episodeModal.style.display = "none";
}

closeModalBtn.addEventListener("click", closeEpisodeModal);
cancelModalBtn.addEventListener("click", closeEpisodeModal);

episodeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const seasonNum = parseInt(modalSeasonSelect.value, 10);
  const epNum = parseInt(modalEpNumber.value, 10);
  const epTitle = modalEpTitle.value.trim();
  const durationMins = parseInt(modalDuration.value, 10) || 24;
  const thumb = modalThumbnailUrl.value.trim();

  try {
    saveEpisode(currentAnimeId, seasonNum, {
      id: editingEpisode ? editingEpisode.id : undefined,
      episode_number: epNum,
      title: epTitle,
      duration: durationMins * 60,
      thumbnail_url: thumb || undefined,
    });
    closeEpisodeModal();
    currentSeasonNumber = seasonNum;
    renderSeasonTabs();
    renderEpisodeList();
  } catch (err) {
    alert(err.message);
  }
});

// "+ Add Season"
addSeasonBtn.addEventListener("click", () => {
  const seasons = getAnimeSeasons(currentAnimeId);
  const nextSeasonNum = seasons.length + 1;
  const name = prompt(`Enter title for Season ${nextSeasonNum}:`, `Season ${nextSeasonNum}`);
  if (name) {
    try {
      createSeason(currentAnimeId, nextSeasonNum, name);
      currentSeasonNumber = nextSeasonNum;
      renderSeasonTabs();
      renderEpisodeList();
    } catch (err) {
      alert(err.message);
    }
  }
});

/* ===================== OWNER / ADMIN MANAGEMENT ===================== */

function syncAdminState() {
  const adminActive = isAdmin();
  if (adminToolbar) {
    adminToolbar.style.display = adminActive ? "flex" : "none";
  }
  adminToggleBtn.classList.toggle("active", adminActive);
  adminStatusText.textContent = adminActive ? "ON" : "OFF";
  adminActions.style.display = adminActive ? "inline-flex" : "none";
  if (adminLogoutBtn) adminLogoutBtn.style.display = adminActive ? "inline-block" : "none";
  if (addSeasonBtn) addSeasonBtn.style.display = adminActive ? "block" : "none";
  if (addEpisodeBtn) addEpisodeBtn.style.display = adminActive ? "inline-flex" : "none";

  // Toggle edit/delete controls on episode cards
  document.querySelectorAll(".admin-ep-actions").forEach((ctrl) => {
    ctrl.style.display = adminActive ? "flex" : "none";
  });
}

/* ===================== ADMIN LOGIN MODAL ===================== */

function openAdminLoginModal() {
  adminPasswordInput.value = "";
  adminLoginError.style.display = "none";
  adminLoginBox.classList.remove("error-shake");
  adminPasswordInput.type = "password";
  eyeShowIcon.style.display = "block";
  eyeHideIcon.style.display = "none";
  adminLoginModal.style.display = "flex";
  setTimeout(() => adminPasswordInput.focus(), 60);
}

function closeAdminLoginModal() {
  adminLoginModal.style.display = "none";
}

adminToggleBtn.addEventListener("click", () => {
  if (!isAdmin()) {
    openAdminLoginModal();
  }
});

cancelAdminLoginBtn.addEventListener("click", closeAdminLoginModal);
adminLoginModal.addEventListener("click", (e) => {
  if (e.target === adminLoginModal) closeAdminLoginModal();
});

toggleAdminPasswordBtn.addEventListener("click", () => {
  const isPass = adminPasswordInput.type === "password";
  adminPasswordInput.type = isPass ? "text" : "password";
  eyeShowIcon.style.display = isPass ? "none" : "block";
  eyeHideIcon.style.display = isPass ? "block" : "none";
});

adminLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = adminPasswordInput.value;
  if (!password) return;

  submitAdminLoginBtn.disabled = true;
  submitAdminLoginBtn.textContent = "Verifying…";

  const res = await loginAdmin(password);
  submitAdminLoginBtn.disabled = false;
  submitAdminLoginBtn.textContent = "Login";

  if (res.success) {
    closeAdminLoginModal();
    syncAdminState();
    renderSeasonTabs();
    renderEpisodeList();
  } else {
    adminLoginError.textContent = res.error || "Incorrect password";
    adminLoginError.style.display = "block";
    adminLoginBox.classList.remove("error-shake");
    void adminLoginBox.offsetWidth;
    adminLoginBox.classList.add("error-shake");
    adminPasswordInput.select();
  }
});

adminLogoutBtn.addEventListener("click", async () => {
  await logoutAdmin();
  syncAdminState();
  renderSeasonTabs();
  renderEpisodeList();
});

/* ===================== CHARACTERS SECTION ===================== */
const charState = {
  page: 1,
  hasNextPage: true,
  isLoading: false,
};

async function loadCharacters(id, page, isFirst = false) {
  if (charState.isLoading) return;
  charState.isLoading = true;
  charState.page = page;

  if (isFirst) {
    charGrid.innerHTML = "";
    charLoadMoreWrap.style.display = "none";
  }
  charLoading.style.display = "block";

  try {
    const query = `
      query ($id: Int, $page: Int, $perPage: Int) {
        Media(id: $id, type: ANIME) {
          characters(page: $page, perPage: $perPage, sort: [ROLE, RELEVANCE]) {
            pageInfo { hasNextPage }
            edges {
              role
              node {
                id
                name { full }
                image { large medium }
              }
            }
          }
        }
      }`;
    const data = await anilistQuery(query, { id, page, perPage: 25 });
    const charData = data.Media?.characters;
    if (!charData) throw new Error("No character data");

    charState.hasNextPage = charData.pageInfo.hasNextPage;
    appendCharacters(charData.edges || []);

    charLoadMoreWrap.style.display = charState.hasNextPage ? "flex" : "none";
  } catch (err) {
    const errEl = document.createElement("div");
    errEl.className = "loading-inline";
    errEl.textContent = "Couldn't load characters. " + (err.message || "");
    charGrid.appendChild(errEl);
  } finally {
    charState.isLoading = false;
    charLoading.style.display = "none";
  }
}

function appendCharacters(edges) {
  const frag = document.createDocumentFragment();
  edges.forEach((edge) => {
    if (!edge?.node) return;
    frag.appendChild(createCharCard(edge));
  });
  charGrid.appendChild(frag);
}

function createCharCard(edge) {
  const node = edge.node;
  const role = (edge.role || "SUPPORTING").toUpperCase();
  const roleClass = role === "MAIN" ? "main" : role === "BACKGROUND" ? "background" : "supporting";
  const roleLabel = role === "MAIN" ? "Main" : role === "BACKGROUND" ? "Background" : "Supporting";

  const card = document.createElement("div");
  card.className = "char-card";

  const imgWrap = document.createElement("div");
  imgWrap.className = "char-img";

  const shimmer = document.createElement("div");
  shimmer.className = "shimmer";

  const img = document.createElement("img");
  img.alt = (node.name?.full || "Character") + " image";
  img.loading = "lazy";
  img.decoding = "async";
  const url = node.image?.large || node.image?.medium;
  img.dataset.src = url;
  img.addEventListener("load", () => {
    img.classList.add("loaded");
    shimmer.remove();
  });
  img.addEventListener("error", () => onCharError(img, shimmer));

  const roleEl = document.createElement("div");
  roleEl.className = `char-role ${roleClass}`;
  roleEl.textContent = roleLabel;

  imgWrap.appendChild(shimmer);
  imgWrap.appendChild(img);
  imgWrap.appendChild(roleEl);

  const nameEl = document.createElement("div");
  nameEl.className = "char-name";
  nameEl.textContent = node.name?.full || "Unknown";

  card.appendChild(imgWrap);
  card.appendChild(nameEl);

  if (url) {
    img.src = url;
  } else {
    img.src = PLACEHOLDER_SQUARE_SVG;
    img.classList.add("loaded");
    shimmer.remove();
  }

  return card;
}

function onCharError(img, shimmer) {
  if (img.dataset.retried === "1") {
    img.src = PLACEHOLDER_SQUARE_SVG;
    img.classList.add("loaded");
    shimmer && shimmer.remove();
    return;
  }
  img.dataset.retried = "1";
  setTimeout(() => {
    img.src = img.dataset.src;
  }, 600);
}

charLoadMoreBtn.addEventListener("click", () => {
  if (charState.isLoading || !charState.hasNextPage) return;
  loadCharacters(currentAnimeId, charState.page + 1);
});

/* ------------------ Navigation ------------------ */
backBtn.addEventListener("click", () => {
  history.length > 1 ? history.back() : (window.location.href = getAppUrl("index.html"));
});

window.addEventListener("scroll", () => {
  backTop.classList.toggle("show", window.scrollY > 600);
});
backTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

function showFatalError(title, msg) {
  hideLoadingScreen();
  errorTitle.textContent = title;
  errorMsg.textContent = msg;
  errorState.style.display = "block";
  detailContent.style.display = "none";
}
