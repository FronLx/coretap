import React, { useState, useEffect } from 'react';
import { CoinIcon, BoltIcon, UsersIcon, GiftIcon } from './Icons.jsx';
import './WelcomeScreen.css';

const PREMIUM_EMOJIS = ['✨', '🚀', '💎', '⚡', '🔥', '🪙', '👑', '🌟', '🤖', '💥'];

export default function WelcomeScreen({ firstName, isNew, onStart }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const el = document.querySelector('.welcome-card');
      if (el) el.classList.add('welcome-card-in');
    }, 100);
    return () => clearTimeout(t);
  }, []);

  const start = () => {
    setLeaving(true);
    setTimeout(onStart, 450);
  };

  return (
    <div className={`welcome-screen ${leaving ? 'welcome-leaving' : ''}`}>
      <div className="welcome-bg"></div>
      <div className="welcome-orbs">
        <span className="orb orb-1"></span>
        <span className="orb orb-2"></span>
        <span className="orb orb-3"></span>
      </div>
      <div className="welcome-sparkles">
        {PREMIUM_EMOJIS.map((e, i) => (
          <span key={i} className="welcome-emoji" style={{ left: `${7 + (i * 12.5) % 85}%`, top: `${12 + (i * 17) % 60}%`, animationDelay: `${i * 0.35}s` }}>
            {e}
          </span>
        ))}
      </div>

      <div className="welcome-card">
        <div className="welcome-coin-wrap">
          <div className="welcome-coin-ring">
            <CoinIcon size={92} className="welcome-coin" />
          </div>
          <span className="welcome-coin-emoji">🪙</span>
        </div>

        <h1 className="welcome-title">CoreTap</h1>
        <p className="welcome-greeting">
          {isNew
            ? (firstName ? `С возвращением в игру, ${firstName}!` : 'Добро пожаловать!')
            : (firstName ? `Привет, ${firstName}!` : 'Привет!')}
        </p>
        <p className="welcome-sub">Всё, что нужно знать:</p>

        <div className="welcome-features">
          <div className="welcome-feature"><span className="wf-emoji">👆</span><div><b>Тапай</b><em>+1 к энергии, каждый тап — коины!</em></div></div>
          <div className="welcome-feature"><span className="wf-emoji">⚡</span><div><b>Энергия</b><em>регенится сама, следи за шкалой</em></div></div>
          <div className="welcome-feature"><span className="wf-emoji">🛒</span><div><b>Магазин</b><em>8 апгрейдов — от Frenzy до Auto Tapper</em></div></div>
          <div className="welcome-feature"><span className="wf-emoji">👥</span><div><b>Друзья</b><em>+1000 монет за каждого друга!</em></div></div>
        </div>

        <button className="welcome-start btn-primary" onClick={start}>
          <BoltIcon size={20} /> Старт!
        </button>
      </div>
    </div>
  );
}