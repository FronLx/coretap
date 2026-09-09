import React, { useState, useRef, useCallback, useEffect } from 'react';
import { BoltIcon, CoinIcon, UsersIcon, CloseIcon } from './Icons.jsx';
import './TapScreen.css';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'coretapbot';

function fmt(n) {
  return Math.round(n || 0).toLocaleString('ru-RU');
}

function Modal({ onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><CloseIcon size={18} /></button>
        {children}
      </div>
    </div>
  );
}

export default function TapScreen({ display, stats, user, boss, onTap }) {
  const [flash, setFlash] = useState(false);
  const [modal, setModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const flashTimer = useRef(null);
  const coinRef = useRef(null);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const energyPercent = stats?.maxEnergy ? (display.energy / stats.maxEnergy) * 100 : 0;
  const cpt = (stats?.coinsPerTap || 1) * (stats?.globalMultiplier || 1) * (stats?.tapMultiplier || 1);

  const xp = user?.xp || 0;
  const level = Math.floor(xp / 100) + 1;
  const levelProgress = xp % 100;
  const referrals = user?.referrals || 0;

  const bossActive = boss?.phase === 'active';
  const bossPct = bossActive ? Math.max(0, Math.min(100, boss?.pct || 0)) : 100;
  const bossLeftS = boss && boss.phase === 'dead' && boss.ended_at
    ? Math.max(0, Math.ceil(((boss.cooldown_s || 120) * 1000 - (now - new Date(boss.ended_at).getTime())) / 1000))
    : 0;

  const handleTapStart = useCallback((e) => {
    e.preventDefault();
    if (display.energy <= 0) return;

    onTap();

    if (coinRef.current) {
      const el = coinRef.current;
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    }

    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 130);
  }, [display.energy, onTap]);

  const copyReferral = async () => {
    const link = `https://t.me/${BOT_USERNAME}?start=ref_${user?.telegram_id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="tap-screen" onPointerDown={handleTapStart}>
        <div className="energy-bar">
          <div className="energy-bar-fill" style={{ width: `${energyPercent}%` }} />
          <span className="energy-label"><BoltIcon size={15} /> {Math.floor(display.energy)} / {stats?.maxEnergy || 0}</span>
        </div>

        <div className="level-bar">
          <div className="level-track">
            <div className="level-fill" style={{ width: `${Math.min(100, levelProgress)}%` }} />
          </div>
          <span className="level-label">⭐️ Ур. {level} · {levelProgress}/100 XP</span>
        </div>

        {boss && (
          <div className={`boss-widget ${bossActive ? '' : 'boss-dead'}`}>
          <div className="boss-row">
            <span className="boss-icon">👹</span>
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

        <div className="action-row">
          <button className="action-btn" onClick={(e) => { e.stopPropagation(); setModal('referrals'); }}>
            <UsersIcon size={18} /> <span>Друзья</span><em>{referrals}</em>
          </button>
        </div>

        <div className="tap-arena">
          <div className={`tap-ring ${flash ? 'flash' : ''}`}>
            <div ref={coinRef} className="tap-coin">
              <CoinIcon size={96} className="tap-coin-icon" />
              <span className="tap-coin-label">CoreTap</span>
            </div>
          </div>
          <p className="tap-hint">Жми, пока энергия есть!</p>
        </div>

        <div className="tap-bottom" onPointerDown={(e) => e.stopPropagation()}>
          <div className="stats-chips">
            <span className="chip"><CoinIcon size={15} /> +{Math.floor(cpt)}/тап</span>
            <span className="chip"><BoltIcon size={15} /> {stats?.energyRegen || 1}/сек</span>
            <span className="chip">🍀 {stats?.luckyChance || 0}% x10</span>
            {stats?.autoTap > 0 && (
              <span className="chip chip-neon">🤖 {stats.autoTap}/сек автотап</span>
            )}
          </div>
        </div>
      </div>

      {modal === 'referrals' && (
        <Modal onClose={() => setModal(null)}>
          <h2 className="modal-title">👥 Друзья</h2>
          <p className="modal-sub">За каждого друга — <b>+1000 🪙</b> тебе, <b>+500 🪙</b> другу.</p>
          <p className="modal-sub">Приглашено: <b>{referrals}</b></p>
          <div className="ref-link">
            <input readOnly value={`https://t.me/${BOT_USERNAME}?start=ref_${user?.telegram_id}`} />
          </div>
          <button className="btn-primary modal-action" onClick={copyReferral}>
            {copied ? '✅ Скопировано!' : '📋 Скопировать'}
          </button>
        </Modal>
      )}
    </>
  );
}
