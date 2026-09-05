import React, { useState } from 'react';
import './TapScreen.css';

export default function TapScreen({ user, onTap, booses, onFrenzy }) {
  const [tapFlash, setTapFlash] = useState(false);
  const [isBoosting, setIsBoosting] = useState(false);

  const handleTap = (e) => {
    e.preventDefault();
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 100);
    const taps = 1;
    onTap(taps);
  };

  const energyPercent = user && user.maxEnergy ? (user.energy / user.maxEnergy) * 100 : 0;

  return (
    <div className="tap-screen">
      <div className="energy-bar">
        <div className="energy-bar-fill" style={{ width: `${energyPercent}%` }} />
        <span className="energy-label">
          ⚡ {Math.floor(user?.energy || 0)} / {user?.maxEnergy || 0}
        </span>
      </div>

      <div className="tap-canvas">
        <div className={`tap-cube ${tapFlash ? 'flashing' : ''}`} onClick={handleTap}>
          <div className="cube-face cube-front">⚡</div>
          <div className="cube-face cube-back">⚡</div>
          <div className="cube-face cube-left">⚡</div>
          <div className="cube-face cube-right">⚡</div>
          <div className="cube-face cube-top">⚡</div>
          <div className="cube-face cube-bottom">⚡</div>
        </div>
        <p className="tap-hint">Тапай по кубу!</p>
      </div>

      <div className="boost-row">
        <button className="boost-btn" onClick={onFrenzy} disabled={isBoosting}>
          🔥 Френзи
          <span className="boost-cost">1000</span>
        </button>
        <div className="stats-mini">
          <div>👆 +{user?.coinsPerTap || 1} за тап</div>
          <div>💎 x{user?.globalMultiplier || 1} множитель</div>
        </div>
      </div>
    </div>
  );
}
