const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const connectDatabase = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const { readAdminSession } = require("./utils/accessControl");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const publicDirectory = path.join(__dirname, "public");
const privateDirectory = path.join(__dirname, "private");

function isAllowedLocalOrigin(origin) {
  return origin === "null" || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function requireAdminPageAccess(req, res, next) {
  const adminSession = readAdminSession(req);

  if (!adminSession) {
    return res.redirect("/#login");
  }

  req.adminSession = adminSession;
  next();
}

function requireAdminApiAccess(req, res, next) {
  const adminSession = readAdminSession(req);

  if (!adminSession) {
    return res.status(401).json({ message: "Admin sign-in required." });
  }

  req.adminSession = adminSession;
  next();
}

app.use((req, res, next) => {
  if (req.headers.origin && isAllowedLocalOrigin(req.headers.origin)) {
    res.header("Access-Control-Allow-Origin", req.headers.origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDirectory));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/admin/session", requireAdminApiAccess, (req, res) => {
  res.json({ admin: req.adminSession });
});

app.use("/api/auth", authRoutes);
app.use("/api", (_req, res) => {
  res.status(404).json({ message: "API route not found." });
});

app.get("/admin", requireAdminPageAccess, (_req, res) => {
  res.redirect("/admin/dashboard");
});

app.get("/admin/dashboard", requireAdminPageAccess, (_req, res) => {
  res.sendFile(path.join(privateDirectory, "admin-dashboard.html"));
});

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(publicDirectory, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled server error:", error);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({ message: "An unexpected server error occurred." });
});

async function startServer() {
  try {
    await connectDatabase();

    app.listen(PORT, () => {
      console.log(`Loan Tracker auth app is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
