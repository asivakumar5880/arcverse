// loader.js — Reusable SA Monogram Loading Screen Component.
// Handles 5 layers:
//   1. Animated photo background (Ken Burns zoom/drift) with smooth fade-in
//   2. Dark gradient overlay + light blur
//   3. Warm golden light-leak animation
//   4. 35 floating twinkling sparkle particles (white/gold)
//   5. SA Monogram logo centered with soft pulse + thin gold ring

let loadStartTime = 0;
let hideTimer = null;

/**
 * Initializes the loading screen background and sparkles.
 */
export function initLoadingScreen() {
  initLoadingBg();
  initSparkles();
}

/**
 * Preload WebP with fallback to JPG, and fade in smoothly over dark fallback.
 */
function initLoadingBg() {
  const bg = document.getElementById("lsBg");
  if (!bg) return;

  const webpUrl = "/assets/loading-bg.webp";
  const jpgUrl = "/assets/loading-bg.jpg";

  const img = new Image();
  img.onload = () => {
    bg.style.backgroundImage = `url("${webpUrl}")`;
    bg.classList.add("loaded");
  };
  img.onerror = () => {
    const fallbackImg = new Image();
    fallbackImg.onload = () => {
      bg.style.backgroundImage = `url("${jpgUrl}")`;
      bg.classList.add("loaded");
    };
    fallbackImg.src = jpgUrl;
  };
  img.src = webpUrl;
  if (img.complete) {
    bg.classList.add("loaded");
  }
}

/**
 * Injects 35 randomized sparkle particles into #lsSparks.
 */
function initSparkles() {
  const container = document.getElementById("lsSparks");
  if (!container || container.children.length > 0) return;

  const count = 35;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "spark";

    const size = Math.floor(2 + Math.random() * 3.5); // 2px to 5px
    const left = (Math.random() * 100).toFixed(1);
    const dur = (3.5 + Math.random() * 4.5).toFixed(2); // 3.5s to 8s
    const delay = (Math.random() * 5).toFixed(2);
    const peak = (0.45 + Math.random() * 0.45).toFixed(2);
    const isGold = Math.random() > 0.55;
    const color = isGold ? "#fcedc7" : "#ffffff";

    s.style.width = `${size}px`;
    s.style.height = `${size}px`;
    s.style.left = `${left}%`;
    s.style.background = color;
    s.style.boxShadow = `0 0 ${size * 2}px ${color}`;
    s.style.setProperty("--dur", `${dur}s`);
    s.style.setProperty("--delay", `${delay}s`);
    s.style.setProperty("--peak", peak);

    frag.appendChild(s);
  }

  container.appendChild(frag);
}

/**
 * Shows the loading screen.
 * @param {"fullscreen" | "section"} variant - "fullscreen" for page-level, "section" for grid-only overlay
 */
export function showLoadingScreen(variant = "fullscreen") {
  const ls = document.getElementById("loadingScreen");
  if (!ls) return;

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  loadStartTime = Date.now();

  ls.classList.remove("variant-fullscreen", "variant-section", "search-overlay");
  ls.classList.add(`variant-${variant}`);

  ls.style.display = "flex";
  // Force browser reflow so transition plays correctly
  ls.offsetHeight; // eslint-disable-line no-unused-expressions
  ls.classList.remove("hidden");
}

/**
 * Hides the loading screen with guaranteed 600ms minimum display and 400ms fade-out.
 * @param {number} forcedDelayMs - Optional explicit remaining ms to wait
 */
export function hideLoadingScreen(forcedDelayMs = null) {
  const ls = document.getElementById("loadingScreen");
  if (!ls) return;

  let delay = 0;
  if (forcedDelayMs !== null) {
    delay = Math.max(0, forcedDelayMs);
  } else {
    const elapsed = Date.now() - loadStartTime;
    delay = Math.max(0, 600 - elapsed);
  }

  if (hideTimer) clearTimeout(hideTimer);

  hideTimer = setTimeout(() => {
    ls.classList.add("hidden");
    hideTimer = setTimeout(() => {
      ls.style.display = "none";
      hideTimer = null;
    }, 450);
  }, delay);
}

export function getLoadStartTime() {
  return loadStartTime;
}
