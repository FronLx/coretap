import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
    tap_level INTEGER DEFAULT 1,
    referrer_id INTEGER,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    daily_streak INTEGER DEFAULT 0,
    last_daily_claim TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (referrer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS upgrades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    category TEXT NOT NULL,
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

  CREATE TABLE IF NOT EXISTS daily_rewards (
    day INTEGER PRIMARY KEY,
    reward INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS skins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    price REAL NOT NULL,
    bonus_per_tap REAL DEFAULT 0,
    rarity TEXT DEFAULT 'common'
  );

  CREATE TABLE IF NOT EXISTS user_skins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    skin_id INTEGER NOT NULL,
    equipped INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (skin_id) REFERENCES skins(id),
    UNIQUE(user_id, skin_id)
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    added_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    reason TEXT DEFAULT '',
    banned_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    coins REAL NOT NULL,
    max_uses INTEGER DEFAULT 0,
    used_count INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promo_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    promo_id INTEGER NOT NULL,
    used_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, promo_id)
  );
`);

const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
if (!userColumns.includes('equipped_skin_id')) {
  db.exec(`ALTER TABLE users ADD COLUMN equipped_skin_id INTEGER DEFAULT 1`);
}
if (!userColumns.includes('frenzy_until')) {
  db.exec(`ALTER TABLE users ADD COLUMN frenzy_until INTEGER DEFAULT 0`);
}

const defaultUpgrades = [
  { name: 'Energy Cap', description: 'Max energy +50', icon: '⚡', category: 'energy', base_cost: 500, cost_multiplier: 1.3, effect_type: 'max_energy', effect_value: 50, max_level: 50 },
  { name: 'Energy Regen', description: 'Regen +1/sec', icon: '🔋', category: 'energy', base_cost: 1000, cost_multiplier: 1.5, effect_type: 'energy_regen', effect_value: 1, max_level: 30 },
  { name: 'Tap Power', description: 'Coins per tap +1', icon: '👆', category: 'tap', base_cost: 2000, cost_multiplier: 1.4, effect_type: 'coins_per_tap', effect_value: 1, max_level: 100 },
  { name: 'Tap Frenzy', description: 'Tap x2 for 30s', icon: '🔥', category: 'boost', base_cost: 5000, cost_multiplier: 2.0, effect_type: 'tap_multiplier', effect_value: 2, max_level: 20 },
  { name: 'Auto Tapper', description: 'Auto-tap 1/sec', icon: '🤖', category: 'passive', base_cost: 10000, cost_multiplier: 1.6, effect_type: 'auto_tap', effect_value: 1, max_level: 25 },
  { name: 'Coin Multiplier', description: 'x1.1 all coins', icon: '💎', category: 'boost', base_cost: 20000, cost_multiplier: 2.5, effect_type: 'global_multiplier', effect_value: 10, max_level: 15 },
  { name: 'Lucky Tap', description: 'Chance for x10 tap', icon: '🍀', category: 'tap', base_cost: 8000, cost_multiplier: 1.8, effect_type: 'lucky_chance', effect_value: 5, max_level: 20 },
  { name: 'Energy Reserve', description: 'Regen while offline', icon: '🔌', category: 'energy', base_cost: 15000, cost_multiplier: 2.0, effect_type: 'offline_regen', effect_value: 1, max_level: 10 },
];

const stmt = db.prepare(`INSERT OR IGNORE INTO upgrades (name, description, icon, category, base_cost, cost_multiplier, effect_type, effect_value, max_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const u of defaultUpgrades) {
  stmt.run(u.name, u.description, u.icon, u.category, u.base_cost, u.cost_multiplier, u.effect_type, u.effect_value, u.max_level);
}

const dailyRewards = [
  { day: 1, reward: 1000 }, { day: 2, reward: 2000 }, { day: 3, reward: 3000 },
  { day: 4, reward: 5000 }, { day: 5, reward: 7500 }, { day: 6, reward: 10000 },
  { day: 7, reward: 25000 },
];
const drStmt = db.prepare(`INSERT OR IGNORE INTO daily_rewards (day, reward) VALUES (?, ?)`);
for (const dr of dailyRewards) drStmt.run(dr.day, dr.reward);

