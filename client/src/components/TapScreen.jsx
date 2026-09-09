import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import { BoltIcon, CoinIcon, SoundOnIcon, SoundOffIcon } from './Icons.jsx';
import { Emoji } from './Emoji.jsx';
import { playTapSound, initAudio, isSoundEnabled, setSoundEnabled } from '../utils/sound.js';
import './TapScreen.css';

function fmt(n) {
  return Math.round(n || 0).toLocaleString('ru-RU');
}

function fmtCpt(n) {
  if (!isFinite(n) || n < 0) n = 0;
  if (n >= 10) return String(Math.floor(n));
  const s = n.toFixed(1).replace('.', ',');
  return s.endsWith(',0') ? s.slice(0, -2) : s;
}

function fmtMult(m) {
  return (Math.round((m || 1) * 100) / 100).toString().replace('.', ',');
}

const StatsChips = memo(function StatsChips({ cpt, regen, lucky, autoTap, mult }) {
  return (
    <div className="stats-chips">
      <span className="chip"><CoinIcon size={15} /> +{fmtCpt(cpt)}/тап</span>
      {mult > 1 && (
        <span className="chip chip-gem"><Emoji>💎</Emoji> ×{fmtMult(mult)}</span>
      )}
      <span className="chip"><BoltIcon size={15} /> {regen}/сек</span>
      <span className="chip chip-lucky"><Emoji>🍀</Emoji> {lucky}% x10</span>
      {autoTap > 0 && (
        <span className="chip chip-neon"><Emoji>🤖</Emoji> {autoTap}/сек автотап</span>
      )}
    </div>
  );
});

export default function TapScreen({ display, stats, user, boss, onTap }) {
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [sparks, setSparks] = useState([]);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const flashTimer = useRef(null);
  const coinRef = useRef(null);

  const toggleSound = useCallback(() => {
    const next = !isSoundEnabled();
    setSoundEnabled(next);
    setSoundOn(next);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    const unlock = () => initAudio();
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('touchstart', unlock);
    return () => {
      clearInterval(iv);
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  const spawnSparks = useCallback(() => {
    const now = Date.now();
    const arr = [];
    for (let i = 0; i < 8; i++) {
      const ang = (Math.PI * 2 * i) / 8 + Math.random() * 0.55;
      const d0 = 60 + Math.random() * 70;
      arr.push({
        id: now + '-' + i,
        dx: (Math.cos(ang) * d0).toFixed(1) + 'px',
        dy: (Math.sin(ang) * d0).toFixed(1) + 'px',
        s: (3 + Math.random() * 3).toFixed(1) + 'px'
      });
    }
    setSparks(prev => [...prev.slice(-24), ...arr]);
    setTimeout(() => {
      setSparks(prev => prev.filter(s => !arr.some(a => a.id === s.id)));
    }, 600);
  }, []);

  const energyPercent = stats?.maxEnergy ? (display.energy / stats.maxEnergy) * 100 : 0;
  const cpt = (stats?.coinsPerTap || 1) * (stats?.globalMultiplier || 1) * (stats?.tapMultiplier || 1);

  const xp = user?.xp || 0;
  const level = Math.floor(xp / 100) + 1;
  const levelProgress = xp % 100;

  const bossActive = boss?.phase === 'active';
  const bossPct = bossActive ? Math.max(0, Math.min(100, boss?.pct || 0)) : 100;
  const bossLeftS = boss && boss.phase === 'dead' && boss.ended_at
    ? Math.max(0, Math.ceil(((boss.cooldown_s || 120) * 1000 - (now - new Date(boss.ended_at).getTime())) / 1000))
    : 0;

  const handleTapStart = useCallback((e) => {
    e.preventDefault();
    if (display.energy <= 0) return;

    onTap();
    playTapSound();

    if (coinRef.current) {
      const el = coinRef.current;
      el.classList.add('tapped');
      setTimeout(() => el.classList.remove('tapped'), 400);
    }

    spawnSparks();
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 130);
  }, [display.energy, onTap, spawnSparks]);

  return (
    <>
      <div className="tap-screen" onPointerDown={handleTapStart}>
        <div className="tap-top-row">
          <div className="energy-bar">
            <div className="energy-bar-fill" style={{ width: `${energyPercent}%` }} />
            <span className="energy-label"><BoltIcon size={15} /> {Math.floor(display.energy)} / {stats?.maxEnergy || 0}</span>
          </div>
          <button
            className={`sound-toggle ${soundOn ? '' : 'muted'}`}
            aria-label={soundOn ? 'Выключить звук' : 'Включить звук'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggleSound}
          >
            {soundOn ? <SoundOnIcon size={18} /> : <SoundOffIcon size={18} />}
          </button>
        </div>

        <div className="level-bar">
          <div className="level-track">
            <div className="level-fill" style={{ width: `${Math.min(100, levelProgress)}%` }} />
          </div>
          <span className="level-label"><Emoji>⭐️</Emoji> Ур. {level} · {levelProgress}/100 XP</span>
        </div>

        {boss && (
          <div className={`boss-widget ${bossActive ? '' : 'boss-dead'}`}>
          <div className="boss-row">
            <span className="boss-icon"><Emoji>👹</Emoji></span>
            <span className="boss-name">
              {bossActive ? 'Общий босс' : 'Босс повержен'}
            </span>
            <span className="boss-status">
              {bossActive
                ? `Убит на ${bossPct}%`
                : bossLeftS > 0 ? `новая волна через ${bossLeftS}с` : 'готовится...'}
            </span>
          </div>
          <div className="boss-track">
            <div className="boss-fill" style={{ width: `${bossPct}%` }} />
          </div>
          <div className="boss-sub">
            {bossActive
              ? `Вклад: ${fmt(boss?.myDamage)} · Фонд: ${fmt(boss?.pool)} · Остаток HP: ${fmt(boss?.current_hp)}/${fmt(boss?.total_hp)}`
              : 'Кто больше вложится — тот больше получит'}
          </div>
          </div>
        )}

        <div className="tap-arena">
          <div className={`tap-ring ${flash ? 'flash' : ''}`}>
            <div ref={coinRef} className="tap-coin">
              <BoltIcon size={118} className="tap-coin-icon" />
              <span className="tap-coin-label">CoreTap</span>
            </div>
          </div>
          <div className="spark-layer">
            {sparks.map(s => (
              <span
                key={s.id}
                className="tap-spark"
                style={{ '--dx': s.dx, '--dy': s.dy, '--s': s.s, left: '50%', top: '52%' }}
              />
            ))}
          </div>
          <p className="tap-hint">Жми, пока энергия есть!</p>
        </div>

        <div className="tap-bottom" onPointerDown={(e) => e.stopPropagation()}>
          <StatsChips cpt={cpt} regen={stats?.energyRegen || 1} lucky={stats?.luckyChance || 0} autoTap={stats?.autoTap || 0} mult={stats?.globalMultiplier || 1} />
        </div>
      </div>
    </>
  );
}
