import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getUser, getUserById, createUser, getUpgrades, getUserUpgrades, purchaseUpgrade, getLeaderboard,
  isAdmin, grantAdmin, revokeAdmin, getAdmins, setBlocked, giveCoins, setUserXp, resetUser,
  adminStats, searchUsers, logAdmin, getAdminLogs, applyLevelUp, applyReferral, userPublicInfo, computeLevel,
  LEVEL_XP, OWNER_ID, db,
  getBossPublic, addBossDamage, getUserBossContribution, getBossTop, getUserLeaderboardRank,
  setVanished, adminSetVanished, autoBackup,
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
  app.use('/coretap', express.static(staticDir, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  app.get('/coretap*', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const userStr = params.get('user');
  if (!userStr) return { error: 'No user data' };
  let data;
  try {
    data = JSON.parse(userStr);
  } catch (e) {
    return { error: 'Invalid init data' };
  }
  if (!data || !data.id) return { error: 'Invalid init data' };
  return { params, user: data };
}

function auth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) return res.status(401).json({ error: 'No init data' });
  const parsed = parseInitData(initData);
  if (parsed.error) return res.status(401).json({ error: parsed.error });

  const dbUser = getUser(parsed.user.id);
  if (dbUser && dbUser.blocked) {
    return res.status(403).json({ error: 'Вы в черном списке', blocked: true });
  }
  req.telegramUser = parsed.user;
  req.dbUser = dbUser;
  req.initData = initData;
  next();
}

function requireAdmin(req, res, next) {
  const admin = isAdmin(req.telegramUser.id);
  if (!admin) return res.status(403).json({ error: 'Нет доступа' });
  if (req.dbUser && req.dbUser.blocked) return res.status(403).json({ error: 'Вы в черном списке', blocked: true });
  req.admin = admin;
  next();
}

function stats(user, userUpgrades) {
  let coinsPerTap = user.coins_per_tap;
  let maxEnergy = user.max_energy;
  let energyRegen = 0;
  let luckyChance = 0;
  let globalMultiplier = 1;
  let tapMultiplier = 1;
  let autoTap = 0;
  let frenzyLevels = 0;

  for (const up of userUpgrades) {
    const val = up.effect_value * up.level;
    switch (up.effect_type) {
      case 'coins_per_tap': coinsPerTap += val; break;
      case 'max_energy': maxEnergy += val; break;
      case 'energy_regen': energyRegen += val; break;
      case 'offline_regen': energyRegen += val; break;
      case 'lucky_chance': luckyChance += val; break;
      case 'global_multiplier': globalMultiplier += val / 100; break;
      case 'tap_multiplier': frenzyLevels += up.level; break;
      case 'auto_tap': autoTap += up.level; break;
    }
  }

  const frenzyActive = !!user.frenzy_until && new Date(user.frenzy_until).getTime() > Date.now();
  if (frenzyActive && frenzyLevels > 0) tapMultiplier = 1 + frenzyLevels;

  return { coinsPerTap, maxEnergy, energyRegen, luckyChance, globalMultiplier, tapMultiplier, autoTap, frenzyActive };
}

export function calculateStats(user, userUpgrades) {
  return stats(user, userUpgrades);
}

function upgradesResponse(userId) {
  const userUpgrades = getUserUpgrades(userId);
  return getUpgrades()
    .map(u => {
      const row = userUpgrades.find(uu => uu.upgrade_id === u.id);
      const level = row ? row.level : 0;
      const cost = Math.floor(u.base_cost * Math.pow(u.cost_multiplier, level));
      return { ...u, currentLevel: level, cost, owned: !!row };
    });
}

function applyOfflineAutoTap(user) {
  if (!user.last_seen) return 0;
  const s = stats(user, getUserUpgrades(user.id));
  if (!(s.autoTap > 0)) return 0;
  const now = Date.now();
  const lastTs = new Date(user.last_seen).getTime();
  if (!lastTs) return 0;
  const capped = Math.min(Math.floor((now - lastTs) / 1000), 8 * 3600);
  if (capped < 1) return 0;
  const earned = Math.max(1, Math.floor(capped * s.autoTap * s.coinsPerTap * s.globalMultiplier));
  db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(earned, user.id);
  return earned;
}

