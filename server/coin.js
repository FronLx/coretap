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

const SIZE = 512;
const CX = SIZE / 2;
const CY = SIZE / 2;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderCoin() {
  const canvasModule = await import('@napi-rs/canvas');
  const { createCanvas, GlobalFonts } = canvasModule;

  if (FONT_REGULAR) {
    try { GlobalFonts.registerFromPath(FONT_REGULAR, 'PTSans'); } catch (e) {}
  }
  if (FONT_BOLD) {
    try { GlobalFonts.registerFromPath(FONT_BOLD, 'PTSans'); } catch (e) {}
  }
  const fam = (FONT_REGULAR || FONT_BOLD) ? 'PTSans' : 'sans-serif';

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  const glow = ctx.createRadialGradient(CX, CY, 60, CX, CY, 240);
  glow.addColorStop(0, 'rgba(249, 115, 22, 0.40)');
  glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(CX, CY, 240, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createLinearGradient(CX - 210, CY - 210, CX + 210, CY + 210);
  body.addColorStop(0, '#ffb25e');
  body.addColorStop(0.5, '#f97316');
  body.addColorStop(1, '#c2410c');

  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, 210, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#9a3412';
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255, 224, 170, 0.55)';
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, 170, 0, Math.PI * 2);
  const face = ctx.createLinearGradient(CX - 170, CY - 170, CX + 170, CY + 170);
  face.addColorStop(0, '#241507');
  face.addColorStop(1, '#140b04');
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(249, 115, 22, 0.85)';
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, 170, 0, Math.PI * 2);
  ctx.clip();
  const sheen = ctx.createRadialGradient(CX - 70, CY - 90, 20, CX - 70, CY - 90, 190);
  sheen.addColorStop(0, 'rgba(255, 210, 150, 0.22)');
  sheen.addColorStop(1, 'rgba(255, 210, 150, 0)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(CX, CY, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const dotColor = '#ffd9a8';
  for (const deg of [-90, 0, 90, 180]) {
    const rad = (deg * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(CX + Math.cos(rad) * 210, CY + Math.sin(rad) * 210, 9, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `800 250px ${fam}`;
  const cGrad = ctx.createLinearGradient(CX - 120, CY - 130, CX + 120, CY + 130);
  cGrad.addColorStop(0, '#ffc46b');
  cGrad.addColorStop(1, '#f97316');
  ctx.fillStyle = cGrad;
  ctx.fillText('C', CX, 232);

  const tag = 'CORETAP';
  ctx.font = `700 54px ${fam}`;
  const tagW = ctx.measureText(tag).width + 56;
  ctx.fillStyle = '#f97316';
  roundRect(ctx, CX - tagW / 2, 332, tagW, 62, 31);
  ctx.fill();
  ctx.fillStyle = '#241507';
  ctx.font = `800 38px ${fam}`;
  ctx.fillText(tag, CX, 364);

  ctx.font = `600 24px ${fam}`;
  ctx.fillStyle = 'rgba(255, 214, 170, 0.75)';
  ctx.fillText('★ EXCLUSIVE ★', CX, 452);

  return canvas.toBuffer('image/png');
}