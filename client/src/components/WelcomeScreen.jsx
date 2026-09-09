import React, { useState, useEffect } from 'react';
import { CoinIcon, BoltIcon } from './Icons.jsx';
import { Emoji } from './Emoji.jsx';
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
            <Emoji>{e}</Emoji>
          </span>
        ))}
      </div>

      <div className="welcome-card">
        <div className="welcome-coin-wrap">
          <div className="welcome-coin-ring">
            <CoinIcon size={92} className="welcome-coin" />
          </div>
          <span className="welcome-coin-emoji"><Emoji>🪙</Emoji></span>
        </div>

        <h1 className="welcome-title">CoreTap</h1>
        <p className="welcome-greeting">
          {firstName ? (isNew ? `Добро пожаловать, ${firstName}!` : `С возвращением, ${firstName}!`) : 'Добро пожаловать!'}
        </p>
        <p className="welcome-sub">Что нужно знать 👇</p>

        <div className="welcome-features">
          <div className="welcome-feature"><span className="wf-emoji"><Emoji>👆</Emoji></span><div><b>Тапай</b><em>каждый тап = монеты</em></div></div>
          <div className="welcome-feature"><span className="wf-emoji"><Emoji>⚡️</Emoji></span><div><b>Энергия</b><em>регенится сама</em></div></div>
          <div className="welcome-feature"><span className="wf-emoji"><Emoji>🛒</Emoji></span><div><b>Магазин</b><em>6 апгрейдов</em></div></div>
          <div className="welcome-feature"><span className="wf-emoji"><Emoji>👹</Emoji></span><div><b>Общий босс</b><em>бей вместе со всеми — забирай награду</em></div></div>
        </div>

        <button className="welcome-start btn-primary" onClick={start}>
          <BoltIcon size={20} /> Старт!
        </button>
      </div>
    </div>
  );
}