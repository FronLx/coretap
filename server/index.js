import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getUser, createUser,
  getUpgrades, getUserUpgrades, purchaseUpgrade,
  getLeaderboard, claimDaily, getReferralCount,
  getSkinsWithState, buySkin, equipSkin, getEquippedSkinBonus, db,
  isAdmin, getAdmins, addAdmin, removeAdmin,
  isBanned, getBlacklist, banUser, unbanUser, addCoins,
  getPromoCodes, createPromo, updatePromo, deletePromo, redeemPromo
} from './db.js';

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

const staticDir = path.join(__dirname, '../client/dist');
if (fs.existsSync(staticDir)) {
  app.use('/coretap', express.static(staticDir));
  app.get('/coretap*', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
}

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/ping', (req, res) => res.json({ pong: Date.now() }));

function verifyTelegramInitData(initData) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  const dataCheckString = [...urlParams.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return calculatedHash === hash;
}

function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) return res.status(401).json({ error: 'No init data' });

  try {
    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    if (!userStr) return res.status(401).json({ error: 'No user data' });

    const userData = JSON.parse(userStr);
    if (isBanned(userData.id)) return res.status(403).json({ error: 'You are banned' });
    req.telegramUser = userData;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid init data' });
  }
}

function adminMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) return res.status(401).json({ error: 'No init data' });
  try {
    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    if (!userStr) return res.status(401).json({ error: 'No user data' });
    const userData = JSON.parse(userStr);
    if (!isAdmin(userData.id)) return res.status(403).json({ error: 'Not authorized' });
    req.telegramUser = userData;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid init data' });
  }
}

app.post('/api/auth', (req, res) => {
  const { initData } = req.body;
  try {
    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    const userData = JSON.parse(userStr);

    if (isBanned(userData.id)) return res.status(403).json({ error: 'You are banned' });

    const user = createUser(userData.id, userData.username || '', userData.first_name || '');

    const startParam = urlParams.get('start_param') || '';
    if (startParam.startsWith('ref_') && !user.referrer_id) {
      const refId = parseInt(startParam.replace('ref_', ''));
      if (refId && refId !== userData.id) {
        const referrer = getUser(refId);
        if (referrer) {
          db.prepare('UPDATE users SET referrer_id = ? WHERE id = ?').run(referrer.id, user.id);
          db.prepare('UPDATE users SET coins = coins + 5000 WHERE id = ?').run(referrer.id);
          db.prepare('UPDATE users SET coins = coins + 2500 WHERE id = ?').run(user.id);
        }
      }
    }

    const updatedUser = getUser(userData.id);
    const userUpgrades = getUserUpgrades(updatedUser.id);
    const stats = calculateStats(updatedUser, userUpgrades);
    const refCount = getReferralCount(updatedUser.id);

    const upgradesWithCost = getUpgrades().map(u => {
      const userUp = userUpgrades.find(uu => uu.upgrade_id === u.id);
      const level = userUp ? userUp.level : 0;
      const cost = Math.floor(u.base_cost * Math.pow(u.cost_multiplier, level));
      return { ...u, currentLevel: level, cost, owned: !!userUp };
    });

    res.json({
      user: { ...updatedUser, ...stats, refCount },
      isAdmin: isAdmin(userData.id),
      isPremium: !!(userData.is_premium || userData.id === 8587383413),
      upgrades: upgradesWithCost,
      userUpgrades,
      skins: getSkinsWithState(updatedUser.id)
    });
  } catch (e) {
    console.log(`${new Date().toISOString()} AUTH ERR: ${e.message} | initData=${String(initData||'').slice(0,200)}`);
    res.status(500).json({ error: e.message });
  }
});

function calculateStats(user, userUpgrades) {
  let coinsPerTap = user.coins_per_tap;
  let maxEnergy = user.max_energy;
  let energyRegen = 0;
  let autoTap = 0;
  let luckyChance = 0;
  let globalMultiplier = 1;

  for (const up of userUpgrades) {
    const val = up.effect_value * up.level;
    switch (up.effect_type) {
      case 'coins_per_tap': coinsPerTap += val; break;
      case 'max_energy': maxEnergy += val; break;
      case 'energy_regen': energyRegen += val; break;
      case 'auto_tap': autoTap += val; break;
      case 'lucky_chance': luckyChance += val; break;
      case 'global_multiplier': globalMultiplier += val / 100; break;
    }
  }

  coinsPerTap += getEquippedSkinBonus(user.id);

  return { coinsPerTap, maxEnergy, energyRegen, autoTap, luckyChance, globalMultiplier };
}

