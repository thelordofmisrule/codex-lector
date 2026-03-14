const jwt = require("jsonwebtoken");
const db = require("./db");
const SECRET = process.env.JWT_SECRET || "codex-lector-dev-secret-CHANGE";

const createToken = u => jwt.sign({
  id:u.id,
  username:u.username,
  isAdmin:!!u.is_admin,
  canPublishGlobal:!!u.can_publish_global,
}, SECRET, { expiresIn:"30d" });
const tok = req => req.cookies?.token || req.headers.authorization?.replace("Bearer ","") || null;

function hydrateUser(payload) {
  if (!payload?.id) return null;
  const user = db.prepare("SELECT id, username, is_admin, can_publish_global FROM users WHERE id=?").get(payload.id);
  if (!user) return null;
  return {
    ...payload,
    id: user.id,
    username: user.username,
    isAdmin: !!user.is_admin,
    canPublishGlobal: !!user.can_publish_global,
  };
}

function optionalAuth(req, res, next) {
  const t = tok(req);
  if (t) {
    try {
      req.user = hydrateUser(jwt.verify(t, SECRET)) || undefined;
    } catch {}
  }
  next();
}
function requireAuth(req, res, next) {
  const t = tok(req);
  if (!t) return res.status(401).json({ error:"Auth required." });
  try {
    const payload = jwt.verify(t, SECRET);
    const user = hydrateUser(payload);
    if (!user) return res.status(401).json({ error:"Invalid token." });
    req.user = user;
    next();
  }
  catch { res.status(401).json({ error:"Invalid token." }); }
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.isAdmin) return res.status(403).json({ error:"Admin only." });
    next();
  });
}
function requireEditorial(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.canPublishGlobal && !req.user.isAdmin) {
      return res.status(403).json({ error:"Editorial only." });
    }
    next();
  });
}

module.exports = { createToken, optionalAuth, requireAuth, requireAdmin, requireEditorial };
