/**
 * server/passport.js
 * Configures OAuth strategies. Only strategies with valid credentials are enabled.
 */
const passport = require("passport");
const db = require("./db");

const AVATAR_COLORS = ["#7A1E2E","#2E5A3C","#1E3A5F","#5C3D6E","#8B6914","#6B3A2E","#2E6B6B","#4A4A6A"];
const randomColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
const OAUTH_BASE_URL = (process.env.SITE_URL || process.env.BASE_URL || "http://localhost:3001").replace(/\/$/, "");

/**
 * Find or create a user from an OAuth profile.
 * If they've logged in with this provider before, return existing user.
 * Otherwise create a new account.
 */
function findOrCreateOAuthUser(provider, profile, done) {
  try {
    const oauthId = profile.id;
    const displayName = profile.displayName || profile.username || "User";
    const avatar = profile.photos?.[0]?.value || null;

    // Check if this OAuth identity already exists
    let user = db.prepare("SELECT * FROM users WHERE oauth_provider=? AND oauth_id=?").get(provider, oauthId);

    if (user) {
      // Keep avatars fresh without expanding the stored OAuth profile.
      db.prepare("UPDATE users SET oauth_avatar=COALESCE(?,oauth_avatar) WHERE id=?")
        .run(avatar, user.id);
      return done(null, user);
    }

    // Generate a temporary username — user will choose their real one during onboarding
    let base = (profile.username || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
    let username = base;
    let suffix = 1;
    while (db.prepare("SELECT 1 FROM users WHERE username=?").get(username)) {
      username = `${base}${suffix++}`;
    }

    const result = db.prepare(
      "INSERT INTO users (username, display_name, oauth_provider, oauth_id, oauth_avatar, avatar_color, needs_onboarding) VALUES (?,?,?,?,?,?,1)"
    ).run(username, displayName, provider, oauthId, avatar, randomColor());

    user = db.prepare("SELECT * FROM users WHERE id=?").get(result.lastInsertRowid);
    done(null, user);
  } catch (err) {
    done(err);
  }
}

// Track which providers are enabled
const enabledProviders = [];

/* ── Google ── */
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const GoogleStrategy = require("passport-google-oauth20").Strategy;
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${OAUTH_BASE_URL}/api/auth/google/callback`,
    scope: ["profile"],
  }, (accessToken, refreshToken, profile, done) => {
    findOrCreateOAuthUser("google", profile, done);
  }));
  enabledProviders.push("google");
  console.log("  ✓ Google OAuth enabled");
}

/* ── GitHub ── */
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  const GitHubStrategy = require("passport-github2").Strategy;
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: `${OAUTH_BASE_URL}/api/auth/github/callback`,
    scope: ["read:user"],
  }, (accessToken, refreshToken, profile, done) => {
    findOrCreateOAuthUser("github", profile, done);
  }));
  enabledProviders.push("github");
  console.log("  ✓ GitHub OAuth enabled");
}

/* ── Twitter / X ── */
if (process.env.TWITTER_CONSUMER_KEY && process.env.TWITTER_CONSUMER_SECRET) {
  const TwitterStrategy = require("passport-twitter").Strategy;
  passport.use(new TwitterStrategy({
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
    callbackURL: `${OAUTH_BASE_URL}/api/auth/twitter/callback`,
  }, (token, tokenSecret, profile, done) => {
    findOrCreateOAuthUser("twitter", profile, done);
  }));
  enabledProviders.push("twitter");
  console.log("  ✓ Twitter/X OAuth enabled");
}

if (enabledProviders.length === 0) {
  console.log("  ⚠ No OAuth providers configured — only admin local login available");
  console.log("    Copy .env.example to .env and add your OAuth credentials");
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  done(null, user);
});

module.exports = { passport, enabledProviders };