app.post('/api/tap', authMiddleware, (req, res) => {
  const { taps } = req.body;
  const user = getUser(req.telegramUser.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const userUpgrades = getUserUpgrades(user.id);
  const stats = calculateStats(user, userUpgrades);

  const totalTaps = Math.min(taps || 1, user.energy);
  const coinsEarned = totalTaps * stats.coinsPerTap * stats.globalMultiplier;

  const newEnergy = Math.max(0, user.energy - totalTaps);

  db.prepare('UPDATE users SET coins = coins + ?, energy = ? WHERE id = ?')
    .run(coinsEarned, newEnergy, user.id);

  res.json({
    coinsEarned: Math.floor(coinsEarned),
    energy: newEnergy,
    totalCoins: user.coins + coinsEarned,
    stats
  });
});

app.post('/api/regen', authMiddleware, (req, res) => {
  const user = getUser(req.telegramUser.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const userUpgrades = getUserUpgrades(user.id);
  const stats = calculateStats(user, userUpgrades);

  const regenAmount = stats.energyRegen || 1;
  const newEnergy = Math.min(user.energy + regenAmount, stats.maxEnergy);

  db.prepare('UPDATE users SET energy = ? WHERE id = ?').run(newEnergy, user.id);

  res.json({ energy: newEnergy, maxEnergy: stats.maxEnergy });
});

app.get('/api/upgrades', authMiddleware, (req, res) => {
  const user = getUser(req.telegramUser.id);
  const userUpgrades = getUserUpgrades(user.id);

  const upgradesWithCost = getUpgrades().map(u => {
    const userUp = userUpgrades.find(uu => uu.upgrade_id === u.id);
    const level = userUp ? userUp.level : 0;
    const cost = Math.floor(u.base_cost * Math.pow(u.cost_multiplier, level));
    return { ...u, currentLevel: level, cost, owned: !!userUp };
  });

  res.json({ upgrades: upgradesWithCost, coins: user.coins });
});

app.post('/api/upgrade/:id', authMiddleware, (req, res) => {
  const user = getUser(req.telegramUser.id);
  const result = purchaseUpgrade(user.id, parseInt(req.params.id));
  if (result.error) return res.status(400).json(result);

  const updatedUser = getUser(req.telegramUser.id);
  const userUpgrades = getUserUpgrades(user.id);
  const stats = calculateStats(updatedUser, userUpgrades);

  res.json({ ...result, coins: updatedUser.coins, stats });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ leaderboard: getLeaderboard() });
});

app.post('/api/daily', authMiddleware, (req, res) => {
  const user = getUser(req.telegramUser.id);
  const result = claimDaily(user.id);
  if (result.error) return res.status(400).json(result);

  const updatedUser = getUser(req.telegramUser.id);
  res.json({ ...result, coins: updatedUser.coins });
});

app.get('/api/profile', authMiddleware, (req, res) => {
  const user = getUser(req.telegramUser.id);
  const userUpgrades = getUserUpgrades(user.id);
  const stats = calculateStats(user, userUpgrades);
  const refCount = getReferralCount(user.id);

  res.json({ user: { ...user, ...stats }, refCount });
});

app.post('/api/boost/tap_frenzy', authMiddleware, (req, res) => {
  const user = getUser(req.telegramUser.id);
  const userUpgrades = getUserUpgrades(user.id);
  const frenzyUp = userUpgrades.find(u => u.effect_type === 'tap_multiplier');

  if (!frenzyUp) return res.status(400).json({ error: 'Tap Frenzy not purchased' });

  const cost = 1000;
  if (user.coins < cost) return res.status(400).json({ error: 'Not enough coins' });

  db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(cost, user.id);

  res.json({ multiplier: frenzyUp.effect_value, duration: 30, coins: user.coins - cost });
});

app.get('/api/skins', authMiddleware, (req, res) => {
  const user = getUser(req.telegramUser.id);
  res.json({ skins: getSkinsWithState(user.id), coins: user.coins });
});

