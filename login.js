// login.js — ArcVerse Login Page Logic

import { isSessionValid } from "./auth.js";

/* ---- If already logged in, skip to the app ---- */
if (isSessionValid()) {
  const params = new URLSearchParams(location.search);
  const next = params.get("next");
  location.replace(next && next.startsWith("/") ? decodeURIComponent(next) : "/index.html");
}

/* ---- DOM ---- */
const form              = document.getElementById("loginForm");
const emailInput        = document.getElementById("emailInput");
const passwordInput     = document.getElementById("passwordInput");
const rememberMe        = document.getElementById("rememberMe");
const signinBtn         = document.getElementById("signinBtn");
const eyeBtn            = document.getElementById("eyeBtn");
const eyeOpen           = document.getElementById("eyeOpen");
const eyeClosed         = document.getElementById("eyeClosed");
const globalError       = document.getElementById("globalError");
const globalErrorMsg    = document.getElementById("globalErrorMsg");
const emailError        = document.getElementById("emailError");
const passwordError     = document.getElementById("passwordError");
const loginCard         = document.getElementById("loginCard");
const forgotLink        = document.getElementById("forgotLink");

// Modal DOM elements
const forgotModal       = document.getElementById("forgotModal");
const modalCloseBtn     = document.getElementById("modalCloseBtn");
const resetStep1        = document.getElementById("resetStep1");
const resetStep2        = document.getElementById("resetStep2");
const resetEmailInput   = document.getElementById("resetEmailInput");
const resetEmailError   = document.getElementById("resetEmailError");
const resetAlertStep1   = document.getElementById("resetAlertStep1");
const requestTokenBtn   = document.getElementById("requestTokenBtn");
const resetTokenInput   = document.getElementById("resetTokenInput");
const resetTokenError   = document.getElementById("resetTokenError");
const newPasswordInput  = document.getElementById("newPasswordInput");
const newPasswordError  = document.getElementById("newPasswordError");
const confirmPasswordInput = document.getElementById("confirmPasswordInput");
const confirmPasswordError = document.getElementById("confirmPasswordError");
const resetAlertStep2   = document.getElementById("resetAlertStep2");
const submitNewPasswordBtn = document.getElementById("submitNewPasswordBtn");

/* ---- Clean & Empty Initialization (Zero credential pre-population) ---- */
try {
  localStorage.removeItem("arcverse_remember_email");
  sessionStorage.removeItem("arcverse_remember_email");
} catch {}

let userHasTyped = false;

function makeEditable(el) {
  if (el && el.hasAttribute("readonly")) {
    el.removeAttribute("readonly");
  }
}

function unlockForm() {
  makeEditable(emailInput);
  makeEditable(passwordInput);
}

function resetLoginForm() {
  if (form) form.reset();
  if (emailInput) {
    emailInput.value = "";
    emailInput.setAttribute("readonly", "readonly");
  }
  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.type = "password";
    passwordInput.setAttribute("readonly", "readonly");
  }
  if (eyeOpen) eyeOpen.style.display = "";
  if (eyeClosed) eyeClosed.style.display = "none";
  if (rememberMe) rememberMe.checked = false;
  userHasTyped = false;
}

// Reset immediately on script run
resetLoginForm();

// Unlock on any user touch/click/focus
["focus", "pointerdown", "mousedown", "touchstart", "click"].forEach((evt) => {
  emailInput?.addEventListener(evt, unlockForm);
  passwordInput?.addEventListener(evt, unlockForm);
  form?.addEventListener(evt, unlockForm);
});

// Automatic unlock after initial page layout has completed so tab navigation is smooth
setTimeout(unlockForm, 250);

// Track authentic user keystrokes
["keydown", "keypress", "input", "paste"].forEach((evt) => {
  emailInput?.addEventListener(evt, () => { userHasTyped = true; }, { passive: true });
  passwordInput?.addEventListener(evt, () => { userHasTyped = true; }, { passive: true });
});

// Guard against asynchronous browser password-manager auto-injection
function purgeUnpromptedAutofill() {
  if (!userHasTyped) {
    const active = document.activeElement;
    if (emailInput && emailInput !== active && emailInput.value) {
      emailInput.value = "";
    }
    if (passwordInput && passwordInput !== active && passwordInput.value) {
      passwordInput.value = "";
    }
  }
}

// Run checks across several ticks to catch late browser autofill passes
[40, 100, 200, 400, 750, 1200].forEach((delay) => {
  setTimeout(purgeUnpromptedAutofill, delay);
});

