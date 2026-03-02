const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "codex-lector-dev-secret-CHANGE";

const createToken = u => jwt.sign({ id:u.id, username:u.username, isAdmin:!!u.is_admin }, SECRET, { expiresIn:"30d" });
const tok = req => req.cookies?.token || req.headers.authorization?.replace("Bearer ","") || null;

function optionalAuth(req, res, next) {
  const t = tok(req);
  if (t) try { req.user = jwt.verify(t, SECRET); } catch {}
  next();
}
function requireAuth(req, res, next) {
  const t = tok(req);
  if (!t) return res.status(401).json({ error:"Auth required." });
  try { req.user = jwt.verify(t, SECRET); next(); }
  catch { res.status(401).json({ error:"Invalid token." }); }
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.isAdmin) return res.status(403).json({ error:"Admin only." });
    next();
  });
}

module.exports = { createToken, optionalAuth, requireAuth, requireAdmin };
