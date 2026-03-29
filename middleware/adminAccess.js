const { readAdminSession } = require("../utils/accessControl");

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

module.exports = {
  requireAdminApiAccess,
  requireAdminPageAccess
};
