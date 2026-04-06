const configuredChineseUsers = String(import.meta.env.VITE_CHINESE_MODE_USERS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

export function canAccessChineseMode(user) {
  if (!user) return false;
  const username = String(user.username || "").trim().toLowerCase();
  if (configuredChineseUsers.length > 0) {
    return configuredChineseUsers.includes(username);
  }
  return !!user.isAdmin;
}

