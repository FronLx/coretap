import React from 'react';
import './ProfileScreen.css';

export default function ProfileScreen({ user, userUpgrades }) {
  const xpForLevel = user?.level ? user.level * 100 : 100;
  const xpProgress = user ? ((user.xp % 100) / 100) * 100 : 0;

  const totalPower = userUpgrades.reduce((sum, u) => sum + (u.effect_value * u.level), 0);

  return (
    <div className="profile-screen">
      <div className="profile-avatar">
        {user?.first_name?.[0]?.toUpperCase() || '⚡'}
      </div>
      <h2 className="profile-name">{user?.first_name || 'Игрок'}</h2>
      <p className="profile-username">@{user?.username || 'no_username'}</p>

      <div className="profile-stats-card">
        <div className="stat">
          <span className="stat-icon">📊</span>
          <span>Уровень: <strong>{user?.level || 1}</strong></span>
        </div>
        <div className="stat">
          <span className="stat-icon">🎯</span>
          <span>Всего монет: <strong>{user ? Math.floor(user.coins).toLocaleString('ru-RU') : 0}</strong></span>
        </div>
        <div className="stat">
          <span className="stat-icon">⚡</span>
          <span>Энергия: <strong>{user?.energy || 0} / {user?.maxEnergy || 0}</strong></span>
        </div>
        <div className="stat">
          <span className="stat-icon">👆</span>
          <span>За тап: <strong>+{user?.coinsPerTap || 1} 🪙</strong></span>
        </div>
        <div className="stat">
          <span className="stat-icon">⚔️</span>
          <span>Сила: <strong>{totalPower}</strong></span>
        </div>
        <div className="stat">
          <span className="stat-icon">🔋</span>
          <span>Регенерация: <strong>{user?.energyRegen || 1}/сек</strong></span>
        </div>
        <div className="stat">
          <span className="stat-icon">🔥</span>
          <span>Френзи: <strong>{userUpgrades.find(u => u.effect_type === 'tap_multiplier')?.level || 0}</strong></span>
        </div>
      </div>

      <div className="xp-bar">
        <div className="xp-bar-fill" style={{ width: `${xpProgress}%` }} />
        <span>XP: {user?.xp || 0} / {xpForLevel}</span>
      </div>

      <div className="upgrade-count">
        <h3>📈 Купленные улучшения</h3>
        <p>Всего уровней: <strong>{userUpgrades.reduce((s, u) => s + u.level, 0)}</strong></p>
      </div>
    </div>
  );
}
