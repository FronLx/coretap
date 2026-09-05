import React, { useState, useEffect } from 'react';
import './DailyScreen.css';

const API_URL = import.meta.env.VITE_API_URL || '';

function api(path, options = {}) {
  const initData = window.Telegram?.WebApp?.initData || '';
  const headers = { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData, ...options.headers };
  return fetch(`${API_URL}${path}`, { ...options, headers }).then(r => r.json());
}

const REWARDS = [1000, 2000, 3000, 5000, 7500, 10000, 25000];

export default function DailyScreen({ user, onClaim }) {
  const [claiming, setClaiming] = useState(false);
  const [claimedDay, setClaimedDay] = useState(user?.daily_streak || 0);
  const [canClaim, setCanClaim] = useState(true);

  useEffect(() => {
    checkLastClaim();
  }, []);

  const checkLastClaim = async () => {
    try {
      const data = await api('/api/auth', { method: 'POST', body: JSON.stringify({ initData: getInitData() }) });
      if (data.user?.last_daily_claim) {
        const last = new Date(data.user.last_daily_claim);
        const today = new Date();
        const diff = Math.floor((today - last) / (1000 * 60 * 60 * 24));
        if (diff < 1) setCanClaim(false);
      }
    } catch (e) {}
  };

  const getInitData = () => window.Telegram?.WebApp?.initData || '';

  const handleClaim = async () => {
    if (!canClaim) return;
    setClaiming(true);
    try {
      const result = await onClaim();
      if (result && result.day) {
        setClaimedDay(result.day);
        setCanClaim(false);
      }
    } catch (e) {}
    setClaiming(false);
  };

  return (
    <div className="daily-screen">
      <h2 className="daily-title">🎁 Ежедневные награды</h2>
      <p className="daily-subtitle">Возвращайся каждый день за новой наградой!</p>

      <div className="daily-grid">
        {REWARDS.map((reward, index) => {
          const day = index + 1;
          const isClaimed = day <= claimedDay;
          const isCurrent = day === claimedDay + 1 && canClaim;
          const isLocked = day > claimedDay + 1 || (!canClaim && day === claimedDay + 1);

          return (
            <div
              key={day}
              className={`daily-card ${isClaimed ? 'claimed' : isCurrent ? 'current' : isLocked ? 'locked' : ''}`}
            >
              <span className="daily-day">День {day}</span>
              <span className="daily-reward">{reward.toLocaleString('ru-RU')} 🪙</span>
              {isClaimed && <span className="daily-status">✓ Забрано</span>}
            </div>
          );
        })}
      </div>

      <button
        className={`daily-claim-btn ${canClaim ? 'active' : 'disabled'}`}
        onClick={handleClaim}
        disabled={!canClaim || claiming}
      >
        {canClaim ? '🎁 Забрать награду' : 'Завтра!'}
      </button>

      <div className="daily-streak">
        Текущий стрик: <strong>{claimedDay} дн. 🔥</strong>
      </div>
    </div>
  );
}
