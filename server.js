const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const connectDatabase = require("./config/db");
const { requireAdminApiAccess, requireAdminPageAccess } = require("./middleware/adminAccess");
const authRoutes = require("./routes/authRoutes");
const lenderRoutes = require("./routes/lenderRoutes");
const loanRoutes = require("./routes/loanRoutes");
const messageRoutes = require("./routes/messageRoutes");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const publicDirectory = path.join(__dirname, "public");
const privateDirectory = path.join(__dirname, "private");

function isAllowedLocalOrigin(origin) {
  return origin === "null" || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

app.use((req, res, next) => {
  if (req.headers.origin && isAllowedLocalOrigin(req.headers.origin)) {
    res.header("Access-Control-Allow-Origin", req.headers.origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.static(publicDirectory));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/admin/session", requireAdminApiAccess, (req, res) => {
  res.json({ admin: req.adminSession });
});

app.use("/api", lenderRoutes);
app.use("/api", loanRoutes);
app.use("/api", messageRoutes);
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

app.get("/admin/lenders", requireAdminPageAccess, (_req, res) => {
  res.sendFile(path.join(privateDirectory, "admin-lenders.html"));
});

app.get("/admin/inbox", requireAdminPageAccess, (_req, res) => {
  res.sendFile(path.join(privateDirectory, "admin-inbox.html"));
});

app.get("/admin/security", requireAdminPageAccess, (_req, res) => {
  res.sendFile(path.join(privateDirectory, "admin-security.html"));
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
