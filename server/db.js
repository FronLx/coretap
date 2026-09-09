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

  CREATE TABLE IF NOT EXISTS boss_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_hp INTEGER DEFAULT 2500,
    current_hp INTEGER DEFAULT 2500,
    phase TEXT DEFAULT 'active',
    started_at TEXT DEFAULT '',
    ended_at TEXT DEFAULT '',
    pool INTEGER DEFAULT 0,
    total_damage INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS boss_contrib (
    user_id INTEGER PRIMARY KEY,
    damage INTEGER DEFAULT 0
  );
  `);

const USER_COLUMNS = {
  blocked: "ALTER TABLE users ADD COLUMN blocked INTEGER DEFAULT 0",
  referrer_id: "ALTER TABLE users ADD COLUMN referrer_id INTEGER DEFAULT 0",
  total_taps: "ALTER TABLE users ADD COLUMN total_taps INTEGER DEFAULT 0",
  last_seen: "ALTER TABLE users ADD COLUMN last_seen TEXT DEFAULT ''",
  frenzy_until: "ALTER TABLE users ADD COLUMN frenzy_until TEXT DEFAULT ''",
  vanished: "ALTER TABLE users ADD COLUMN vanished INTEGER DEFAULT 0",
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

const DISABLED_EFFECT_TYPES = ['tap_multiplier', 'offline_regen'];

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
  const placeholders = DISABLED_EFFECT_TYPES.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM upgrades WHERE effect_type NOT IN (${placeholders})`).all(...DISABLED_EFFECT_TYPES);
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
  return db.prepare('SELECT u.telegram_id, u.username, u.first_name, u.coins, u.level, u.xp FROM users u WHERE u.blocked = 0 AND u.vanished = 0 ORDER BY u.coins DESC LIMIT ?').all(limit);
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

