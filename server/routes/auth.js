const express = require("express");
const bcrypt = require("bcryptjs");
const pp = require("passport");
const db = require("../db");
const { createToken, requireAuth, requireAdmin } = require("../auth");
const { enabledProviders } = require("../passport");
const r = express.Router();

const COOKIE = { httpOnly:true, secure:process.env.NODE_ENV==="production", sameSite:"lax", maxAge:30*86400000 };
const AVATAR_COLORS = ["#7A1E2E","#2E5A3C","#1E3A5F","#5C3D6E","#8B6914","#6B3A2E","#2E6B6B","#4A4A6A"];
const FRONTEND = process.env.SITE_URL || process.env.BASE_URL || "http://localhost:5173";

/* ── Which providers are available? (used by frontend to show buttons) ── */
r.get("/providers", (req, res) => {
  res.json({ providers: enabledProviders, localLogin: true });
});

/* ── Admin local login (password-based — admin only) ── */
r.post("/login", (req, res) => {
  const { username, password } = req.body;
  const u = db.prepare("SELECT * FROM users WHERE username=?").get(username?.toLowerCase());
  if (!u || !u.password_hash || !bcrypt.compareSync(password || "", u.password_hash))
    return res.status(401).json({ error: "Invalid credentials." });
  res.cookie("token", createToken(u), COOKIE);
  res.json({ id:u.id, username:u.username, displayName:u.display_name, isAdmin:!!u.is_admin });
});

/* ── OAuth routes ── */
function oauthCallback(provider) {
  return (req, res, next) => {
    pp.authenticate(provider, { session:false, failureRedirect:`${FRONTEND}/?auth=failed` }, (err, user) => {
      if (err || !user) return res.redirect(`${FRONTEND}/?auth=failed`);
      res.cookie("token", createToken(user), COOKIE);
      res.redirect(`${FRONTEND}/?auth=success`);
    })(req, res, next);
  };
}

// Google
r.get("/google", pp.authenticate("google", { session:false, scope:["profile","email"] }));
r.get("/google/callback", oauthCallback("google"));

// GitHub
r.get("/github", pp.authenticate("github", { session:false, scope:["user:email"] }));
r.get("/github/callback", oauthCallback("github"));

// Twitter
r.get("/twitter", pp.authenticate("twitter", { session:false }));
r.get("/twitter/callback", oauthCallback("twitter"));

/* ── Session ── */
r.get("/me", requireAuth, (req, res) => {
  const u = db.prepare("SELECT id,username,display_name,is_admin,bio,avatar_color,oauth_provider,oauth_avatar,email,needs_onboarding,created_at FROM users WHERE id=?").get(req.user.id);
  if (!u) return res.status(404).json({ error:"Not found." });
  res.json({
    id:u.id, username:u.username, displayName:u.display_name, isAdmin:!!u.is_admin,
    bio:u.bio||"", avatarColor:u.avatar_color, oauthProvider:u.oauth_provider,
    oauthAvatar:u.oauth_avatar, email:u.email, needsOnboarding:!!u.needs_onboarding,
    createdAt:u.created_at,
  });
});

r.post("/logout", (req, res) => { res.clearCookie("token"); res.json({ ok:true }); });

/* ── Onboarding: new OAuth users choose username + display name ── */
r.post("/onboard", requireAuth, (req, res) => {
  const { username, displayName } = req.body;
  if (!username?.trim() || !displayName?.trim()) return res.status(400).json({ error:"Username and display name required." });
  const clean = username.trim().toLowerCase();
  if (clean.length < 3) return res.status(400).json({ error:"Username must be at least 3 characters." });
  if (clean.length > 24) return res.status(400).json({ error:"Username must be 24 characters or fewer." });
  if (!/^[a-z0-9_]+$/.test(clean)) return res.status(400).json({ error:"Username can only contain letters, numbers, and underscores." });
  // Check uniqueness (allow keeping current username)
  const existing = db.prepare("SELECT id FROM users WHERE username=? AND id!=?").get(clean, req.user.id);
  if (existing) return res.status(409).json({ error:"Username taken." });
  db.prepare("UPDATE users SET username=?, display_name=?, needs_onboarding=0 WHERE id=?")
    .run(clean, displayName.trim().slice(0,50), req.user.id);
  const u = db.prepare("SELECT id,username,display_name,is_admin,bio,avatar_color,oauth_provider,oauth_avatar,needs_onboarding FROM users WHERE id=?").get(req.user.id);
  res.json({ id:u.id, username:u.username, displayName:u.display_name, isAdmin:!!u.is_admin, needsOnboarding:false });
});

