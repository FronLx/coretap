import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getUser, createUser, getBossPublic, getUserBossContribution,
  getUserLeaderboardRank, userPublicInfo, BOSS_COOLDOWN_S, isAdmin, setVanished,
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

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'http://localhost:5173';

let updateOffset = 0;
let polling = false;

async function apiCall(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return res.json();
}

const chatHistory = new Map();

async function cleanPreviousMessages(chatId) {
  const ids = chatHistory.get(chatId);
  if (!ids || ids.length === 0) return;
  chatHistory.delete(chatId);
  for (const id of ids) {
    try {
      await apiCall('deleteMessage', { chat_id: chatId, message_id: id });
    } catch (e) {}
  }
}

async function sendBotMessage(chatId, params) {
  await cleanPreviousMessages(chatId);
  const data = await apiCall('sendMessage', { chat_id: chatId, ...params });
  if (data.ok && data.result?.message_id) {
    const ids = chatHistory.get(chatId) || [];
    ids.push(data.result.message_id);
    chatHistory.set(chatId, ids);
  }
  return data;
}

async function sendBotPhoto(chatId, params) {
  await cleanPreviousMessages(chatId);
  const data = await apiCallFile('sendPhoto', { chat_id: chatId, ...params });
  if (data.ok && data.result?.message_id) {
    const ids = chatHistory.get(chatId) || [];
    ids.push(data.result.message_id);
    chatHistory.set(chatId, ids);
  }
  return data;
}

export async function sendStartMessage(chatId, startParam) {
  const isRef = startParam && startParam.startsWith('ref_');
  const isCard = startParam === 'card';
  if (isCard) return sendCardMessage(chatId);

  let text = '';
  const TAP = '<tg-emoji emoji-id="5420363154070707696">👆</tg-emoji>';
  const OK = '<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>';
  const CLAP = '<tg-emoji emoji-id="5381888390356541373">👏</tg-emoji>';

  if (isRef) {
    text = `<b>CoreTap</b>\n\n`
      + `Тебя пригласил друг — монеты уже ждут ${OK}\n\n`
      + `Тапай по монете, прокачивайся в магазине и забирайся в топ.\n\n`
      + `<i>Жми «Играть» — и погнали!</i>`;
  } else {
    text = `<b>CoreTap</b>\n\n`
      + `Тапай по монете и зарабатывай ${TAP}\n`
      + `Энергия восстанавливается сама, а магазин ускоряет игру ${OK}\n`
      + `Зови друзей — бонус за каждого ${CLAP}\n\n`
      + `<i>Жми «Играть» и войди в топ!</i>`;
  }

  await sendBotMessage(chatId, {
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{
        text: 'Играть в CoreTap',
        web_app: { url: WEBAPP_URL }
      }]]
    }
  });
}

async function apiCallFile(method, fields) {
  const fd = new FormData();
  const filename = fields.filename;
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'filename') continue;
    if (v instanceof Blob) fd.append(k, v, filename || 'file');
    else fd.append(k, v);
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    body: fd
  });
  return res.json();
}

