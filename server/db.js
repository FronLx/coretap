import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, 'coretap.db'));

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
`);

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

export function getUser(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

export function createUser(telegramId, username, firstName) {
  const existing = getUser(telegramId);
  if (existing) return existing;
  db.prepare('INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)').run(telegramId, username, firstName);
  return getUser(telegramId);
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
  return db.prepare('SELECT telegram_id, username, first_name, coins, level, xp FROM users ORDER BY coins DESC LIMIT ?').all(limit);
}

export function claimDaily(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const today = new Date().toISOString().split('T')[0];

  if (user.last_daily_claim) {
    const lastDate = new Date(user.last_daily_claim.replace(' ', 'T'));
    const lastDateStr = lastDate.toISOString().split('T')[0];
    if (lastDateStr === today) return { error: 'Already claimed today' };
  }

  let nextDay = 1;
  if (user.last_daily_claim) {
    const lastDate = new Date(user.last_daily_claim.replace(' ', 'T'));
    const diff = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) nextDay = (user.daily_streak % 7) + 1;
    else if (diff > 1) nextDay = 1;
  }

  const reward = db.prepare('SELECT reward FROM daily_rewards WHERE day = ?').get(nextDay);
  db.prepare("UPDATE users SET coins = coins + ?, daily_streak = ?, last_daily_claim = datetime('now') WHERE id = ?").run(reward.reward, nextDay, userId);

  return { reward: reward.reward, day: nextDay, streak: nextDay };
}

export function getReferralCount(userId) {
  return db.prepare('SELECT COUNT(*) as count FROM users WHERE referrer_id = ?').get(userId).count;
}

export { db };
