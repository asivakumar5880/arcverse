// server/adminAuth.js — Secure Admin Authentication & Backend Middleware
// Features:
//   - PostgreSQL user lookup and bcrypt password verification
//   - Fallback to environment variables if database is temporarily unavailable
//   - JWT signed session tokens (supports session vs remember-me persistent tokens)
//   - Rate limiting: 5 failed attempts -> 15-minute lockout
//   - Time-limited, single-use password reset tokens
//   - Token verification middleware for all admin write actions

import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

// Load environment variables
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "arcverse_default_fallback_secret_key_2026_xyz";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

// Database Pool
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "arcverse_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("[ArcVerse DB Pool Error]", err.message);
});

// Rate limiting in-memory store
// key (client IP) -> { count: number, lockedUntil: number }
const loginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function getClientIdentifier(req) {
  return req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "client_default";
}

function checkRateLimit(clientId) {
  const record = loginAttempts.get(clientId);
  if (!record) return { locked: false };

  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingMin = Math.ceil((record.lockedUntil - now) / 60000);
    return {
      locked: true,
      message: `Too many failed login attempts. Login locked for ${remainingMin} more minute${remainingMin > 1 ? "s" : ""}.`,
    };
  }

  // If lockout expired, reset
  if (record.lockedUntil && now >= record.lockedUntil) {
    loginAttempts.delete(clientId);
    return { locked: false };
  }

  return { locked: false };
}

function recordFailedAttempt(clientId) {
  const record = loginAttempts.get(clientId) || { count: 0, lockedUntil: 0 };
  record.count += 1;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }

  loginAttempts.set(clientId, record);
}

function resetAttempts(clientId) {
  loginAttempts.delete(clientId);
}

/**
 * Normalizes email address
 */
export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/**
 * Look up user in PostgreSQL, with fallback to environment variables
 */
async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  try {
    const res = await pool.query(
      "SELECT id, name, email, password_hash, role FROM users WHERE LOWER(email) = $1 LIMIT 1",
      [normalized]
    );
    if (res.rows.length > 0) {
      return res.rows[0];
    }
  } catch (err) {
    console.warn("[ArcVerse Auth] DB lookup failed, falling back to environment config:", err.message);
  }

  // Fallback to configured environment admin
  if (ADMIN_EMAIL && normalized === ADMIN_EMAIL && ADMIN_PASSWORD_HASH) {
    return {
      id: "env_admin_owner",
      name: "Siva (Admin)",
      email: ADMIN_EMAIL,
      password_hash: ADMIN_PASSWORD_HASH,
      role: "admin",
    };
  }

  return null;
}

/**
 * Parses JSON body from Node.js IncomingMessage.
 */
function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

/**
 * Validates bearer token from Authorization header.
 * Allows both 'admin' and 'user' roles, exposing admin boolean.
 */
export function verifyAdminToken(req) {
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid authorization token" };
  }

  const token = authHeader.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && (decoded.role === "admin" || decoded.role === "user")) {
      return { valid: true, admin: decoded.role === "admin", payload: decoded };
    }
    return { valid: false, error: "Unauthorized role" };
  } catch (err) {
    return { valid: false, error: err.message || "Invalid or expired session token" };
  }
}

/**
 * Vite Dev Server & Connect Plugin Middleware
 */
