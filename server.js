const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const connectDatabase = require("./config/db");
const authRoutes = require("./routes/authRoutes");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const publicDirectory = path.join(__dirname, "public");

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
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

app.use("/api/auth", authRoutes);
app.use("/api", (_req, res) => {
  res.status(404).json({ message: "API route not found." });
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