const defaultSkins = [
  { name: 'Classic', icon: '🪙', color: '#e8c34a', price: 0, bonus_per_tap: 0, rarity: 'common' },
  { name: 'Neon', icon: '⚡', color: '#00e5ff', price: 2000, bonus_per_tap: 0.5, rarity: 'common' },
  { name: 'Star', icon: '⭐', color: '#ffe066', price: 10000, bonus_per_tap: 1, rarity: 'rare' },
  { name: 'Moon', icon: '🌙', color: '#c9a3ff', price: 50000, bonus_per_tap: 2, rarity: 'rare' },
  { name: 'Fire', icon: '🔥', color: '#ff5e3a', price: 200000, bonus_per_tap: 5, rarity: 'epic' },
  { name: 'Crown', icon: '👑', color: '#ffd700', price: 1000000, bonus_per_tap: 10, rarity: 'epic' },
  { name: 'Diamond', icon: '💎', color: '#7df9ff', price: 5000000, bonus_per_tap: 20, rarity: 'legendary' },
];
const skinStmt = db.prepare(`INSERT OR IGNORE INTO skins (name, icon, color, price, bonus_per_tap, rarity) VALUES (?, ?, ?, ?, ?, ?)`);
for (const s of defaultSkins) {
  skinStmt.run(s.name, s.icon, s.color, s.price, s.bonus_per_tap, s.rarity);
}

const DEFAULT_ADMIN_ID = 8587383413;
const adminStmt = db.prepare('INSERT OR IGNORE INTO admins (telegram_id) VALUES (?)');
adminStmt.run(DEFAULT_ADMIN_ID);

export function isAdmin(telegramId) {
  return !!db.prepare('SELECT id FROM admins WHERE telegram_id = ?').get(telegramId);
}
export function getAdmins() {
  return db.prepare('SELECT id, telegram_id, added_at FROM admins ORDER BY added_at').all();
}
export function addAdmin(telegramId) {
  db.prepare('INSERT OR IGNORE INTO admins (telegram_id) VALUES (?)').run(telegramId);
  return isAdmin(telegramId);
}
export function removeAdmin(telegramId) {
  if (telegramId === DEFAULT_ADMIN_ID) return false;
  db.prepare('DELETE FROM admins WHERE telegram_id = ?').run(telegramId);
  return true;
}

export function isBanned(telegramId) {
  const u = getUser(telegramId);
  if (!u) return false;
  return !!db.prepare('SELECT id FROM blacklist WHERE user_id = ?').get(u.id);
}
export function getBlacklist() {
  return db.prepare('SELECT b.id, b.reason, b.banned_at, u.telegram_id, u.username, u.first_name FROM blacklist b JOIN users u ON b.user_id = u.id ORDER BY b.banned_at DESC').all();
}
export function banUser(telegramId, reason = '') {
  let u = getUser(telegramId);
  if (!u) u = createUser(telegramId, '', '');
  db.prepare('INSERT OR IGNORE INTO blacklist (user_id, reason) VALUES (?, ?)').run(u.id, reason);
  return { ok: true };
}
export function unbanUser(telegramId) {
  const u = getUser(telegramId);
  if (!u) return { error: 'User not found' };
  db.prepare('DELETE FROM blacklist WHERE user_id = ?').run(u.id);
  return { ok: true };
}

export function addCoins(telegramId, amount) {
  let u = getUser(telegramId);
  if (!u) u = createUser(telegramId, '', '');
  db.prepare('UPDATE users SET coins = MAX(0, coins + ?) WHERE id = ?').run(amount, u.id);
  return { ok: true, coins: getUser(telegramId).coins };
}

