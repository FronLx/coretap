import React, { useState, useRef, useCallback } from 'react';
import { BoltIcon, FlameIcon, CoinIcon, CrownIcon, StarIcon, GemIcon } from './Icons.jsx';
import './TapScreen.css';

export default function TapScreen({ display, stats, equippedSkin, onTap, frenzy, onFrenzy, isPremium }) {
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(null);
  const coinRef = useRef(null);

  const energyPercent = stats?.maxEnergy ? (display.energy / stats.maxEnergy) * 100 : 0;
  const cpt = (stats?.coinsPerTap || 1) * (stats?.globalMultiplier || 1) * (frenzy ? 2 : 1);
  const skinColor = equippedSkin?.color || (isPremium ? '#ffd700' : '#e8c34a');
  const coinStroke = isPremium ? '#ffd700' : skinColor;

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

  const handleFrenzy = (e) => {
    e.stopPropagation();
    onFrenzy();
  };

  return (
    <div className="tap-screen" onPointerDown={handleTapStart}>
      <div className="energy-bar">
        <div className="energy-bar-fill" style={{ width: `${energyPercent}%` }} />
        <span className="energy-label"><BoltIcon size={15} /> {Math.floor(display.energy)} / {stats?.maxEnergy || 0}</span>
      </div>

      <div className="tap-arena">
        <div className={`tap-ring ${flash ? 'flash' : ''}`} style={{ '--skin': skinColor }}>
          <div
            ref={coinRef}
            className={`tap-coin ${isPremium ? 'premium' : ''}`}
            style={{ borderColor: skinColor, boxShadow: isPremium ? `0 0 60px #ffd70066, inset 0 0 30px #ffd70033` : `0 0 60px ${skinColor}55, inset 0 0 30px ${skinColor}22` }}
          >
            {isPremium ? <CrownIcon size={88} className="tap-coin-icon" style={{ color: 'var(--gold)' }} /> : <CoinIcon size={88} className="tap-coin-icon" />}
            <span className="tap-coin-label">{equippedSkin?.name || 'Classic'} {isPremium && <StarIcon size={13} style={{ color: 'var(--gold)', verticalAlign: '-2px' }} />}</span>
          </div>
        </div>
        <p className="tap-hint">Жми, пока энергия есть!</p>
      </div>

      <div className="tap-bottom" onPointerDown={(e) => e.stopPropagation()}>
        <div className="boost-row">
          <button className={`boost-btn ${frenzy ? 'active' : ''}`} onClick={handleFrenzy}>
            <FlameIcon size={26} className="boost-icon" />
            <span className="boost-title">Френзи ×2</span>
            <span className="boost-cost"><CoinIcon size={14} />1000</span>
          </button>
        </div>
        <div className="stats-chips">
          <span className="chip"><CoinIcon size={15} /> +{Math.floor(cpt)}/тап</span>
          <span className="chip"><GemIcon size={15} /> ×{(stats?.globalMultiplier || 1).toFixed(1)}</span>
          <span className="chip"><BoltIcon size={15} /> {stats?.energyRegen || 1}/сек</span>
        </div>
      </div>
    </div>
  );
}