function fmt(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export async function sendCardMessage(chatId) {
  let user = getUser(chatId);
  if (!user) user = createUser(chatId, '', '');

  const { rank, total } = getUserLeaderboardRank(user.id);
  const referrals = userPublicInfo(user.id).referrals;
  const nickname = user.first_name || user.username || ('#' + chatId);

  let png = null;
  try {
    const { renderUserCard } = await import('./card.js');
    png = await renderUserCard({
      nickname,
      username: user.username,
      level: user.level,
      coins: user.coins,
      totalTaps: user.total_taps,
      referrals,
      rank,
      total,
      botUsername: process.env.BOT_USERNAME || 'coretapbot'
    });
  } catch (e) {
    console.error('Card render error:', e.message);
  }

  if (!png) {
    const fallback = `<b>${nickname}</b>\n\n`
      + `🪙 Монеты: <b>${fmt(user.coins)}</b>\n`
      + `⬆️ Уровень: <b>${user.level}</b>\n`
      + `👆 Тапов: <b>${fmt(user.total_taps)}</b>\n`
      + `🏆 Место: <b>#${rank || '—'} из ${total || '—'}</b>\n`
      + `👥 Друзей: <b>${referrals}</b>\n\n`
      + `Карточка скоро станет красивой картинкой 🎴`;
    await sendBotMessage(chatId, { text: fallback, parse_mode: 'HTML' });
    return;
  }

  const caption = `<b>${nickname}</b> · ур. ${user.level}\n`
    + `🪙 ${fmt(user.coins)} монет · 👆 ${fmt(user.total_taps)} тапов\n`
    + `🏆 #${rank || '—'} из ${total || '—'} · 👥 ${referrals}\n\n`
    + `Хвастайся друзьям и терзай монету вместе с нами!`;

  await sendBotPhoto(chatId, {
    photo: new Blob([png], { type: 'image/png' }),
    filename: 'card.png',
    caption,
    parse_mode: 'HTML'
  });
}

export async function sendBossMessage(chatId) {
  const boss = getBossPublic();
  const user = getUser(chatId);
  const myDamage = user ? getUserBossContribution(user.id) : 0;

  let text;
  if (boss.phase === 'active') {
    const hpLeft = Math.max(0, boss.current_hp);
    text = `👹 <b>Общий босс</b>\n\n`
      + `Осталось HP: <b>${fmt(hpLeft)} / ${fmt(boss.total_hp)}</b> (повержен на ${boss.pct}%)\n`
      + `Призовой фонд: <b>${fmt(boss.pool)} монет</b>\n\n`
      + `${myDamage > 0 ? `Твой вклад: <b>${fmt(myDamage)}</b>\n\n` : ''}`
      + `Каждый тап = 1 урон. Награда делится между всеми, кто бил босса. Давай добьём!`;
    await sendBotMessage(chatId, {
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: 'Играть в CoreTap', web_app: { url: WEBAPP_URL } }]]
      }
    });
  } else {
    const elapsed = boss.ended_at ? Date.now() - new Date(boss.ended_at).getTime() : 0;
    const left = Math.max(0, Math.ceil((BOSS_COOLDOWN_S * 1000 - elapsed) / 1000));
    text = `👹 <b>Общий босс повержен!</b>\n\n`
      + `Призовой фонд раздан участникам.\n`
      + `Новая волна через <b>${left}</b> сек. Успей первым!`;
    await sendBotMessage(chatId, {
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: 'Играть в CoreTap', web_app: { url: WEBAPP_URL } }]]
      }
    });
  }
}

async function handleUpdate(update) {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;

  if (message.text.startsWith('/start')) {
    const parts = message.text.split(' ');
    await sendStartMessage(chatId, parts[1] || '');
  } else if (message.text === '/card') {
    await sendCardMessage(chatId);
  } else if (message.text === '/boss') {
    await sendBossMessage(chatId);
  } else if (message.text === '/vanish') {
    if (!isAdmin(chatId)) {
      await sendBotMessage(chatId, { text: 'Это команда только для админов 🙅‍♂️' });
      return;
    }
    const current = getUser(chatId);
    const next = !(current && current.vanished);
    setVanished(chatId, next);
    const reply = next
      ? '🫥 Готово: ты скрыт из общего топа. Отправь /vanish, чтобы снова появиться.'
      : '👁 Готово: ты снова виден в общем топе.';
    await sendBotMessage(chatId, { text: reply });
  } else if (message.text === '/coin') {
    if (!isAdmin(chatId)) {
      await sendBotMessage(chatId, { text: 'Это команда только для админов 🙅‍♂️' });
      return;
    }
    let png = null;
    try {
      const { renderCoin } = await import('./coin.js');
      png = await renderCoin();
    } catch (e) {
      console.error('Coin render error:', e.message);
    }
    if (!png) {
      await sendBotMessage(chatId, { text: 'Не удалось отчеканить монетку 😔 Попробуй позже.' });
      return;
    }
    await sendBotPhoto(chatId, {
      photo: new Blob([png], { type: 'image/png' }),
      filename: 'coretap-coin.png',
      caption: '🎖 <b>Эксклюзивный коин CoreTap</b>\nСтавь его на аватар — и все сразу поймут, кто тут король монеты!'
    });
  }
}

async function poll() {
  if (polling) return;
  polling = true;

  try {
    const data = await apiCall('getUpdates', {
      offset: updateOffset,
      timeout: 25,
      allowed_updates: ['message']
    });

    if (data.ok && data.result) {
      for (const update of data.result) {
        updateOffset = update.update_id + 1;
        try {
          await handleUpdate(update);
        } catch (e) {
          console.error('Update error:', e.message);
        }
      }
    }
  } catch (e) {
  } finally {
    polling = false;
  }
}

export function startBot() {
  if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN') {
    console.warn('Bot token not set, Telegram bot disabled');
    return;
  }
  setInterval(poll, 1000);
  setTimeout(poll, 500);
  console.log('CoreTap bot polling started');
}