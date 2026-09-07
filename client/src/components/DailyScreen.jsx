import React, { useState, useEffect } from 'react';
import { GiftIcon, CoinIcon, TrophyIcon } from './Icons.jsx';
import './DailyScreen.css';

const REWARDS = [1000, 2000, 3000, 5000, 7500, 10000, 25000];

const API_URL = import.meta.env.VITE_API_URL || '';

function api(path, options = {}) {
  const initData = window.Telegram?.WebApp?.initData || '';
  const headers = { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData, ...options.headers };
  return fetch(`${API_URL}${path}`, { ...options, headers }).then(r => r.json());
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export default function DailyScreen({ user, onClaim }) {
  const [claiming, setClaiming] = useState(false);
  const [claimedDay, setClaimedDay] = useState(user?.daily_streak || 0);
  const [canClaim, setCanClaim] = useState(true);
  const [nextClaimAt, setNextClaimAt] = useState(user?.nextClaimAt || 0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    checkLastClaim();
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const checkLastClaim = async () => {
    try {
      const data = await api('/api/auth', { method: 'POST', body: JSON.stringify({ initData: getInitData() }) });
      const nca = data.user?.nextClaimAt;
      setNextClaimAt(nca || 0);
      if (nca) setCanClaim(nca <= Date.now());
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
        setNextClaimAt(result.nextClaimAt || Date.now() + 24 * 3600 * 1000);
      }
    } catch (e) {}
    setClaiming(false);
  };

  const allClaimed = claimedDay >= REWARDS.length;
  const remaining = nextClaimAt ? nextClaimAt - now : 0;

  return (
    <div className="daily-screen">
      <h2 className="daily-title"><GiftIcon size={22} className="daily-title-icon" /> Ежедневные награды</h2>
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
              <span className="daily-reward"><CoinIcon size={14} />{reward.toLocaleString('ru-RU')}</span>
              {isClaimed && <span className="daily-status"><span className="daily-check">✓</span></span>}
            </div>
          );
        })}
      </div>

      {allClaimed ? (
        <div className="daily-done">
          <TrophyIcon size={30} className="daily-done-icon" />
          <span>Все награды получены!</span>
        </div>
      ) : canClaim ? (
        <button
          className="daily-claim-btn active"
          onClick={handleClaim}
          disabled={claiming}
        >
          {claiming ? 'Забираю...' : 'Забрать награду'}
        </button>
      ) : (
        <div className="daily-countdown">
          <span className="daily-countdown-label">Следующая награда через</span>
          <span className="daily-countdown-time">{formatCountdown(remaining)}</span>
        </div>
      )}

      <div className="daily-streak">
        Текущий стрик: <strong>{claimedDay} / {REWARDS.length} дн.</strong>
      </div>
    </div>
  );
}