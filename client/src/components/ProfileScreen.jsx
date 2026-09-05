import React from 'react';
import './ProfileScreen.css';

export default function ProfileScreen({ user, userUpgrades }) {
  const xpForLevel = user?.level ? user.level * 100 : 100;
  const xpProgress = user ? Math.min(((user.xp % 100) / 100) * 100, 100) : 0;
  const totalPower = userUpgrades.reduce((sum, u) => sum + (u.effect_value * u.level), 0);
  const cpt = user?.coinsPerTap || 1;

  return (
    <div className="profile-screen">
      <div className="profile-avatar">
        {user?.first_name?.[0]?.toUpperCase() || '⚡'}
      </div>
      <h2 className="profile-name">{user?.first_name || 'Игрок'}</h2>
      <p className="profile-username">@{user?.username || 'no_username'}</p>

      <div className="card profile-stats-card">
        <div className="stat">
          <span className="stat-icon">📊</span>
          <div className="stat-text"><span>Уровень</span><strong>{user?.level || 1}</strong></div>
        </div>
        <div className="stat">
          <span className="stat-icon">🎯</span>
          <div className="stat-text"><span>Монеты</span><strong>{user ? Math.floor(user.coins).toLocaleString('ru-RU') : 0}</strong></div>
        </div>
        <div className="stat">
          <span className="stat-icon">👆</span>
          <div className="stat-text"><span>Монет за тап</span><strong>{cpt > Math.floor(cpt) ? `+${cpt}` : `+${Math.floor(cpt)}`}</strong></div>
        </div>
        <div className="stat">
          <span className="stat-icon">⚡</span>
          <div className="stat-text"><span>Энергия</span><strong>{user?.energy || 0} / {user?.maxEnergy || 0}</strong></div>
        </div>
        <div className="stat">
          <span className="stat-icon">🔋</span>
          <div className="stat-text"><span>Регенерация</span><strong>{user?.energyRegen || 1}/сек</strong></div>
        </div>
        <div className="stat">
          <span className="stat-icon">⚔️</span>
          <div className="stat-text"><span>Сила улучшений</span><strong>{totalPower}</strong></div>
        </div>
      </div>

      <div className="xp-bar">
        <div className="xp-bar-fill" style={{ width: `${xpProgress}%` }} />
        <span>XP: {user?.xp || 0} / {xpForLevel}</span>
      </div>

      <div className="card upgrade-count">
        <h3>📈 Улучшения</h3>
        <p>Всего уровней: <strong>{userUpgrades.reduce((s, u) => s + u.level, 0)}</strong></p>
      </div>
    </div>
  );
}