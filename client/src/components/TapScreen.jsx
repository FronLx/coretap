import React, { useState, useRef, useCallback } from 'react';
import './TapScreen.css';

export default function TapScreen({ display, stats, equippedSkin, onTap, frenzy, onFrenzy }) {
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(null);
  const coinRef = useRef(null);

  const energyPercent = stats?.maxEnergy ? (display.energy / stats.maxEnergy) * 100 : 0;
  const cpt = (stats?.coinsPerTap || 1) * (stats?.globalMultiplier || 1) * (frenzy ? 2 : 1);
  const skinColor = equippedSkin?.color || '#e8c34a';

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
        <span className="energy-label">⚡ {Math.floor(display.energy)} / {stats?.maxEnergy || 0}</span>
      </div>

      <div className="tap-arena">
        <div className={`tap-ring ${flash ? 'flash' : ''}`} style={{ '--skin': skinColor }}>
          <div
            ref={coinRef}
            className="tap-coin"
            style={{ borderColor: skinColor, boxShadow: `0 0 60px ${skinColor}55, inset 0 0 30px ${skinColor}22` }}
          >
            <span className="tap-coin-icon">{equippedSkin?.icon || '🪙'}</span>
            <span className="tap-coin-label">{equippedSkin?.name || 'Classic'}</span>
          </div>
        </div>
        <p className="tap-hint">Жми, пока энергия есть!</p>
      </div>

      <div className="tap-bottom">
        <div className="boost-row">
          <button className={`boost-btn ${frenzy ? 'active' : ''}`} onClick={handleFrenzy}>
            <span className="boost-icon">🔥</span>
            <span className="boost-title">Френзи ×2</span>
            <span className="boost-cost">1000 🪙</span>
          </button>
        </div>
        <div className="stats-chips">
          <span className="chip">👆 +{Math.floor(cpt)}/тап</span>
          <span className="chip">💎 ×{(stats?.globalMultiplier || 1).toFixed(1)}</span>
          <span className="chip">🔋 {stats?.energyRegen || 1}/сек</span>
        </div>
      </div>
    </div>
  );
}