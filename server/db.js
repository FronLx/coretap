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
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS upgrades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
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
`);

const defaultUpgrades = [
  { name: 'Energy Cap', description: 'Max energy +50', icon: '⚡', base_cost: 500, cost_multiplier: 1.3, effect_type: 'max_energy', effect_value: 50, max_level: 50 },
  { name: 'Energy Regen', description: 'Regen +1/sec', icon: '🔋', base_cost: 1000, cost_multiplier: 1.5, effect_type: 'energy_regen', effect_value: 1, max_level: 30 },
  { name: 'Tap Power', description: 'Coins per tap +1', icon: '👆', base_cost: 2000, cost_multiplier: 1.4, effect_type: 'coins_per_tap', effect_value: 1, max_level: 100 },
  { name: 'Coin Multiplier', description: 'x1.1 all coins', icon: '💎', base_cost: 20000, cost_multiplier: 2.5, effect_type: 'global_multiplier', effect_value: 10, max_level: 15 },
  { name: 'Lucky Tap', description: 'Chance for x10 tap', icon: '🍀', base_cost: 8000, cost_multiplier: 1.8, effect_type: 'lucky_chance', effect_value: 5, max_level: 20 },
];

const stmt = db.prepare(`INSERT OR IGNORE INTO upgrades (name, description, icon, base_cost, cost_multiplier, effect_type, effect_value, max_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
for (const u of defaultUpgrades) {
  stmt.run(u.name, u.description, u.icon, u.base_cost, u.cost_multiplier, u.effect_type, u.effect_value, u.max_level);
}

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
  return db.prepare('SELECT u.telegram_id, u.username, u.first_name, u.coins, u.level, u.xp FROM users u ORDER BY u.coins DESC LIMIT ?').all(limit);
}

export { db };