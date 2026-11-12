// signup.js — ArcVerse Public User Registration Logic

import { isSessionValid } from "./auth.js";

/* ---- If already logged in, redirect to the app ---- */
if (isSessionValid()) {
  location.replace("/index.html");
}

/* ---- DOM Elements ---- */
const form                 = document.getElementById("signupForm");
const nameInput            = document.getElementById("nameInput");
const emailInput           = document.getElementById("emailInput");
const passwordInput        = document.getElementById("passwordInput");
const confirmPasswordInput = document.getElementById("confirmPasswordInput");
const signupBtn            = document.getElementById("signupBtn");
const signupCard           = document.getElementById("signupCard");

const eyeBtn1              = document.getElementById("eyeBtn1");
const eyeOpen1             = document.getElementById("eyeOpen1");
const eyeClosed1           = document.getElementById("eyeClosed1");

const eyeBtn2              = document.getElementById("eyeBtn2");
const eyeOpen2             = document.getElementById("eyeOpen2");
const eyeClosed2           = document.getElementById("eyeClosed2");

const globalError          = document.getElementById("globalError");
const globalErrorMsg       = document.getElementById("globalErrorMsg");
const nameError            = document.getElementById("nameError");
const emailError           = document.getElementById("emailError");
const passwordError        = document.getElementById("passwordError");
const confirmPasswordError = document.getElementById("confirmPasswordError");

/* ---- Helper Functions ---- */
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
  signupBtn.disabled = on;
  if (on) signupBtn.classList.add("loading");
  else    signupBtn.classList.remove("loading");
}

function shakeCard() {
  signupCard.classList.remove("shake");
  void signupCard.offsetWidth; // reflow
  signupCard.classList.add("shake");
  signupCard.addEventListener("animationend", () => signupCard.classList.remove("shake"), { once: true });
}

function successAndRedirect() {
  signupBtn.classList.remove("loading");
  signupBtn.classList.add("success-state");
  signupBtn.disabled = true;
  clearGlobalError();

  setTimeout(() => {
    signupCard.classList.add("success-out");
    signupCard.addEventListener("animationend", () => {
      location.replace("/index.html");
    }, { once: true });
  }, 400);
}

/* ---- Focus ---- */
nameInput.focus();

/* ---- Eye Toggles ---- */
function setupEyeToggle(btn, input, openIcon, closedIcon) {
  btn.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    openIcon.style.display   = isHidden ? "none" : "";
    closedIcon.style.display = isHidden ? ""     : "none";
    btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  });
}

setupEyeToggle(eyeBtn1, passwordInput, eyeOpen1, eyeClosed1);
setupEyeToggle(eyeBtn2, confirmPasswordInput, eyeOpen2, eyeClosed2);

/* ---- Clear errors on input ---- */
nameInput.addEventListener("input", () => clearFieldError(nameError));
emailInput.addEventListener("input", () => clearFieldError(emailError));
passwordInput.addEventListener("input", () => {
  clearFieldError(passwordError);
  clearGlobalError();
});
confirmPasswordInput.addEventListener("input", () => {
  clearFieldError(confirmPasswordError);
  clearGlobalError();
});

/* ---- Client Validation ---- */
function validate() {
  let ok = true;
  clearFieldError(nameError);
  clearFieldError(emailError);
  clearFieldError(passwordError);
  clearFieldError(confirmPasswordError);
  clearGlobalError();

  const name    = nameInput.value.trim();
  const email   = emailInput.value.trim();
  const pwd     = passwordInput.value;
  const confirm = confirmPasswordInput.value;

  if (!name || name.length < 2) {
    showFieldError(nameError, "Full Name must be at least 2 characters.");
    nameInput.classList.add("invalid");
    ok = false;
  } else {
    nameInput.classList.remove("invalid");
  }

  if (!email) {
    showFieldError(emailError, "Email address is required.");
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
  } else if (pwd.length < 6) {
    showFieldError(passwordError, "Password must be at least 6 characters.");
    passwordInput.classList.add("invalid");
    ok = false;
  } else {
    passwordInput.classList.remove("invalid");
  }

  if (!confirm) {
    showFieldError(confirmPasswordError, "Please confirm your password.");
    confirmPasswordInput.classList.add("invalid");
    ok = false;
  } else if (confirm !== pwd) {
    showFieldError(confirmPasswordError, "Passwords do not match.");
    confirmPasswordInput.classList.add("invalid");
    ok = false;
  } else {
    confirmPasswordInput.classList.remove("invalid");
  }

  return ok;
}

/* ---- Submit Form ---- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!validate()) {
    shakeCard();
    return;
  }

  setLoading(true);
  clearGlobalError();

  const name = nameInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, confirmPassword }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success && data.token) {
      // Success: Save auth session and redirect
      try {
        localStorage.setItem("arcverse_admin_token", data.token);
        localStorage.setItem("arcverse_admin_auth", "true");
        localStorage.setItem("arcverse_admin_email", email);
        if (data.user?.name) {
          localStorage.setItem("arcverse_user_name", data.user.name);
        }
      } catch {}

      successAndRedirect();
      return;
    }

    // Failure handling
    setLoading(false);

    if (res.status === 409) {
      showGlobalError(data.error || "An account with this email already exists. Please sign in.");
      emailInput.focus();
    } else {
      showGlobalError(data.error || "Failed to create account. Please check your details.");
    }
    shakeCard();

  } catch {
    setLoading(false);
    showGlobalError("Unable to reach server. Please check your connection.");
    shakeCard();
  }
});
