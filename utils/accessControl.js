const crypto = require("crypto");

const ADMIN_ROLE = "admin";
const USER_ROLE = "user";
const ADMIN_SESSION_COOKIE_NAME = "loanTrackerAdminSession";
const ADMIN_SESSION_HOURS = Math.max(Number(process.env.ADMIN_SESSION_HOURS) || 8, 1);

function normalizeEmail(value) {
  return value?.trim().toLowerCase();
}

function getAdminSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || "loan-tracker-admin-dev-secret";
}

function getConfiguredAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((value) => normalizeEmail(value))
      .filter(Boolean)
  );
}

function getUserRole(user) {
  if (!user) {
    return USER_ROLE;
  }

  if (user.role === ADMIN_ROLE) {
    return ADMIN_ROLE;
  }

  const email = normalizeEmail(user.email);

  if (email && getConfiguredAdminEmails().has(email)) {
    return ADMIN_ROLE;
  }

  return USER_ROLE;
}

function isAdminUser(user) {
  return getUserRole(user) === ADMIN_ROLE;
}

function createTokenSignature(encodedPayload) {
  return crypto.createHmac("sha256", getAdminSessionSecret()).update(encodedPayload).digest("base64url");
}

function createAdminSessionToken(user) {
  const payload = {
    userId: String(user._id || user.id),
    firstName: user.firstName,
    lastName: user.lastName,
    email: normalizeEmail(user.email),
    role: ADMIN_ROLE,
    expiresAt: Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createTokenSignature(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function parseCookieHeader(header = "") {
  return header.split(";").reduce((cookies, entry) => {
    const separatorIndex = entry.indexOf("=");

    if (separatorIndex === -1) {
      return cookies;
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();

    if (key) {
      cookies[key] = decodeURIComponent(value);
    }

    return cookies;
  }, {});
}

function readAdminSession(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = cookies[ADMIN_SESSION_COOKIE_NAME];

  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createTokenSignature(encodedPayload);

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));

    if (payload.role !== ADMIN_ROLE || !payload.expiresAt || payload.expiresAt <= Date.now()) {
      return null;
    }

    return payload;
  } catch (_error) {
    return null;
  }
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || "/"}`];

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function createAdminSessionCookie(user) {
  const maxAgeSeconds = ADMIN_SESSION_HOURS * 60 * 60;

  return serializeCookie(ADMIN_SESSION_COOKIE_NAME, createAdminSessionToken(user), {
    path: "/",
    maxAge: maxAgeSeconds,
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production"
  });
}

function clearAdminSessionCookie() {
  return serializeCookie(ADMIN_SESSION_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production"
  });
}

module.exports = {
  ADMIN_ROLE,
  USER_ROLE,
  clearAdminSessionCookie,
  createAdminSessionCookie,
  getUserRole,
  isAdminUser,
  normalizeEmail,
  readAdminSession
};