function applyOfflineEnergy(user) {
  const lastSeen = user.last_seen;
  const now = Date.now();
  if (!lastSeen) return user.energy;
  const lastTs = new Date(lastSeen).getTime();
  if (!lastTs) return user.energy;
  const s = stats(user, getUserUpgrades(user.id));
  const regen = s.energyRegen || 1;
  const capped = Math.min(Math.floor((now - lastTs) / 1000), 3 * 3600);
  const newEnergy = Math.min(user.energy + Math.floor(capped * regen), s.maxEnergy);
  db.prepare('UPDATE users SET energy = ? WHERE id = ?').run(newEnergy, user.id);
  return newEnergy;
}

function userPayload(user) {
  const userUpgrades = getUserUpgrades(user.id);
  const info = userPublicInfo(user.id);
  const s = stats(user, userUpgrades);
  return {
    id: user.id,
    telegram_id: user.telegram_id,
    username: user.username,
    first_name: user.first_name,
    coins: user.coins,
    energy: user.energy,
    xp: user.xp,
    level: user.level,
    total_taps: user.total_taps,
    referrals: info.referrals,
    isAdmin: !!isAdmin(user.telegram_id),
    vanished: !!user.vanished,
    frenzyActive: !!s.frenzyActive,
    frenzyUntil: user.frenzy_until || null,
    ...s
  };
}

