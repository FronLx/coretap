import React, { useState } from 'react';
import './ReferralScreen.css';

const API_URL = import.meta.env.VITE_API_URL || '';
const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'coretapbot';

export default function ReferralScreen({ user }) {
  const [copied, setCopied] = useState(false);
  const [referrals, setReferrals] = useState(0);

  const referralLink = `https://t.me/${BOT_USERNAME}?start=ref_${user?.telegram_id || ''}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  const share = () => {
    if (window.Telegram?.WebApp?.openTelegramLink) {
      const shareText = `Присоединяйся к CoreTap! Лучшая тапалка заработает для тебя монеты! 🪙 ${referralLink}`;
      window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`);
    } else {
      copyLink();
    }
  };

  return (
    <div className="referral-screen">
      <h2 className="referral-title">👥 Реферальная система</h2>
      <p className="referral-subtitle">
        Пригласи друзей и получай <strong>5000 монет</strong> за каждого!
      </p>

      <div className="referral-stats">
        <div className="referral-stat">
          <span>Приглашено</span>
          <strong>{user?.refCount || 0} 👤</strong>
        </div>
        <div className="referral-stat">
          <span>Заработано</span>
          <strong>{(user?.refCount || 0) * 5000} 🪙</strong>
        </div>
      </div>

      <div className="referral-link-box">
        <p className="referral-link-label">Твоя реферальная ссылка:</p>
        <div className="referral-link">
          <span className="referral-link-text">{referralLink}</span>
          <button className="copy-btn" onClick={copyLink}>
            {copied ? '✓' : '📋'}
          </button>
        </div>
      </div>

      <button className="share-btn" onClick={share}>
        📤 Поделиться с друзьями
      </button>

      <div className="referral-how">
        <h3>Как это работает?</h3>
        <ol>
          <li>Отправь ссылку другу</li>
          <li>Друг нажимает на ссылку и открывает бота</li>
          <li>Вы оба получаете бонусы!</li>
        </ol>
      </div>
    </div>
  );
}