export function getAllActiveUserIds() {
  return db.prepare('SELECT telegram_id FROM users WHERE blocked = 0').all().map(r => r.telegram_id);
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
  db.prepare('UPDATE users SET coins = 0, xp = 0, level = 1, total_taps = 0, energy = max_energy, frenzy_until = \'\' WHERE id = ?').run(user.id);
  db.prepare('DELETE FROM user_upgrades WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM boss_contrib WHERE user_id = ?').run(user.id);
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
    SELECT id, telegram_id, username, first_name, coins, xp, level, blocked, total_taps, vanished, created_at,
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

export const BOSS_COOLDOWN_S = 120;
const BOSS_HP_BASE = 2500;
const BOSS_HP_PER_PLAYER = 300;
const BOSS_HP_CAP = 60000;

function playersToday() {
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare(`SELECT COUNT(*) as c FROM users WHERE blocked = 0 AND last_seen LIKE ?`)
    .get(today + '%').c || 1;
}

export function initialBossHp() {
  return Math.min(BOSS_HP_CAP, Math.max(BOSS_HP_BASE, BOSS_HP_BASE + (playersToday() - 1) * BOSS_HP_PER_PLAYER));
}

export function initialBossPool(hp) {
  hp = hp || initialBossHp();
  return Math.floor(hp * 0.35) + 1500;
}

function ensureBossRow() {
  let row = db.prepare('SELECT * FROM boss_state WHERE id = 1').get();
  if (!row) {
    const hp = initialBossHp();
    db.prepare(`INSERT INTO boss_state (id, total_hp, current_hp, phase, started_at, pool, total_damage)
      VALUES (1, ?, ?, 'active', ?, ?, 0)`)
      .run(hp, hp, new Date().toISOString(), initialBossPool(hp));
    row = db.prepare('SELECT * FROM boss_state WHERE id = 1').get();
  }
  return row;
}

function advanceBossCycle() {
  const row = ensureBossRow();
  if (row.phase === 'dead' && row.ended_at) {
    const elapsed = Date.now() - new Date(row.ended_at).getTime();
    if (elapsed >= BOSS_COOLDOWN_S * 1000) {
      const hp = initialBossHp();
      db.prepare(`UPDATE boss_state SET total_hp = ?, current_hp = ?, phase = 'active', started_at = ?, ended_at = '', pool = ?, total_damage = 0 WHERE id = 1`)
        .run(hp, hp, new Date().toISOString(), initialBossPool(hp));
      db.prepare('DELETE FROM boss_contrib').run();
      return true;
    }
  }
  return false;
}

export function getBossPublic() {
  advanceBossCycle();
  const row = ensureBossRow();
  const pct = row.phase === 'active'
    ? Math.max(0, Math.min(100, Math.floor((1 - row.current_hp / row.total_hp) * 100)))
    : 100;
  return {
    total_hp: row.total_hp,
    current_hp: row.current_hp,
    phase: row.phase,
    pool: row.pool,
    pct,
    started_at: row.started_at,
    ended_at: row.ended_at,
    cooldown_s: BOSS_COOLDOWN_S,
    total_damage: row.total_damage
  };
}

export function getUserBossContribution(userId) {
  const row = db.prepare('SELECT damage FROM boss_contrib WHERE user_id = ?').get(userId);
  return row ? row.damage : 0;
}

export function getBossTop(limit = 10) {
  return db.prepare(`
    SELECT bc.user_id, bc.damage
    FROM boss_contrib bc
    JOIN users u ON u.id = bc.user_id
    WHERE u.blocked = 0 AND u.vanished = 0
    ORDER BY bc.damage DESC LIMIT ?
  `).all(limit);
}

export function finishBoss() {
  const row = ensureBossRow();
  const pool = row.pool || 0;
  const rows = db.prepare('SELECT user_id, damage FROM boss_contrib ORDER BY damage DESC').all();
  const totalDamage = rows.reduce((a, b) => a + b.damage, 0) || 1;
  const distributes = [];
  for (const r of rows) {
    const reward = Math.floor(pool * r.damage / totalDamage);
    if (reward > 0) {
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(reward, r.user_id);
      distributes.push({ user_id: r.user_id, damage: r.damage, reward });
    }
  }
  db.prepare(`UPDATE boss_state SET phase = 'dead', ended_at = ?, total_damage = ? WHERE id = 1`)
    .run(new Date().toISOString(), totalDamage);
  return { pool, totalDamage, distributes };
}

export function addBossDamage(userId, damage) {
  if (!(damage > 0)) return { boss: getBossPublic() };
  advanceBossCycle();
  const row = ensureBossRow();
  if (row.phase !== 'active') return { boss: getBossPublic() };

  db.prepare(`INSERT INTO boss_contrib (user_id, damage) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET damage = damage + excluded.damage`).run(userId, damage);

  const newHp = Math.max(0, row.current_hp - damage);
  const totalDamage = row.total_damage + damage;
  db.prepare('UPDATE boss_state SET current_hp = ?, total_damage = ? WHERE id = 1').run(newHp, totalDamage);

  let defeated = false;
  let reward = 0;
  if (newHp <= 0) {
    defeated = true;
    reward = finishBoss();
  }
  return { boss: getBossPublic(), defeated, reward };
}

export function getUserLeaderboardRank(userId) {
  const user = getUserById(userId);
  if (!user) return { rank: 0, total: 0 };
  const rank = db.prepare(`SELECT COUNT(*) as c FROM users WHERE blocked = 0 AND vanished = 0 AND coins > ?`).get(user.coins).c + 1;
  const total = db.prepare(`SELECT COUNT(*) as c FROM users WHERE blocked = 0 AND vanished = 0`).get().c;
  return { rank, total };
}

export function setVanished(telegramId, vanished) {
  const user = getUser(telegramId);
  if (!user) return { error: 'User not found' };
  if (vanished && !isAdmin(telegramId)) return { error: 'Только администратор может скрыться' };
  db.prepare('UPDATE users SET vanished = ? WHERE id = ?').run(vanished ? 1 : 0, user.id);
  return getUser(telegramId);
}

export function adminSetVanished(telegramId, vanished) {
  const user = getUser(telegramId);
  if (!user) return { error: 'User not found' };
  db.prepare('UPDATE users SET vanished = ? WHERE id = ?').run(vanished ? 1 : 0, user.id);
  return getUser(telegramId);
}

const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
const BACKUP_KEEP = 12;
let backupLock = false;

export function backupDatabase() {
  if (backupLock) return { error: 'Backup already running' };
  backupLock = true;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const file = path.join(BACKUP_DIR, `coretap_${ts}.db`);
    const safe = file.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${safe}'`);
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
    while (files.length > BACKUP_KEEP) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
    return { file, count: Math.min(files.length, BACKUP_KEEP) };
  } catch (e) {
    return { error: e.message };
  } finally {
    backupLock = false;
  }
}

export function autoBackup() {
  const res = backupDatabase();
  if (res.error) console.error('[db] backup failed:', res.error);
  else console.log('[db] backup ok:', res.file);
}

export { db };