/* ── Change username (any user, once set up) ── */
r.post("/change-username", requireAuth, (req, res) => {
  const { username } = req.body;
  if (!username?.trim()) return res.status(400).json({ error:"Username required." });
  const clean = username.trim().toLowerCase();
  if (clean.length < 3) return res.status(400).json({ error:"Username must be at least 3 characters." });
  if (clean.length > 24) return res.status(400).json({ error:"Username must be 24 characters or fewer." });
  if (!/^[a-z0-9_]+$/.test(clean)) return res.status(400).json({ error:"Username can only contain letters, numbers, and underscores." });
  const existing = db.prepare("SELECT id FROM users WHERE username=? AND id!=?").get(clean, req.user.id);
  if (existing) return res.status(409).json({ error:"Username taken." });
  db.prepare("UPDATE users SET username=? WHERE id=?").run(clean, req.user.id);
  res.json({ ok:true, username:clean });
});

/* ── Change password (only for users who have a password, i.e. admin) ── */
r.post("/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both fields required." });
  if (newPassword.length < 6) return res.status(400).json({ error: "New password: 6+ chars." });
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!u.password_hash) return res.status(400).json({ error: "OAuth accounts cannot change password." });
  if (!bcrypt.compareSync(currentPassword, u.password_hash))
    return res.status(401).json({ error: "Current password incorrect." });
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ ok: true });
});

/* ── Profile: get public profile ── */
r.get("/profile/:username", (req, res) => {
  const u = db.prepare("SELECT id,username,display_name,bio,avatar_color,oauth_provider,oauth_avatar,is_admin,created_at FROM users WHERE username=?")
    .get(req.params.username.toLowerCase());
  if (!u) return res.status(404).json({ error:"User not found." });

  const annotCount = db.prepare("SELECT COUNT(*) as n FROM annotations WHERE user_id=?").get(u.id)?.n || 0;
  const discCount = db.prepare("SELECT COUNT(*) as n FROM discussions WHERE user_id=?").get(u.id)?.n || 0;
  const forumCount = db.prepare("SELECT COUNT(*) as n FROM forum_threads WHERE user_id=?").get(u.id)?.n || 0;

  res.json({
    id:u.id, username:u.username, displayName:u.display_name, bio:u.bio||"",
    avatarColor:u.avatar_color||"#7A1E2E", oauthProvider:u.oauth_provider,
    oauthAvatar:u.oauth_avatar, isAdmin:!!u.is_admin, createdAt:u.created_at,
    stats:{ annotations:annotCount, discussions:discCount, forumThreads:forumCount },
  });
});

/* ── Profile: update own profile ── */
r.put("/profile", requireAuth, (req, res) => {
  const { displayName, bio, avatarColor } = req.body;
  const updates = [];
  const vals = [];
  if (displayName !== undefined) { updates.push("display_name=?"); vals.push(displayName.trim().slice(0,50)); }
  if (bio !== undefined) { updates.push("bio=?"); vals.push(bio.trim().slice(0,500)); }
  if (avatarColor !== undefined && /^#[0-9a-fA-F]{6}$/.test(avatarColor)) { updates.push("avatar_color=?"); vals.push(avatarColor); }
  if (updates.length === 0) return res.status(400).json({ error:"Nothing to update." });
  vals.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(",")} WHERE id=?`).run(...vals);
  const u = db.prepare("SELECT id,username,display_name,bio,avatar_color,is_admin,created_at FROM users WHERE id=?").get(req.user.id);
  res.json({ id:u.id, username:u.username, displayName:u.display_name, bio:u.bio||"", avatarColor:u.avatar_color, isAdmin:!!u.is_admin, createdAt:u.created_at });
});

module.exports = r;
