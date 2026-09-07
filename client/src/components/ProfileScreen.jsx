import React, { useState } from 'react';
import './ProfileScreen.css';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function ProfileScreen({ user, userUpgrades, isPremium }) {
  const xpForLevel = user?.level ? user.level * 100 : 100;
  const xpProgress = user ? Math.min(((user.xp % 100) / 100) * 100, 100) : 0;
  const totalPower = userUpgrades.reduce((sum, u) => sum + (u.effect_value * u.level), 0);
  const cpt = user?.coinsPerTap || 1;

  const [promoCode, setPromoCode] = useState('');
  const [promoMsg, setPromoMsg] = useState('');

  const redeemPromo = async () => {
    if (!promoCode) return;
    setPromoMsg('');
    try {
      const initData = window.Telegram?.WebApp?.initData || new URLSearchParams(window.location.hash.substring(1)).get('tgWebAppData') || '';
      const res = await fetch(`${API_URL}/api/promo/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
        body: JSON.stringify({ code: promoCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      setPromoMsg(`+${data.coins.toLocaleString('ru-RU')} 🪙`);
      setPromoCode('');
    } catch (e) {
      setPromoMsg(e.message);
    }
    setTimeout(() => setPromoMsg(''), 3000);
  };

  return (
    <div className="profile-screen">
      <div className="profile-avatar">
        {user?.first_name?.[0]?.toUpperCase() || '⚡'}
        {isPremium && <span className="premium-badge">⭐</span>}
      </div>
      <h2 className="profile-name">{user?.first_name || 'Игрок'}{isPremium && <span className="premium-tag">PREMIUM</span>}</h2>
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

      <div className="card promo-card">
        <h3>🎟 Промокод</h3>
        <div className="promo-input-row">
          <input
            className="promo-input"
            placeholder="Введи код"
            value={promoCode}
            onChange={e => setPromoCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') redeemPromo(); }}
          />
          <button className="promo-btn" onClick={redeemPromo}>Активировать</button>
        </div>
        {promoMsg && <p className={`promo-msg ${promoMsg.includes('🪙') ? 'ok' : 'err'}`}>{promoMsg}</p>}
      </div>
    </div>
  );
}