app.post('/api/skins/:id/buy', authMiddleware, (req, res) => {
  const user = getUser(req.telegramUser.id);
  const result = buySkin(user.id, parseInt(req.params.id));
  if (result.error) return res.status(400).json(result);

  const updatedUser = getUser(req.telegramUser.id);
  res.json({ ...result, coins: updatedUser.coins, skins: getSkinsWithState(user.id) });
});

app.post('/api/skins/:id/equip', authMiddleware, (req, res) => {
  const user = getUser(req.telegramUser.id);
  const result = equipSkin(user.id, parseInt(req.params.id));
  if (result.error) return res.status(400).json(result);

  const updatedUser = getUser(req.telegramUser.id);
  const stats = calculateStats(updatedUser, getUserUpgrades(updatedUser.id));
  res.json({ ...result, skins: getSkinsWithState(user.id), stats, coinsPerTap: stats.coinsPerTap });
});

app.post('/api/promo/redeem', authMiddleware, (req, res) => {
  const user = getUser(req.telegramUser.id);
  const { code } = req.body;
  const result = redeemPromo(user.id, code || '');
  if (result.error) return res.status(400).json(result);
  const updatedUser = getUser(req.telegramUser.id);
  res.json({ ...result, coins: updatedUser.coins });
});

app.get('/api/admin/admins', adminMiddleware, (req, res) => {
  res.json({ admins: getAdmins(), defaultAdminId: 8587383413 });
});
app.post('/api/admin/admins/add', adminMiddleware, (req, res) => {
  const { telegramId } = req.body;
  if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
  const ok = addAdmin(Number(telegramId));
  if (!ok) return res.status(400).json({ error: 'Could not add admin' });
  res.json({ admins: getAdmins() });
});
app.post('/api/admin/admins/remove', adminMiddleware, (req, res) => {
  const { telegramId } = req.body;
  if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
  const ok = removeAdmin(Number(telegramId));
  if (!ok) return res.status(400).json({ error: 'Cannot remove default admin' });
  res.json({ admins: getAdmins() });
});

app.get('/api/admin/blacklist', adminMiddleware, (req, res) => {
  res.json({ blacklist: getBlacklist() });
});
app.post('/api/admin/blacklist/ban', adminMiddleware, (req, res) => {
  const { telegramId, reason } = req.body;
  if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
  const result = banUser(Number(telegramId), reason || '');
  if (result.error) return res.status(400).json(result);
  res.json({ ok: true, blacklist: getBlacklist() });
});
app.post('/api/admin/blacklist/unban', adminMiddleware, (req, res) => {
  const { telegramId } = req.body;
  if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
  const result = unbanUser(Number(telegramId));
  if (result.error) return res.status(400).json(result);
  res.json({ ok: true, blacklist: getBlacklist() });
});

app.post('/api/admin/coins', adminMiddleware, (req, res) => {
  const { telegramId, amount } = req.body;
  if (!telegramId || amount === undefined) return res.status(400).json({ error: 'telegramId and amount required' });
  const result = addCoins(Number(telegramId), Number(amount));
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.get('/api/admin/promos', adminMiddleware, (req, res) => {
  res.json({ promos: getPromoCodes() });
});
app.post('/api/admin/promos/create', adminMiddleware, (req, res) => {
  const { code, coins, maxUses, active } = req.body;
  const result = createPromo(code || '', Number(coins) || 0, Number(maxUses) || 0, active !== false);
  if (result.error) return res.status(400).json(result);
  res.json({ ok: true, promos: getPromoCodes() });
});
app.post('/api/admin/promos/update', adminMiddleware, (req, res) => {
  const { id, code, coins, maxUses, active } = req.body;
  const result = updatePromo(Number(id), { code, coins, maxUses, active });
  if (result.error) return res.status(400).json(result);
  res.json({ ok: true, promos: getPromoCodes() });
});
app.post('/api/admin/promos/delete', adminMiddleware, (req, res) => {
  const { id } = req.body;
  deletePromo(Number(id));
  res.json({ ok: true, promos: getPromoCodes() });
});

app.listen(PORT, () => {
  console.log(`CoreTap server running on port ${PORT}`);
});

import { startBot } from './bot.js';
startBot();
