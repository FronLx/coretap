import React, { useState, useEffect } from 'react';
import { CoinIcon, BoltIcon, UsersIcon } from './Icons.jsx';
import { api } from '../App.jsx';
import './ProfileScreen.css';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'coretapbot';

function fmt(n) {
  return Math.round(n || 0).toLocaleString('ru-RU');
}

export default function ProfileScreen({ display, user, stats, avatarUrl, onOpenCard }) {
  const [cardInfo, setCardInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    api('/api/card', { retries: 0, timeout: 6000 })
      .then(d => { if (alive) setCardInfo(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const level = Math.floor((user?.xp || 0) / 100) + 1;
  const progress = (user?.xp || 0) % 100;
  const name = user?.first_name || user?.username || 'Игрок';
  const initial = name.slice(0, 1).toUpperCase();
  const top = cardInfo ? `${fmt(cardInfo.rank)} / ${fmt(cardInfo.total)}` : '—';

  return (
    <div className="profile-screen">
      <div className="profile-header">
        {avatarUrl ? (
          <img className="profile-avatar" src={avatarUrl} alt="" />
        ) : (
          <div className="profile-avatar profile-avatar-fb">{initial}</div>
        )}
        <h1 className="profile-name">{name}</h1>
        <p className="profile-username">@{user?.username || 'нет username'}</p>
        <div className="profile-tags">
          <span className="profile-tag">{`Уровень ${level}`}</span>
          {user?.isAdmin && <span className="profile-tag profile-tag-accent">Админ</span>}
          {user?.isAdmin && user?.vanished && <span className="profile-tag profile-tag-vain">🫥 скрыт из топа</span>}
        </div>
        <div className="profile-xp-bar">
          <div className="profile-xp-track">
            <div className="profile-xp-fill" style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
          <span className="profile-xp-label">{progress}/100 XP</span>
        </div>
      </div>

      <div className="profile-stats">
        <div className="profile-stat">
          <span className="profile-stat-icon"><CoinIcon size={20} /></span>
          <strong className="profile-stat-value">{fmt(display?.coins)}</strong>
          <span className="profile-stat-label">Монеты</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-icon">👆</span>
          <strong className="profile-stat-value">{fmt(display?.taps)}</strong>
          <span className="profile-stat-label">Тапов</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-icon"><UsersIcon size={20} /></span>
          <strong className="profile-stat-value">{fmt(user?.referrals)}</strong>
          <span className="profile-stat-label">Друзья</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-icon">🏆</span>
          <strong className="profile-stat-value">{top}</strong>
          <span className="profile-stat-label">Место в топе</span>
        </div>
      </div>

      <div className="profile-chips">
        <span className="profile-chip"><CoinIcon size={15} /> +{fmt(stats?.coinsPerTap * stats?.globalMultiplier * (stats?.tapMultiplier || 1))}/тап</span>
        <span className="profile-chip"><BoltIcon size={15} /> {stats?.energyRegen || 1}/сек</span>
        <span className="profile-chip">🍀 {stats?.luckyChance || 0}% x10</span>
        {stats?.autoTap > 0 && <span className="profile-chip">🤖 {stats.autoTap}/сек автотап</span>}
      </div>

      <button className="btn-primary profile-card-btn" onClick={onOpenCard}>
        🖼 Моя карточка
      </button>
      <p className="profile-card-hint">Картинка-хвастовство: уровень, монеты и место в топе — отправь боту /card, чтобы получить.</p>
    </div>
  );
}