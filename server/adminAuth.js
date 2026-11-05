// server/adminAuth.js — Secure Admin Authentication & Backend Middleware
// Features:
//   - bcrypt password verification against process.env.ADMIN_PASSWORD_HASH
//   - JWT signed session tokens (expires in 7 days)
//   - Rate limiting: 5 failed attempts -> 15-minute lockout
//   - Token verification middleware for all admin write actions

import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Load environment variables
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "arcverse_default_fallback_secret_key_2026_xyz";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

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
 * Parses JSON body from Node.js IncomingMessage.
 */
function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // Protect against gigantic payloads
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
 * Validates admin bearer token from Authorization header.
 */
export function verifyAdminToken(req) {
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid authorization token" };
  }

  const token = authHeader.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.role === "admin") {
      return { valid: true, admin: true, payload: decoded };
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

        // 1. POST /api/admin/login
        if (req.method === "POST" && url === "/api/admin/login") {
          const clientId = getClientIdentifier(req);
          const rateCheck = checkRateLimit(clientId);
          if (rateCheck.locked) {
            return sendJson(res, 429, { error: rateCheck.message });
          }

          const body = await parseJsonBody(req);
          const password = body.password;

          if (!password || typeof password !== "string") {
            recordFailedAttempt(clientId);
            return sendJson(res, 400, { error: "Password is required." });
          }

          if (!ADMIN_PASSWORD_HASH) {
            console.error("[ArcVerse Security Alert] ADMIN_PASSWORD_HASH is not set in environment!");
            return sendJson(res, 500, { error: "Server authentication is not configured. Check .env file." });
          }

          try {
            const matches = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
            if (!matches) {
              recordFailedAttempt(clientId);
              return sendJson(res, 401, { error: "Incorrect password" });
            }

            // Success: reset rate limit attempts
            resetAttempts(clientId);

            // Generate signed JWT token
            const token = jwt.sign(
              { role: "admin", sub: "arcverse_owner" },
              JWT_SECRET,
              { expiresIn: JWT_EXPIRES_IN }
            );

            return sendJson(res, 200, {
              success: true,
              token,
              expiresIn: JWT_EXPIRES_IN,
            });
          } catch (err) {
            console.error("bcrypt error:", err);
            return sendJson(res, 500, { error: "Authentication check error." });
          }
        }

        // 2. GET /api/admin/verify
        if (req.method === "GET" && url === "/api/admin/verify") {
          const check = verifyAdminToken(req);
          if (check.valid) {
            return sendJson(res, 200, { valid: true, admin: true });
          } else {
            return sendJson(res, 401, { valid: false, error: check.error });
          }
        }

        // 3. POST /api/admin/logout
        if (req.method === "POST" && url === "/api/admin/logout") {
          return sendJson(res, 200, { success: true, message: "Logged out successfully" });
        }

        // 4. Admin mutation endpoints check (POST / DELETE /api/admin/*)
        if (url.startsWith("/api/admin/") && req.method !== "OPTIONS") {
          const check = verifyAdminToken(req);
          if (!check.valid) {
            return sendJson(res, 403, { error: "Forbidden: Admin token required for this action." });
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
