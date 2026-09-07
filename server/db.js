import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (e) {}
}
loadEnv();

export const OWNER_ID = Number(process.env.OWNER_ID || 0);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'coretap.db');
if (DB_PATH !== path.join(__dirname, 'coretap.db')) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT DEFAULT '',
    first_name TEXT DEFAULT '',
    coins REAL DEFAULT 0,
    energy INTEGER DEFAULT 500,
    max_energy INTEGER DEFAULT 500,
    coins_per_tap INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS upgrades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    category TEXT DEFAULT '',
    base_cost REAL NOT NULL,
    cost_multiplier REAL DEFAULT 1.15,
    effect_type TEXT NOT NULL,
    effect_value INTEGER NOT NULL,
    max_level INTEGER DEFAULT 50
  );

  CREATE TABLE IF NOT EXISTS user_upgrades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    upgrade_id INTEGER NOT NULL,
    level INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (upgrade_id) REFERENCES upgrades(id),
    UNIQUE(user_id, upgrade_id)
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    can_remove INTEGER DEFAULT 1,
    added_by INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_tg INTEGER DEFAULT 0,
    action TEXT NOT NULL,
    target_tg INTEGER DEFAULT 0,
    detail TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  `);

const USER_COLUMNS = {
  blocked: "ALTER TABLE users ADD COLUMN blocked INTEGER DEFAULT 0",
  referrer_id: "ALTER TABLE users ADD COLUMN referrer_id INTEGER DEFAULT 0",
  total_taps: "ALTER TABLE users ADD COLUMN total_taps INTEGER DEFAULT 0",
  last_seen: "ALTER TABLE users ADD COLUMN last_seen TEXT DEFAULT ''",
  frenzy_until: "ALTER TABLE users ADD COLUMN frenzy_until TEXT DEFAULT ''",
};

function ensureUserColumns() {
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  for (const [name, sql] of Object.entries(USER_COLUMNS)) {
    if (!cols.includes(name)) db.exec(sql);
  }
}
ensureUserColumns();

const ADMIN_COLUMNS = {
  can_remove: "ALTER TABLE admins ADD COLUMN can_remove INTEGER DEFAULT 1",
  added_by: "ALTER TABLE admins ADD COLUMN added_by INTEGER DEFAULT 0",
  created_at: "ALTER TABLE admins ADD COLUMN created_at TEXT DEFAULT ''",
};

function ensureAdminColumns() {
  const cols = db.prepare('PRAGMA table_info(admins)').all().map(c => c.name);
  for (const [name, sql] of Object.entries(ADMIN_COLUMNS)) {
    if (!cols.includes(name)) db.exec(sql);
  }
}
ensureAdminColumns();

function seedOwnerAdmin() {
  if (!OWNER_ID) return;
  db.prepare(`INSERT INTO admins (telegram_id, can_remove, added_by) VALUES (?, 0, 0)
    ON CONFLICT(telegram_id) DO UPDATE SET can_remove = 0`).run(OWNER_ID);
}
seedOwnerAdmin();

const defaultUpgrades = [
  { name: 'Energy Cap', description: '+100 макс. энергии', icon: '⚡️', category: 'energy', base_cost: 250, cost_multiplier: 1.25, effect_type: 'max_energy', effect_value: 100, max_level: 30 },
  { name: 'Energy Regen', description: '+2 энергии/сек', icon: '🔋', category: 'energy', base_cost: 400, cost_multiplier: 1.35, effect_type: 'energy_regen', effect_value: 2, max_level: 50 },
  { name: 'Tap Power', description: '+2 монеты/тап', icon: '👆', category: 'tap', base_cost: 600, cost_multiplier: 1.3, effect_type: 'coins_per_tap', effect_value: 2, max_level: 50 },
  { name: 'Lucky Tap', description: '+5% шанс x10', icon: '🍀', category: 'tap', base_cost: 4500, cost_multiplier: 1.6, effect_type: 'lucky_chance', effect_value: 5, max_level: 20 },
  { name: 'Auto Tapper', description: 'Автотап офлайн', icon: '🤖', category: 'passive', base_cost: 8000, cost_multiplier: 1.8, effect_type: 'auto_tap', effect_value: 1, max_level: 15 },
  { name: 'Coin Multiplier', description: '+15% ко всем монетам', icon: '💎', category: 'boost', base_cost: 12000, cost_multiplier: 2, effect_type: 'global_multiplier', effect_value: 15, max_level: 10 },
];

function ensureUpgradeColumn() {
  const cols = db.prepare('PRAGMA table_info(upgrades)').all();
  if (!cols.some(c => c.name === 'category')) {
    db.exec("ALTER TABLE upgrades ADD COLUMN category TEXT DEFAULT ''");
  }
}

function syncUpgrades() {
  ensureUpgradeColumn();
  const upsert = db.prepare(`
    INSERT INTO upgrades (name, description, icon, category, base_cost, cost_multiplier, effect_type, effect_value, max_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      description = excluded.description,
      icon = excluded.icon,
      category = excluded.category,
      base_cost = excluded.base_cost,
      cost_multiplier = excluded.cost_multiplier,
      effect_type = excluded.effect_type,
      effect_value = excluded.effect_value,
      max_level = excluded.max_level
  `);
  for (const u of defaultUpgrades) {
    upsert.run(u.name, u.description, u.icon, u.category, u.base_cost, u.cost_multiplier, u.effect_type, u.effect_value, u.max_level);
  }
  const placeholders = defaultUpgrades.map(() => '?').join(',');
  try {
    db.prepare(`DELETE FROM upgrades WHERE name NOT IN (${placeholders})`).run(...defaultUpgrades.map(u => u.name));
  } catch (e) {
    console.warn('Upgrade cleanup skipped:', e.message);
  }
}

syncUpgrades();

export function getUser(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

export function getUserById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

export function createUser(telegramId, username, firstName) {
  const existing = getUser(telegramId);
  if (existing) return existing;
  db.prepare('INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)').run(telegramId, username, firstName);
  return getUser(telegramId);
}

export function getUpgrades() {
  return db.prepare('SELECT * FROM upgrades').all();
}

export function getUserUpgrades(userId) {
  return db.prepare('SELECT uu.*, u.name, u.description, u.icon, u.base_cost, u.cost_multiplier, u.effect_type, u.effect_value, u.max_level FROM user_upgrades uu JOIN upgrades u ON uu.upgrade_id = u.id WHERE uu.user_id = ?').all(userId);
}

export function purchaseUpgrade(userId, upgradeId) {
  const upgrade = db.prepare('SELECT * FROM upgrades WHERE id = ?').get(upgradeId);
  if (!upgrade) return { error: 'Upgrade not found' };

  const userUp = db.prepare('SELECT * FROM user_upgrades WHERE user_id = ? AND upgrade_id = ?').get(userId, upgradeId);
  const currentLevel = userUp ? userUp.level : 0;
  if (currentLevel >= upgrade.max_level) return { error: 'Max level reached' };

  const cost = Math.floor(upgrade.base_cost * Math.pow(upgrade.cost_multiplier, currentLevel));
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (user.coins < cost) return { error: 'Not enough coins' };

  db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(cost, userId);

  if (userUp) {
    db.prepare('UPDATE user_upgrades SET level = level + 1 WHERE user_id = ? AND upgrade_id = ?').run(userId, upgradeId);
  } else {
    db.prepare('INSERT INTO user_upgrades (user_id, upgrade_id, level) VALUES (?, ?, 1)').run(userId, upgradeId);
  }

  const newUp = db.prepare('SELECT * FROM user_upgrades WHERE user_id = ? AND upgrade_id = ?').get(userId, upgradeId);
  return { cost, upgrade, newLevel: newUp.level };
}

export function getLeaderboard(limit = 50) {
  return db.prepare('SELECT u.telegram_id, u.username, u.first_name, u.coins, u.level, u.xp FROM users u WHERE u.blocked = 0 ORDER BY u.coins DESC LIMIT ?').all(limit);
}

export function isAdmin(telegramId) {
  return db.prepare('SELECT * FROM admins WHERE telegram_id = ?').get(telegramId);
}

export function grantAdmin(telegramId, canRemove, addedBy) {
  db.prepare(`INSERT INTO admins (telegram_id, can_remove, added_by) VALUES (?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET can_remove = excluded.can_remove, added_by = excluded.added_by`)
    .run(telegramId, canRemove ? 1 : 0, addedBy);
  return isAdmin(telegramId);
}

export function revokeAdmin(telegramId) {
  const result = db.prepare('DELETE FROM admins WHERE telegram_id = ? AND can_remove = 1').run(telegramId);
  return result.changes > 0;
}

export function getAdmins() {
  return db.prepare(`
    SELECT a.telegram_id, a.can_remove, a.added_by, a.created_at, u.username, u.first_name, u.blocked
    FROM admins a
    LEFT JOIN users u ON u.telegram_id = a.telegram_id
    ORDER BY a.can_remove ASC, a.id ASC
  `).all();
}

export function setBlocked(telegramId, blocked) {
  db.prepare('UPDATE users SET blocked = ? WHERE telegram_id = ?').run(blocked ? 1 : 0, telegramId);
  return getUser(telegramId);
}

export function giveCoins(telegramId, amount) {
  const user = getUser(telegramId);
  if (!user) return { error: 'User not found' };
  const newCoins = Math.max(0, user.coins + amount);
  db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(newCoins, user.id);
  return { telegram_id: telegramId, coins: newCoins, delta: amount };
}

export function setUserXp(telegramId, xp) {
  const user = getUser(telegramId);
  if (!user) return { error: 'User not found' };
  const newXp = Math.max(0, Math.floor(xp));
  const level = computeLevel(newXp);
  db.prepare('UPDATE users SET xp = ?, level = ? WHERE id = ?').run(newXp, level, user.id);
  return { telegram_id: telegramId, xp: newXp, level };
}

export function resetUser(telegramId) {
  const user = getUser(telegramId);
  if (!user) return { error: 'User not found' };
  db.prepare('UPDATE users SET coins = 0, xp = 0, level = 1, energy = max_energy, frenzy_until = \'\' WHERE id = ?').run(user.id);
  db.prepare('DELETE FROM user_upgrades WHERE user_id = ?').run(user.id);
  return getUser(telegramId);
}

export function adminStats() {
  const users = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const blocked = db.prepare('SELECT COUNT(*) as c FROM users WHERE blocked = 1').get().c;
  const coins = db.prepare('SELECT COALESCE(SUM(coins),0) as s FROM users').get().s;
  const admins = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
  const taps = db.prepare('SELECT COALESCE(SUM(total_taps),0) as s FROM users').get().s;
  const today = new Date().toISOString().slice(0, 10);
  const activeToday = db.prepare('SELECT COUNT(*) as c FROM users WHERE last_seen LIKE ?').get(today + '%').c;
  return { users, blocked, coins, admins, taps, activeToday };
}

export function searchUsers(query, offset, limit) {
  const q = `%${(query || '').trim()}%`;
  const rows = db.prepare(`
    SELECT id, telegram_id, username, first_name, coins, xp, level, blocked, total_taps, created_at,
      (SELECT COUNT(*) FROM users r WHERE r.referrer_id = users.id) AS referrals
    FROM users
    WHERE username LIKE ? OR first_name LIKE ? OR CAST(telegram_id AS TEXT) LIKE ?
    ORDER BY coins DESC
    LIMIT ? OFFSET ?
  `).all(q, q, q, limit, offset);
  const total = db.prepare(`
    SELECT COUNT(*) as c FROM users
    WHERE username LIKE ? OR first_name LIKE ? OR CAST(telegram_id AS TEXT) LIKE ?
  `).get(q, q, q).c;
  return { rows, total };
}

export function logAdmin(adminTg, action, targetTg, detail) {
  db.prepare('INSERT INTO admin_logs (admin_tg, action, target_tg, detail) VALUES (?, ?, ?, ?)')
    .run(adminTg || 0, action, targetTg || 0, detail || '');
}

export function getAdminLogs(limit = 50) {
  return db.prepare(`
    SELECT l.*, u.username, u.first_name
    FROM admin_logs l
    LEFT JOIN users u ON u.telegram_id = l.target_tg
    ORDER BY l.id DESC
    LIMIT ?
  `).all(limit);
}

export const LEVEL_XP = 100;

export function computeLevel(xp) {
  return Math.floor((xp || 0) / LEVEL_XP) + 1;
}

export function applyLevelUp(userId) {
  const user = getUserById(userId);
  const newLevel = computeLevel(user.xp);
  if (newLevel <= user.level) return { leveled: false, level: user.level, reward: 0 };
  db.prepare('UPDATE users SET level = ? WHERE id = ?').run(newLevel, userId);
  return { leveled: true, level: newLevel, reward: 0 };
}

export function applyReferral(userTgId, referrerTgId) {
  const user = getUser(userTgId);
  if (!user || user.referrer_id) return null;
  if (referrerTgId === userTgId) return null;
  const referrer = getUser(referrerTgId);
  if (!referrer) return null;
  db.prepare('UPDATE users SET referrer_id = ? WHERE id = ?').run(referrer.id, user.id);
  db.prepare('UPDATE users SET coins = coins + 1000 WHERE id = ?').run(referrer.id);
  return { referrerName: referrer.first_name || referrer.username || ('#' + referrerTgId), bonus: 1000 };
}

export function userPublicInfo(userId) {
  const referrals = db.prepare('SELECT COUNT(*) as c FROM users WHERE referrer_id = ?').get(userId).c;
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(new Date().toISOString(), userId);
  return { referrals };
}

export { db };