// Reset on pageshow (handles browser back/forward cache restore)
window.addEventListener("pageshow", resetLoginForm);

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
  if (!el) return;
  el.textContent = msg;
  el.classList.add("visible");
}
function clearFieldError(el) {
  if (!el) return;
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
setTimeout(() => {
  if (emailInput && !userHasTyped && !emailInput.value) {
    emailInput.focus();
  }
}, 280);

/* ---- Eye toggle ---- */
eyeBtn.addEventListener("click", () => {
  const hidden = passwordInput.type === "password";
  passwordInput.type = hidden ? "text" : "password";
  eyeOpen.style.display   = hidden ? "none"  : "";
  eyeClosed.style.display = hidden ? ""      : "none";
  eyeBtn.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
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

/* ---- Submit Login ---- */
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

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const isRemembered = Boolean(rememberMe && rememberMe.checked);

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: isRemembered }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success && data.token) {
      clearLockout();
      try {
        const storage = isRemembered ? localStorage : sessionStorage;
        const otherStorage = isRemembered ? sessionStorage : localStorage;

        storage.setItem("arcverse_admin_token", data.token);
        storage.setItem("arcverse_admin_auth", "true");
        storage.setItem("arcverse_admin_email", email);

        otherStorage.removeItem("arcverse_admin_token");
        otherStorage.removeItem("arcverse_admin_auth");
        otherStorage.removeItem("arcverse_admin_email");

        localStorage.removeItem("arcverse_remember_email");
      } catch {}

      successAndRedirect();
      return;
    }

    // Failure
    setLoading(false);

    if (res.status === 429) {
      const lock = getLockout() || { count: MAX_ATTEMPTS, until: 0 };
      lock.until = Date.now() + LOCKOUT_MS;
      setLockout(lock);
      showGlobalError(data.error || "Too many failed attempts. Try again in 15 minutes.");
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
      showGlobalError(data.error || "Incorrect email or password.");
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

/* =========================================================
   FORGOT / RESET PASSWORD MODAL LOGIC
   ========================================================= */

function openForgotModal() {
  if (!forgotModal) return;
  forgotModal.style.display = "flex";
  resetStep1.style.display = "block";
  resetStep2.style.display = "none";
  clearFieldError(resetEmailError);
  clearFieldError(resetTokenError);
  clearFieldError(newPasswordError);
  clearFieldError(confirmPasswordError);
  resetAlertStep1.style.display = "none";
  resetAlertStep2.style.display = "none";

  resetEmailInput.value = "";
  resetEmailInput.focus();
}

function closeForgotModal() {
  if (!forgotModal) return;
  forgotModal.style.display = "none";
}

if (forgotLink) {
  forgotLink.addEventListener("click", (e) => {
    e.preventDefault();
    openForgotModal();
  });
}

if (modalCloseBtn) {
  modalCloseBtn.addEventListener("click", closeForgotModal);
}

if (forgotModal) {
  forgotModal.addEventListener("click", (e) => {
    if (e.target === forgotModal) closeForgotModal();
  });
}

// Request Token Step
if (requestTokenBtn) {
  requestTokenBtn.addEventListener("click", async () => {
    clearFieldError(resetEmailError);
    resetAlertStep1.style.display = "none";

    const email = resetEmailInput.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFieldError(resetEmailError, "Enter a valid email address.");
      return;
    }

    requestTokenBtn.disabled = true;
    requestTokenBtn.classList.add("loading");

    try {
      const res = await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));

      requestTokenBtn.disabled = false;
      requestTokenBtn.classList.remove("loading");

      if (res.ok && data.success) {
        resetStep1.style.display = "none";
        resetStep2.style.display = "block";
        if (data.resetToken) {
          resetTokenInput.value = data.resetToken;
        }
        resetAlertStep2.className = "modal-alert info";
        resetAlertStep2.textContent = data.message || "Reset token generated. Set your new password below.";
        resetAlertStep2.style.display = "block";
        newPasswordInput.focus();
      } else {
        resetAlertStep1.className = "modal-alert error";
        resetAlertStep1.textContent = data.error || "Unable to process request.";
        resetAlertStep1.style.display = "block";
      }
    } catch {
      requestTokenBtn.disabled = false;
      requestTokenBtn.classList.remove("loading");
      resetAlertStep1.className = "modal-alert error";
      resetAlertStep1.textContent = "Network error. Please try again.";
      resetAlertStep1.style.display = "block";
    }
  });
}

// Set New Password Step
if (submitNewPasswordBtn) {
  submitNewPasswordBtn.addEventListener("click", async () => {
    clearFieldError(resetTokenError);
    clearFieldError(newPasswordError);
    clearFieldError(confirmPasswordError);
    resetAlertStep2.style.display = "none";

    const token = resetTokenInput.value.trim();
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    let hasError = false;
    if (!token) {
      showFieldError(resetTokenError, "Reset token is required.");
      hasError = true;
    }
    if (!newPassword || newPassword.length < 6) {
      showFieldError(newPasswordError, "Password must be at least 6 characters.");
      hasError = true;
    }
    if (newPassword !== confirmPassword) {
      showFieldError(confirmPasswordError, "Passwords do not match.");
      hasError = true;
    }
    if (hasError) return;

    submitNewPasswordBtn.disabled = true;
    submitNewPasswordBtn.classList.add("loading");

    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json().catch(() => ({}));

      submitNewPasswordBtn.disabled = false;
      submitNewPasswordBtn.classList.remove("loading");

      if (res.ok && data.success) {
        resetAlertStep2.className = "modal-alert info";
        resetAlertStep2.textContent = "Password updated successfully! Please sign in with your new password.";
        resetAlertStep2.style.display = "block";

        passwordInput.value = "";
        setTimeout(() => {
          closeForgotModal();
          passwordInput.focus();
        }, 1500);
      } else {
        resetAlertStep2.className = "modal-alert error";
        resetAlertStep2.textContent = data.error || "Invalid or expired reset token.";
        resetAlertStep2.style.display = "block";
      }
    } catch {
      submitNewPasswordBtn.disabled = false;
      submitNewPasswordBtn.classList.remove("loading");
      resetAlertStep2.className = "modal-alert error";
      resetAlertStep2.textContent = "Network error. Please try again.";
      resetAlertStep2.style.display = "block";
    }
  });
}
