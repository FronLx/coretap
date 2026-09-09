import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FONT_DIR = path.join(__dirname, 'assets');

function fontPath(name) {
  return path.join(FONT_DIR, name);
}

const FONT_REGULAR = fs.existsSync(fontPath('PT_Sans-400.ttf')) ? fontPath('PT_Sans-400.ttf') : null;
const FONT_BOLD = fs.existsSync(fontPath('PT_Sans-Web-Bold.ttf')) ? fontPath('PT_Sans-Web-Bold.ttf') : null;

export function fontAvailable() {
  return !!(FONT_REGULAR || FONT_BOLD);
}

const W = 1080;
const H = 1350;

const COLORS = {
  bg: '#0a0a0c',
  card: '#131316',
  cardBorder: '#292930',
  white: '#f4f5f7',
  dim: '#9aa0aa',
  accent: '#f97316',
  accentDark: '#e26412',
  green: '#37c273',
  rule: '#232329'
};

function fmt(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function centerText(ctx, text, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, y);
}

export async function renderUserCard(data) {
  const canvasModule = await import('@napi-rs/canvas');
  const { createCanvas, GlobalFonts } = canvasModule;

  if (FONT_REGULAR) {
    try { GlobalFonts.registerFromPath(FONT_REGULAR, 'PTSans'); } catch (e) {}
  }
  if (FONT_BOLD) {
    try { GlobalFonts.registerFromPath(FONT_BOLD, 'PTSans'); } catch (e) {}
  }
  const fam = (FONT_REGULAR || FONT_BOLD) ? 'PTSans' : 'sans-serif';
  const F = (weight, px) => `${weight} ${px}px ${fam}`;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  centerText(ctx, 'C o r e T a p', 160, F(800, 92), COLORS.accent);
  ctx.fillStyle = COLORS.dim;
  ctx.textAlign = 'center';
  ctx.font = F(500, 30);
  ctx.fillText('ТАПАЙ — КАЧАЙСЯ — ХВАСТАЙСЯ', W / 2, 216);

  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 90, 252);
  ctx.lineTo(W / 2 + 90, 252);
  ctx.stroke();

  const px = 90;
  const py = 300;
  const pw = 900;
  const ph = 620;

  ctx.fillStyle = COLORS.card;
  roundRect(ctx, px, py, pw, ph, 36);
  ctx.fill();
  ctx.strokeStyle = COLORS.cardBorder;
  ctx.lineWidth = 2;
  roundRect(ctx, px, py, pw, ph, 36);
  ctx.stroke();

  const nick = (data.nickname || 'Player').slice(0, 24);
  centerText(ctx, nick.toUpperCase(), py + 90, F(800, 52), COLORS.white);

  const levelText = `УРОВЕНЬ ${data.level}`;
  ctx.font = F(700, 32);
  const levelW = ctx.measureText(levelText).width + 56;
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, W / 2 - levelW / 2, py + 148, levelW, 64, 32);
  ctx.fill();
  centerText(ctx, levelText, py + 180, F(800, 30), COLORS.bg);

  centerText(ctx, fmt(data.coins), py + 330, F(800, 92), COLORS.accent);
  centerText(ctx, 'МОНЕТ', py + 392, F(600, 28), COLORS.dim);

  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + 60, py + 460);
  ctx.lineTo(px + pw - 60, py + 460);
  ctx.stroke();

  const stats = [
    { label: 'ТАПОВ', value: fmt(data.totalTaps) },
    { label: 'ДРУЗЬЯ', value: fmt(data.referrals) },
    { label: 'ТОП', value: data.total ? `${data.rank} / ${data.total}` : '—' }
  ];
  const colW = pw / 3;
  stats.forEach((st, i) => {
    const cx = px + colW * i + colW / 2;
    ctx.font = F(700, 52);
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.value, cx, py + 530);
    ctx.font = F(500, 26);
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(st.label, cx, py + 580);
  });

  centerText(ctx, `@${data.botUsername || 'coretapbot'}`, H - 190, F(700, 44), COLORS.accent);
  centerText(ctx, 'ЖМИ ПО МОНЕТЕ И ЗАБИРАЙСЯ В ТОП', H - 120, F(500, 26), COLORS.dim);

  return canvas.toBuffer('image/png');
}