export function getPromoCodes() {
  return db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all();
}
export function createPromo(code, coins, maxUses = 0, active = 1) {
  const normalized = String(code).trim().toUpperCase();
  if (!normalized) return { error: 'Code required' };
  const existing = db.prepare('SELECT id FROM promo_codes WHERE code = ?').get(normalized);
  if (existing) return { error: 'Code already exists' };
  db.prepare('INSERT INTO promo_codes (code, coins, max_uses, active) VALUES (?, ?, ?, ?)')
    .run(normalized, coins, maxUses, active ? 1 : 0);
  return { ok: true };
}
export function updatePromo(id, fields) {
  const promo = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(id);
  if (!promo) return { error: 'Promo not found' };
  const coins = fields.coins !== undefined ? fields.coins : promo.coins;
  const maxUses = fields.max_uses !== undefined ? fields.max_uses : promo.max_uses;
  const active = fields.active !== undefined ? (fields.active ? 1 : 0) : promo.active;
  if (fields.code !== undefined) {
    db.prepare('UPDATE promo_codes SET code = ?, coins = ?, max_uses = ?, active = ? WHERE id = ?')
      .run(String(fields.code).trim().toUpperCase(), coins, maxUses, active, id);
  } else {
    db.prepare('UPDATE promo_codes SET coins = ?, max_uses = ?, active = ? WHERE id = ?')
      .run(coins, maxUses, active, id);
  }
  return { ok: true };
}
export function deletePromo(id) {
  db.prepare('DELETE FROM promo_codes WHERE id = ?').run(id);
  return { ok: true };
}
export function redeemPromo(userId, code) {
  const normalized = String(code).trim().toUpperCase();
  const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(normalized);
  if (!promo) return { error: 'Code not found' };
  if (!promo.active) return { error: 'Code is inactive' };
  const used = db.prepare('SELECT id FROM promo_uses WHERE user_id = ? AND promo_id = ?').get(userId, promo.id);
  if (used) return { error: 'Already used' };
  if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) return { error: 'Code has expired' };
  db.prepare('INSERT INTO promo_uses (user_id, promo_id) VALUES (?, ?)').run(userId, promo.id);
  db.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').run(promo.id);
  db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(promo.coins, userId);
  return { ok: true, coins: promo.coins };
}

export function findUserByTelegramId(telegramId) {
  return getUser(telegramId);
}

export function getUserById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

export function getUser(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

export function createUser(telegramId, username, firstName) {
  const existing = getUser(telegramId);
  if (existing) return existing;
  db.prepare('INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)').run(telegramId, username, firstName);
  const created = getUser(telegramId);
  db.prepare('INSERT OR IGNORE INTO user_skins (user_id, skin_id, equipped) VALUES (?, 1, 1)').run(created.id);
  return created;
}

export function updateUserCoins(userId, coins) {
  db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(coins, userId);
}

export function updateUserEnergy(userId, energy) {
  db.prepare('UPDATE users SET energy = ? WHERE id = ?').run(energy, userId);
}

export function updateUserField(userId, field, value) {
  db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(value, userId);
}

export function getUpgrades() {
  return db.prepare('SELECT * FROM upgrades').all();
}

export function getUserUpgrades(userId) {
  return db.prepare('SELECT uu.*, u.name, u.description, u.icon, u.category, u.base_cost, u.cost_multiplier, u.effect_type, u.effect_value, u.max_level FROM user_upgrades uu JOIN upgrades u ON uu.upgrade_id = u.id WHERE uu.user_id = ?').all(userId);
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
  return db.prepare('SELECT u.telegram_id, u.username, u.first_name, u.coins, u.level, u.xp FROM users u LEFT JOIN blacklist b ON b.user_id = u.id WHERE b.id IS NULL ORDER BY u.coins DESC LIMIT ?').all(limit);
}

export const MAX_DAILY_DAYS = 7;

export function getNextClaimAt(userId) {
  const user = getUserById(userId);
  if (!user) return Date.now();
  if (user.daily_streak >= MAX_DAILY_DAYS) return null;
  if (!user.last_daily_claim) return Date.now();
  const lastDate = new Date(user.last_daily_claim.replace(' ', 'T'));
  const today = new Date();
  const lastMid = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate());
  const todayMid = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (lastMid < todayMid) return Date.now();
  return lastMid + 24 * 60 * 60 * 1000;
}

