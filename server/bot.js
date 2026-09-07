import fs from 'fs';
import path from 'path';
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

export async function sendStartMessage(chatId, startParam) {
  const isRef = startParam && startParam.startsWith('ref_');
  let text = '';
  if (isRef) {
    text = `🌟 <b>CoreTap — премиум-тапалка!</b> 🌟\n\n`
      + `Тебя пригласили в игру! 🎁\n`
      + `Тапай монету, качай уровень и зарабатывай. Помни: на старте ты получишь бонусные монеты! 🪙\n\n`
      + `<i>Запусти игру и погнали! 🚀</i>`;
  } else {
    text = `🌟 <b>CoreTap — премиум-тапалка!</b> 🌟\n\n`
      + `👆 Тапай по монете — каждое касание приносит монеты\n`
      + `⚡ Следи за энергией и её регенерацией\n`
      + `🛒 Покупай апгрейды в магазине\n`
      + `🔥 Tap Frenzy — x2 монет на 30 секунд\n`
      + `🤖 Auto Tapper — майнит монеты даже офлайн\n`
      + `👥 Зови друзей — получай +1000 монет за каждого!\n\n`
      + `<i>Жми «Играть» и стань самым богатым! 😎</i>`;
  }

  await apiCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{
        text: '🚀 Играть в CoreTap',
        web_app: { url: WEBAPP_URL }
      }]]
    }
  });
}

async function handleUpdate(update) {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;

  if (message.text.startsWith('/start')) {
    const parts = message.text.split(' ');
    await sendStartMessage(chatId, parts[1] || '');
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