export function adminAuthPlugin() {
  return {
    name: "arcverse-admin-auth",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? req.url.split("?")[0] : "";

        // 1. POST /api/auth/register or /api/admin/register
        if (req.method === "POST" && (url === "/api/auth/register" || url === "/api/admin/register")) {
          const clientId = getClientIdentifier(req);
          const rateCheck = checkRateLimit(clientId);
          if (rateCheck.locked) {
            return sendJson(res, 429, { error: rateCheck.message });
          }

          const body = await parseJsonBody(req);
          const name = typeof body.name === "string" ? body.name.trim() : "";
          const email = normalizeEmail(body.email);
          const password = typeof body.password === "string" ? body.password : "";
          const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

          if (!name || name.length < 2) {
            return sendJson(res, 400, { error: "Full Name must be at least 2 characters." });
          }
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return sendJson(res, 400, { error: "Enter a valid email address." });
          }
          if (!password || password.length < 6) {
            return sendJson(res, 400, { error: "Password must be at least 6 characters long." });
          }
          if (password !== confirmPassword) {
            return sendJson(res, 400, { error: "Passwords do not match." });
          }

          try {
            // Check if user already exists
            const existing = await pool.query(
              "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1",
              [email]
            );
            if (existing.rows.length > 0) {
              return sendJson(res, 409, { error: "An account with this email address already exists. Please sign in." });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const insertRes = await pool.query(
              `INSERT INTO users (name, email, password_hash, role)
               VALUES ($1, $2, $3, 'user')
               RETURNING id, name, email, role, created_at`,
              [name, email, passwordHash]
            );

            const newUser = insertRes.rows[0];

            // Generate JWT token
            const token = jwt.sign(
              {
                sub: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: "user",
              },
              JWT_SECRET,
              { expiresIn: "7d" }
            );

            return sendJson(res, 201, {
              success: true,
              message: "Account created successfully.",
              token,
              user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: "user",
              },
            });
          } catch (err) {
            console.error("[ArcVerse Auth] Registration error:", err);
            return sendJson(res, 500, { error: "Failed to create account. Please try again." });
          }
        }

        // 2. POST /api/admin/login or /api/auth/login
        if (req.method === "POST" && (url === "/api/admin/login" || url === "/api/auth/login")) {
          const clientId = getClientIdentifier(req);
          const rateCheck = checkRateLimit(clientId);
          if (rateCheck.locked) {
            return sendJson(res, 429, { error: rateCheck.message });
          }

          const body = await parseJsonBody(req);
          const email = normalizeEmail(body.email);
          const password = body.password;
          const rememberMe = Boolean(body.rememberMe);

          if (!email) {
            return sendJson(res, 400, { error: "Email is required." });
          }
          if (!password || typeof password !== "string") {
            return sendJson(res, 400, { error: "Password is required." });
          }

          try {
            const user = await findUserByEmail(email);

            if (!user) {
              recordFailedAttempt(clientId);
              return sendJson(res, 401, { error: "Incorrect email or password." });
            }

            const matches = await bcrypt.compare(password, user.password_hash);
            if (!matches) {
              recordFailedAttempt(clientId);
              return sendJson(res, 401, { error: "Incorrect email or password." });
            }

            // Success: reset rate limit attempts
            resetAttempts(clientId);

            // Expiry based on rememberMe: 30 days vs configured session expiry
            const expiresIn = rememberMe ? "30d" : (process.env.JWT_EXPIRES_IN || "24h");

            // Generate signed JWT token
            const token = jwt.sign(
              {
                sub: user.id,
                name: user.name || "ArcVerse Member",
                email: user.email,
                role: user.role || "user",
              },
              JWT_SECRET,
              { expiresIn }
            );

            return sendJson(res, 200, {
              success: true,
              token,
              expiresIn,
              rememberMe,
              user: {
                id: user.id,
                name: user.name || "ArcVerse Member",
                email: user.email,
                role: user.role || "user",
              },
            });
          } catch (err) {
            console.error("[ArcVerse Auth] Login error:", err);
            return sendJson(res, 500, { error: "Authentication check error. Please try again later." });
          }
        }

        // 2. POST /api/admin/forgot-password
        if (req.method === "POST" && url === "/api/admin/forgot-password") {
          const body = await parseJsonBody(req);
          const email = normalizeEmail(body.email);

          if (!email) {
            return sendJson(res, 400, { error: "Email is required." });
          }

          try {
            const user = await findUserByEmail(email);
            if (!user) {
              // Return generic message to prevent email enumeration
              return sendJson(res, 200, {
                success: true,
                message: "If an account matches that email, a password reset token has been issued.",
              });
            }

            // Generate cryptographically secure reset token
            const rawToken = crypto.randomBytes(32).toString("hex");
            const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

            try {
              await pool.query(
                `INSERT INTO password_resets (user_id, token_hash, expires_at)
                 VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
                [user.id === "env_admin_owner" ? null : user.id, tokenHash]
              );
            } catch (dbErr) {
              console.warn("[ArcVerse Auth] Could not store reset token in DB:", dbErr.message);
            }

            // For owner/admin account, never return the resetToken in the public JSON response to prevent account takeover
            if (user.role === "admin" || (ADMIN_EMAIL && user.email === ADMIN_EMAIL)) {
              console.log(`[ArcVerse Auth Security] Admin password reset token generated for ${user.email}. Secured token: ${rawToken}`);
              return sendJson(res, 200, {
                success: true,
                message: "A password reset request for the administrator account has been recorded and secured.",
              });
            }

            // In local/dev environments for normal users, return resetToken directly so user can reset password immediately
            return sendJson(res, 200, {
              success: true,
              message: "Password reset token generated successfully. Valid for 1 hour.",
              resetToken: rawToken,
            });
          } catch (err) {
            console.error("[ArcVerse Auth] Forgot password error:", err);
            return sendJson(res, 500, { error: "Unable to process password reset request." });
          }
        }

        // 3. POST /api/admin/reset-password
        if (req.method === "POST" && url === "/api/admin/reset-password") {
          const body = await parseJsonBody(req);
          const rawToken = typeof body.token === "string" ? body.token.trim() : "";
          const newPassword = body.newPassword;

          if (!rawToken) {
            return sendJson(res, 400, { error: "Reset token is required." });
          }
          if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
            return sendJson(res, 400, { error: "New password must be at least 6 characters long." });
          }

          const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

          try {
            const resReset = await pool.query(
              `SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at
               FROM password_resets pr
               WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > NOW()
               LIMIT 1`,
              [tokenHash]
            );

            if (resReset.rows.length === 0) {
              return sendJson(res, 400, { error: "Invalid, expired, or already used reset token." });
            }

            const resetRow = resReset.rows[0];
            const newHash = await bcrypt.hash(newPassword, 10);

            if (resetRow.user_id) {
              await pool.query(
                "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
                [newHash, resetRow.user_id]
              );
            }
            await pool.query(
              "UPDATE password_resets SET used_at = NOW() WHERE id = $1",
              [resetRow.id]
            );

            return sendJson(res, 200, {
              success: true,
              message: "Password updated successfully. You can now log in with your new password.",
            });
          } catch (err) {
            console.error("[ArcVerse Auth] Reset password error:", err);
            return sendJson(res, 500, { error: "Failed to reset password. Please try again." });
          }
        }

        // 4. GET /api/admin/verify or /api/auth/verify
        if (req.method === "GET" && (url === "/api/admin/verify" || url === "/api/auth/verify")) {
          const check = verifyAdminToken(req);
          if (check.valid) {
            return sendJson(res, 200, {
              valid: true,
              admin: check.payload.role === "admin",
              user: {
                id: check.payload.sub,
                name: check.payload.name || "ArcVerse Member",
                email: check.payload.email,
                role: check.payload.role || "user",
              },
            });
          } else {
            return sendJson(res, 401, { valid: false, error: check.error });
          }
        }

        // 5. POST /api/admin/logout or /api/auth/logout
        if (req.method === "POST" && (url === "/api/admin/logout" || url === "/api/auth/logout")) {
          return sendJson(res, 200, { success: true, message: "Logged out successfully" });
        }

        // 6. Admin mutation endpoints check (POST / DELETE /api/admin/*)
        if (url.startsWith("/api/admin/") && req.method !== "OPTIONS") {
          const check = verifyAdminToken(req);
          if (!check.valid || !check.admin) {
            return sendJson(res, 403, { error: "Forbidden: Administrator privileges required for this action." });
          }
          if (url === "/api/admin/episodes" || url.startsWith("/api/admin/episodes/")) {
            return sendJson(res, 200, { success: true, message: "Admin action authorized." });
          }
        }

        next();
      });
    },
  };
}
