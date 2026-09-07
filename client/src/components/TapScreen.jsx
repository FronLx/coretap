import React, { useState, useRef, useCallback } from 'react';
import { BoltIcon, CoinIcon } from './Icons.jsx';
import './TapScreen.css';

export default function TapScreen({ display, stats, onTap }) {
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(null);
  const coinRef = useRef(null);

  const energyPercent = stats?.maxEnergy ? (display.energy / stats.maxEnergy) * 100 : 0;
  const cpt = (stats?.coinsPerTap || 1) * (stats?.globalMultiplier || 1);

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

  return (
    <div className="tap-screen" onPointerDown={handleTapStart}>
      <div className="energy-bar">
        <div className="energy-bar-fill" style={{ width: `${energyPercent}%` }} />
        <span className="energy-label"><BoltIcon size={15} /> {Math.floor(display.energy)} / {stats?.maxEnergy || 0}</span>
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
        </div>
      </div>
    </div>
  );
}