app.post('/api/auth', (req, res) => {
  try {
    const initData = req.body?.initData || '';
    const parsed = parseInitData(initData);
    if (parsed.error) return res.status(401).json({ error: parsed.error });
    const data = parsed.user;

    console.log(`AUTH tgid=${data.id} first_name=${data.first_name || ''} isAdmin=${!!isAdmin(data.id)}`);

    let user = getUser(data.id);
    const isNew = !user;
    if (!user) user = createUser(data.id, data.username || '', data.first_name || '');

    if (user.blocked) {
      return res.status(403).json({ error: 'Вы в черном списке', blocked: true });
    }

    if (isNew) {
      const startParam = parsed.params.get('start_param') || '';
      let refTg = 0;
      if (startParam.startsWith('ref_')) refTg = Number(startParam.slice(4));
      if (refTg) {
        const r = applyReferral(user.telegram_id, refTg);
        if (r) db.prepare('UPDATE users SET coins = coins + 500 WHERE id = ?').run(user.id);
      }
    }

    const offlineEnergy = applyOfflineEnergy(user);
    const offlineCoins = applyOfflineAutoTap(user);
    user = getUser(data.id);

    res.json({
      isNew,
      user: userPayload(user),
      upgrades: upgradesResponse(user.id),
      userUpgrades: getUserUpgrades(user.id),
      offlineEnergy,
      offlineCoins
    });
  } catch (e) {
    console.log(`${new Date().toISOString()} AUTH ERR: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tap', auth, (req, res) => {
  let user = req.dbUser || getUser(req.telegramUser.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  applyOfflineEnergy(user);
  user = getUser(req.telegramUser.id);

  const userUpgrades = getUserUpgrades(user.id);
  const s = stats(user, userUpgrades);

  const totalTaps = Math.min(parseInt(req.body?.taps) || 1, user.energy);

  let coinsEarned = 0;
  const tapsArray = Array.from({ length: totalTaps }, () => {
    const lucky = s.luckyChance > 0 && Math.random() * 100 < s.luckyChance;
    return s.coinsPerTap * s.globalMultiplier * s.tapMultiplier * (lucky ? 10 : 1);
  });
  coinsEarned = tapsArray.reduce((a, b) => a + b, 0);

  const newEnergy = Math.max(0, user.energy - totalTaps);
  const xp = totalTaps;

  db.prepare('UPDATE users SET coins = coins + ?, energy = ?, xp = xp + ?, total_taps = total_taps + ?, last_seen = ? WHERE id = ?')
    .run(coinsEarned, newEnergy, xp, totalTaps, new Date().toISOString(), user.id);

  const leveled = applyLevelUp(user.id);
  const updated = getUser(req.telegramUser.id);

  const bossHit = addBossDamage(user.id, totalTaps);

  res.json({
    coinsEarned: Math.floor(coinsEarned),
    energy: newEnergy,
    totalCoins: updated.coins,
    totalTaps: updated.total_taps,
    xp: updated.xp,
    level: updated.level,
    leveledUp: leveled.leveled,
    levelReward: leveled.reward,
    stats: { ...s, frenzyActive: !!s.frenzyActive },
    boss: bossHit.boss,
    bossDefeated: bossHit.defeated || false,
    bossReward: bossHit.reward || null
  });
});

app.post('/api/regen', auth, (req, res) => {
  const user = req.dbUser || getUser(req.telegramUser.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const userUpgrades = getUserUpgrades(user.id);
  const s = stats(user, userUpgrades);

  const regenAmount = s.energyRegen || 1;
  const newEnergy = Math.min(user.energy + regenAmount, s.maxEnergy);

  db.prepare('UPDATE users SET energy = ? WHERE id = ?').run(newEnergy, user.id);

  res.json({ energy: newEnergy, maxEnergy: s.maxEnergy });
});

app.post('/api/upgrade/:id', auth, (req, res) => {
  const user = req.dbUser || getUser(req.telegramUser.id);
  const result = purchaseUpgrade(user.id, parseInt(req.params.id));
  if (result.error) return res.status(400).json(result);

  const updatedUser = getUser(req.telegramUser.id);
  const userUpgrades = getUserUpgrades(user.id);

  res.json({ ...result, coins: updatedUser.coins, stats: stats(updatedUser, userUpgrades) });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ leaderboard: getLeaderboard() });
});

app.get('/api/boss', auth, (req, res) => {
  const user = req.dbUser || getUser(req.telegramUser.id);
  const myDamage = user ? getUserBossContribution(user.id) : 0;
  const top = getBossTop(10);
  res.json({ boss: getBossPublic(), myDamage, top });
});

app.get('/api/card', auth, (req, res) => {
  const user = getUser(req.telegramUser.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { rank, total } = getUserLeaderboardRank(user.id);
  const referrals = userPublicInfo(user.id).referrals;
  res.json({
    nickname: user.first_name || user.username || ('#' + user.telegram_id),
    username: user.username,
    level: user.level,
    coins: user.coins,
    totalTaps: user.total_taps,
    referrals,
    rank,
    total
  });
});

app.get('/api/profile', auth, (req, res) => {
  const user = getUser(req.telegramUser.id);
  res.json({ user: userPayload(user) });
});

app.get('/api/admin/me', auth, (req, res) => {
  const u = req.dbUser || getUser(req.telegramUser.id);
  res.json({ isAdmin: !!isAdmin(req.telegramUser.id), user: u ? userPayload(u) : null });
});

app.get('/api/admin/stats', auth, requireAdmin, (req, res) => {
  res.json({ stats: adminStats(), admins: getAdmins() });
});

app.get('/api/admin/users', auth, requireAdmin, (req, res) => {
  const q = req.query.q || '';
  const offset = Math.max(0, parseInt(req.query.offset) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
  res.json(searchUsers(q, offset, limit));
});

app.get('/api/admin/users/:id', auth, requireAdmin, (req, res) => {
  const target = getUser(parseInt(req.params.id));
  if (!target) return res.status(404).json({ error: 'User not found' });
  const userUpgrades = getUserUpgrades(target.id);
  res.json({
    user: { ...userPayload(target), stats: stats(target, userUpgrades) },
    upgrades: userUpgrades,
    admin: isAdmin(target.telegram_id)
  });
});

app.post('/api/admin/users/:id/coins', auth, requireAdmin, (req, res) => {
  const tgId = parseInt(req.params.id);
  const amount = Math.round(Number(req.body?.amount) || 0);
  if (amount === 0) return res.status(400).json({ error: 'Amount must not be zero' });

  const target = getUser(tgId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const result = giveCoins(tgId, amount);
  logAdmin(req.telegramUser.id, 'coins', tgId, `${amount > 0 ? '+' : ''}${amount}`);
  res.json({ ...result, from: req.telegramUser.id });
});

app.post('/api/admin/users/:id/block', auth, requireAdmin, (req, res) => {
  const tgId = parseInt(req.params.id);
  const target = getUser(tgId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (isAdmin(tgId)) return res.status(400).json({ error: 'Нельзя заблокировать администратора' });

  const result = setBlocked(tgId, true);
  logAdmin(req.telegramUser.id, 'block', tgId, '');
  res.json({ blocked: true, user: result });
});

app.post('/api/admin/users/:id/unblock', auth, requireAdmin, (req, res) => {
  const tgId = parseInt(req.params.id);
  const target = getUser(tgId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const result = setBlocked(tgId, false);
  logAdmin(req.telegramUser.id, 'unblock', tgId, '');
  res.json({ blocked: false, user: result });
});

app.post('/api/admin/users/:id/admin', auth, requireAdmin, (req, res) => {
  const tgId = parseInt(req.params.id);
  const target = getUser(tgId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const protect = !!req.body?.protected;
  if (protect && req.telegramUser.id !== OWNER_ID) {
    return res.status(403).json({ error: 'Только владелец может назначить неудаляемого админа' });
  }

  const row = grantAdmin(tgId, !protect, req.telegramUser.id);
  logAdmin(req.telegramUser.id, 'grant_admin', tgId, `protected=${protect}`);
  res.json({ admin: row });
});

app.post('/api/admin/users/:id/remove-admin', auth, requireAdmin, (req, res) => {
  const tgId = parseInt(req.params.id);
  const targetAdmin = isAdmin(tgId);
  if (!targetAdmin) return res.status(400).json({ error: 'Не является админом' });
  if (targetAdmin.can_remove === 0) return res.status(403).json({ error: 'Этого админа нельзя удалить' });

  revokeAdmin(tgId);
  logAdmin(req.telegramUser.id, 'revoke_admin', tgId, '');
  res.json({ removed: true });
});

app.post('/api/admin/users/:id/reset', auth, requireAdmin, (req, res) => {
  const tgId = parseInt(req.params.id);
  const target = getUser(tgId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (isAdmin(tgId)) return res.status(400).json({ error: 'Нельзя сбросить администратора' });

  const result = resetUser(tgId);
  logAdmin(req.telegramUser.id, 'reset', tgId, '');
  res.json({ user: result });
});

app.post('/api/admin/reset-me', auth, requireAdmin, (req, res) => {
  const result = resetUser(req.telegramUser.id);
  if (result.error) return res.status(404).json(result);
  logAdmin(req.telegramUser.id, 'reset_me', req.telegramUser.id, '');
  res.json({ user: result });
});

app.post('/api/admin/vanish', auth, requireAdmin, (req, res) => {
  const want = req.body?.vanished;
  const next = typeof want === 'boolean' ? want : !(req.dbUser && req.dbUser.vanished);
  const result = setVanished(req.telegramUser.id, next);
  if (result.error) return res.status(400).json(result);
  logAdmin(req.telegramUser.id, 'vanish', req.telegramUser.id, next ? 'скрыт из топа' : 'показан в топе');
  res.json({ user: result });
});

app.post('/api/admin/users/:id/vanish', auth, requireAdmin, (req, res) => {
  const tgId = parseInt(req.params.id);
  const target = getUser(tgId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const want = typeof req.body?.vanished === 'boolean' ? req.body.vanished : !target.vanished;
  const result = adminSetVanished(tgId, want);
  if (result.error) return res.status(400).json(result);
  logAdmin(req.telegramUser.id, 'vanish', tgId, want ? 'скрыт из топа' : 'показан в топе');
  res.json({ user: result });
});

app.post('/api/admin/users/:id/level', auth, requireAdmin, (req, res) => {
  const tgId = parseInt(req.params.id);
  const xp = Math.round(Number(req.body?.xp) ?? NaN);
  if (isNaN(xp) || xp < 0) return res.status(400).json({ error: 'Invalid xp' });

  const result = setUserXp(tgId, xp);
  if (result.error) return res.status(404).json(result);
  logAdmin(req.telegramUser.id, 'set_level', tgId, `xp=${xp}`);
  res.json(result);
});

app.get('/api/admin/logs', auth, requireAdmin, (req, res) => {
  res.json({ logs: getAdminLogs(parseInt(req.query.limit) || 50) });
});

app.listen(PORT, () => {
  console.log(`CoreTap server running on port ${PORT}`);
});

import { startBot } from './bot.js';
startBot();

autoBackup();
setInterval(autoBackup, 6 * 60 * 60 * 1000);