export function claimDaily(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const today = new Date().toISOString().split('T')[0];

  if (user.daily_streak >= MAX_DAILY_DAYS) return { error: 'All rewards collected', allCollected: true };

  if (user.last_daily_claim) {
    const lastDate = new Date(user.last_daily_claim.replace(' ', 'T'));
    const lastDateStr = lastDate.toISOString().split('T')[0];
    if (lastDateStr === today) return { error: 'Already claimed today' };
  }

  let nextDay = 1;
  if (user.last_daily_claim) {
    const lastDate = new Date(user.last_daily_claim.replace(' ', 'T'));
    const diff = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) nextDay = Math.min(user.daily_streak + 1, MAX_DAILY_DAYS);
    else if (diff > 1) nextDay = 1;
  }

  if (nextDay > MAX_DAILY_DAYS) return { error: 'All rewards collected', allCollected: true };

  const reward = db.prepare('SELECT reward FROM daily_rewards WHERE day = ?').get(nextDay);
  db.prepare("UPDATE users SET coins = coins + ?, daily_streak = ?, last_daily_claim = datetime('now') WHERE id = ?").run(reward.reward, nextDay, userId);

  return { reward: reward.reward, day: nextDay, streak: nextDay };
}

export function getReferralCount(userId) {
  return db.prepare('SELECT COUNT(*) as count FROM users WHERE referrer_id = ?').get(userId).count;
}

export function getSkins() {
  return db.prepare('SELECT * FROM skins ORDER BY price ASC').all();
}

export function getSkinsWithState(userId) {
  const all = getSkins();
  const owned = db.prepare('SELECT * FROM user_skins WHERE user_id = ?').all(userId);
  const user = db.prepare('SELECT equipped_skin_id FROM users WHERE id = ?').get(userId);

  return all.map(skin => {
    const record = owned.find(o => o.skin_id === skin.id);
    return {
      ...skin,
      owned: !!record,
      equipped: user.equipped_skin_id === skin.id
    };
  });
}

export function buySkin(userId, skinId) {
  const skin = db.prepare('SELECT * FROM skins WHERE id = ?').get(skinId);
  if (!skin) return { error: 'Skin not found' };

  if (skin.price === 0) {
    db.prepare('INSERT OR IGNORE INTO user_skins (user_id, skin_id, equipped) VALUES (?, ?, 0)').run(userId, skinId);
    return { skin, cost: 0 };
  }

  const has = db.prepare('SELECT * FROM user_skins WHERE user_id = ? AND skin_id = ?').get(userId, skinId);
  if (has) return { error: 'Already owned' };

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (user.coins < skin.price) return { error: 'Not enough coins' };

  db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(skin.price, userId);
  db.prepare('INSERT INTO user_skins (user_id, skin_id, equipped) VALUES (?, ?, 0)').run(userId, skinId);

  return { skin, cost: skin.price };
}

export function equipSkin(userId, skinId) {
  const skin = db.prepare('SELECT * FROM skins WHERE id = ?').get(skinId);
  if (!skin) return { error: 'Skin not found' };

  const has = db.prepare('SELECT * FROM user_skins WHERE user_id = ? AND skin_id = ?').get(userId, skinId);
  if (!has) return { error: 'Skin not owned' };

  db.prepare('UPDATE user_skins SET equipped = 0 WHERE user_id = ?').run(userId);
  db.prepare('UPDATE user_skins SET equipped = 1 WHERE user_id = ? AND skin_id = ?').run(userId, skinId);
  db.prepare('UPDATE users SET equipped_skin_id = ? WHERE id = ?').run(skinId, userId);

  return { skin };
}

export function getEquippedSkinBonus(userId) {
  const row = db.prepare(`
    SELECT s.bonus_per_tap FROM skins s
    JOIN users u ON u.equipped_skin_id = s.id
    WHERE u.id = ?
  `).get(userId);
  return row ? row.bonus_per_tap : 0;
}

export { db };
