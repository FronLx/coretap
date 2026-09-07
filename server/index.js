import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUser, createUser, getUpgrades, getUserUpgrades, purchaseUpgrade, getLeaderboard, db } from './db.js';

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

const app = express();
const PORT = process.env.PORT || 3001;
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

const staticDir = path.join(__dirname, '../client2/dist');
if (fs.existsSync(staticDir)) {
  app.use('/coretap', express.static(staticDir));
  app.get('/coretap*', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

function auth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) return res.status(401).json({ error: 'No init data' });
  try {
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    if (!userStr) return res.status(401).json({ error: 'No user data' });
    const data = JSON.parse(userStr);
    if (!data || !data.id) return res.status(401).json({ error: 'Invalid init data' });
    req.telegramUser = data;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid init data' });
  }
}

function stats(user, userUpgrades) {
  let coinsPerTap = user.coins_per_tap;
  let maxEnergy = user.max_energy;
  let energyRegen = 0;
  let luckyChance = 0;
  let globalMultiplier = 1;

  for (const up of userUpgrades) {
    const val = up.effect_value * up.level;
    switch (up.effect_type) {
      case 'coins_per_tap': coinsPerTap += val; break;
      case 'max_energy': maxEnergy += val; break;
      case 'energy_regen': energyRegen += val; break;
      case 'lucky_chance': luckyChance += val; break;
      case 'global_multiplier': globalMultiplier += val / 100; break;
    }
  }

  return { coinsPerTap, maxEnergy, energyRegen, luckyChance, globalMultiplier };
}

export function calculateStats(user, userUpgrades) {
  return stats(user, userUpgrades);
}

function upgradesResponse(userId) {
  const userUpgrades = getUserUpgrades(userId);
  return getUpgrades()
    .filter(u => u.effect_type !== 'auto_tap')
    .map(u => {
      const row = userUpgrades.find(uu => uu.upgrade_id === u.id);
      const level = row ? row.level : 0;
      const cost = Math.floor(u.base_cost * Math.pow(u.cost_multiplier, level));
      return { ...u, currentLevel: level, cost, owned: !!row };
    });
}

app.post('/api/auth', (req, res) => {
  try {
    const initData = req.body?.initData || '';
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    if (!userStr) return res.status(401).json({ error: 'No user data' });
    const data = JSON.parse(userStr);
    if (!data || !data.id) return res.status(401).json({ error: 'Invalid init data' });

    const user = createUser(data.id, data.username || '', data.first_name || '');
    const userUpgrades = getUserUpgrades(user.id);

    res.json({
      user: { id: user.id, telegram_id: user.telegram_id, username: user.username, first_name: user.first_name, coins: user.coins, energy: user.energy, xp: user.xp, level: user.level, ...stats(user, userUpgrades) },
      upgrades: upgradesResponse(user.id),
      userUpgrades
    });
  } catch (e) {
    console.log(`${new Date().toISOString()} AUTH ERR: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tap', auth, (req, res) => {
  const user = getUser(req.telegramUser.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const userUpgrades = getUserUpgrades(user.id);
  const s = stats(user, userUpgrades);

  const totalTaps = Math.min(parseInt(req.body?.taps) || 1, user.energy);

  let coinsEarned = 0;
  const tapsArray = Array.from({ length: totalTaps }, () => {
    const lucky = s.luckyChance > 0 && Math.random() * 100 < s.luckyChance;
    return s.coinsPerTap * s.globalMultiplier * (lucky ? 10 : 1);
  });
  coinsEarned = tapsArray.reduce((a, b) => a + b, 0);

  const newEnergy = Math.max(0, user.energy - totalTaps);
  const xp = totalTaps;

  db.prepare('UPDATE users SET coins = coins + ?, energy = ?, xp = xp + ? WHERE id = ?')
    .run(coinsEarned, newEnergy, xp, user.id);

  const updated = getUser(req.telegramUser.id);
  res.json({
    coinsEarned: Math.floor(coinsEarned),
    energy: newEnergy,
    totalCoins: updated.coins,
    stats: s
  });
});

app.post('/api/regen', auth, (req, res) => {
  const user = getUser(req.telegramUser.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const userUpgrades = getUserUpgrades(user.id);
  const s = stats(user, userUpgrades);

  const regenAmount = s.energyRegen || 1;
  const newEnergy = Math.min(user.energy + regenAmount, s.maxEnergy);

  db.prepare('UPDATE users SET energy = ? WHERE id = ?').run(newEnergy, user.id);

  res.json({ energy: newEnergy, maxEnergy: s.maxEnergy });
});

app.post('/api/upgrade/:id', auth, (req, res) => {
  const user = getUser(req.telegramUser.id);
  const result = purchaseUpgrade(user.id, parseInt(req.params.id));
  if (result.error) return res.status(400).json(result);

  const updatedUser = getUser(req.telegramUser.id);
  const userUpgrades = getUserUpgrades(user.id);

  res.json({ ...result, coins: updatedUser.coins, stats: stats(updatedUser, userUpgrades) });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ leaderboard: getLeaderboard() });
});

app.listen(PORT, () => {
  console.log(`CoreTap server running on port ${PORT}`);
});

import { startBot } from './bot.js';
startBot();