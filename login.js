// login.js — ArcVerse Login Page Logic

import { isSessionValid } from "./auth.js";

/* ---- If already logged in, skip to the app ---- */
if (isSessionValid()) {
  const params = new URLSearchParams(location.search);
  const next = params.get("next");
  location.replace(next && next.startsWith("/") ? decodeURIComponent(next) : "/index.html");
}

/* ---- DOM ---- */
const form         = document.getElementById("loginForm");
const emailInput   = document.getElementById("emailInput");
const passwordInput= document.getElementById("passwordInput");
const signinBtn    = document.getElementById("signinBtn");
const eyeBtn       = document.getElementById("eyeBtn");
const eyeOpen      = document.getElementById("eyeOpen");
const eyeClosed    = document.getElementById("eyeClosed");
const globalError  = document.getElementById("globalError");
const globalErrorMsg = document.getElementById("globalErrorMsg");
const emailError   = document.getElementById("emailError");
const passwordError= document.getElementById("passwordError");
const loginCard    = document.getElementById("loginCard");
const forgotLink   = document.getElementById("forgotLink");

/* ---- Rate limit (client-side mirror, server enforces) ---- */
const LOCKOUT_KEY  = "arcverse_lockout";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000;

function getLockout() {
  try { return JSON.parse(localStorage.getItem(LOCKOUT_KEY) || "null"); } catch { return null; }
}
function setLockout(data) {
  try { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data)); } catch {}
}
function clearLockout() {
  try { localStorage.removeItem(LOCKOUT_KEY); } catch {}
}
function isLockedOut() {
  const lock = getLockout();
  if (!lock) return false;
  if (Date.now() < lock.until) return true;
  clearLockout();
  return false;
}
function remainingLockout() {
  const lock = getLockout();
  if (!lock) return 0;
  return Math.max(0, Math.ceil((lock.until - Date.now()) / 60000));
}

/* ---- Helpers ---- */
function showFieldError(el, msg) {
  el.textContent = msg;
  el.classList.add("visible");
}
function clearFieldError(el) {
  el.textContent = "";
  el.classList.remove("visible");
}
function showGlobalError(msg) {
  globalErrorMsg.textContent = msg;
  globalError.classList.add("visible");
}
function clearGlobalError() {
  globalError.classList.remove("visible");
}
function setLoading(on) {
  signinBtn.disabled = on;
  if (on) signinBtn.classList.add("loading");
  else    signinBtn.classList.remove("loading");
}

function shakeCard() {
  loginCard.classList.remove("shake");
  void loginCard.offsetWidth; // reflow
  loginCard.classList.add("shake");
  loginCard.addEventListener("animationend", () => loginCard.classList.remove("shake"), { once: true });
}

function successAndRedirect() {
  signinBtn.classList.remove("loading");
  signinBtn.classList.add("success-state");
  signinBtn.disabled = true;
  clearGlobalError();

  // After a brief moment, fade the card out then navigate
  setTimeout(() => {
    loginCard.classList.add("success-out");
    loginCard.addEventListener("animationend", () => {
      const params = new URLSearchParams(location.search);
      const next = params.get("next");
      location.replace(next && next.startsWith("/") ? decodeURIComponent(next) : "/index.html");
    }, { once: true });
  }, 400);
}

/* ---- Auto-focus ---- */
emailInput.focus();

/* ---- Eye toggle ---- */
eyeBtn.addEventListener("click", () => {
  const hidden = passwordInput.type === "password";
  passwordInput.type = hidden ? "text" : "password";
  eyeOpen.style.display   = hidden ? "none"  : "";
  eyeClosed.style.display = hidden ? ""      : "none";
  eyeBtn.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
});

/* ---- Forgot link ---- */
forgotLink.addEventListener("click", (e) => {
  e.preventDefault();
  showGlobalError("Please contact the site owner to reset your password.");
});

/* ---- Clear errors on input ---- */
emailInput.addEventListener("input", () => clearFieldError(emailError));
passwordInput.addEventListener("input", () => {
  clearFieldError(passwordError);
  clearGlobalError();
});

/* ---- Validate client side ---- */
function validate() {
  let ok = true;
  clearFieldError(emailError);
  clearFieldError(passwordError);
  clearGlobalError();

  const email = emailInput.value.trim();
  const pwd   = passwordInput.value;

  if (!email) {
    showFieldError(emailError, "Email is required.");
    emailInput.classList.add("invalid");
    ok = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError(emailError, "Enter a valid email address.");
    emailInput.classList.add("invalid");
    ok = false;
  } else {
    emailInput.classList.remove("invalid");
  }

  if (!pwd) {
    showFieldError(passwordError, "Password is required.");
    passwordInput.classList.add("invalid");
    ok = false;
  } else {
    passwordInput.classList.remove("invalid");
  }

  return ok;
}

/* ---- Submit ---- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!validate()) {
    shakeCard();
    return;
  }

  if (isLockedOut()) {
    showGlobalError(`Too many attempts. Try again in ${remainingLockout()} minute(s).`);
    shakeCard();
    return;
  }

  setLoading(true);
  clearGlobalError();

  const password = passwordInput.value;

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success && data.token) {
      // Success — store token
      clearLockout();
      try {
        localStorage.setItem("arcverse_admin_token", data.token);
        localStorage.setItem("arcverse_admin_auth", "true");
      } catch {}
      successAndRedirect();
      return;
    }

    // Failure
    setLoading(false);

    if (res.status === 429) {
      // Server locked out — mirror client-side lockout
      const lock = getLockout() || { count: MAX_ATTEMPTS, until: 0 };
      lock.until = Date.now() + LOCKOUT_MS;
      setLockout(lock);
      showGlobalError("Too many failed attempts. Try again in 15 minutes.");
      shakeCard();
      return;
    }

    // Track failed attempts client-side
    const lock = getLockout() || { count: 0, until: 0 };
    lock.count += 1;
    if (lock.count >= MAX_ATTEMPTS) {
      lock.until = Date.now() + LOCKOUT_MS;
    }
    setLockout(lock);

    if (lock.until && Date.now() < lock.until) {
      showGlobalError("Too many failed attempts. Try again in 15 minutes.");
    } else {
      showGlobalError("Incorrect email or password.");
    }
    shakeCard();
    passwordInput.value = "";
    passwordInput.focus();

  } catch {
    setLoading(false);
    showGlobalError("Something went wrong. Please check your connection and try again.");
    shakeCard();
  }
});

/* ---- Enter key on email ---- */
emailInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); passwordInput.focus(); }
});
