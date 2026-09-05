import React, { useState, useEffect, useCallback, useRef } from 'react';
import TapScreen from './components/TapScreen.jsx';
import ShopScreen from './components/ShopScreen.jsx';
import ProfileScreen from './components/ProfileScreen.jsx';
import DailyScreen from './components/DailyScreen.jsx';
import ReferralScreen from './components/ReferralScreen.jsx';
import LeaderboardScreen from './components/LeaderboardScreen.jsx';
import './styles/App.css';

const TABS = {
  tap: 'tap',
  shop: 'shop',
  profile: 'profile',
  daily: 'daily',
  refer: 'refer',
  rating: 'rating'
};

const API_URL = import.meta.env.VITE_API_URL || '';

function getInitData() {
  if (window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData;
  }
  const params = new URLSearchParams(window.location.hash.substring(1) || window.location.search);
  return params.get('tgWebAppData') || '';
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': getInitData(),
    ...options.headers
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

export default function App() {
  const [activeTab, setActiveTab] = useState(TABS.tap);
  const [user, setUser] = useState(null);
  const [upgrades, setUpgrades] = useState([]);
  const [userUpgrades, setUserUpgrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [popups, setPopups] = useState([]);
  const [activeBoosts, setActiveBoosts] = useState({});
  const energyTimerRef = useRef(null);

  useEffect(() => {
    loadGame();
    return () => {
      if (energyTimerRef.current) clearInterval(energyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (user && activeBoosts.tapFrenzy) {
      const timer = setTimeout(() => {
        setActiveBoosts(prev => ({ ...prev, tapFrenzy: false }));
      }, activeBoosts.tapFrenzyDuration * 1000);
      return () => clearTimeout(timer);
    }
  }, [activeBoosts.tapFrenzy]);

  const loadGame = async () => {
    try {
      const data = await api('/api/auth', { method: 'POST', body: JSON.stringify({ initData: getInitData() }) });
      setUser(data.user);
      setUpgrades(data.upgrades);
      setUserUpgrades(data.userUpgrades);
      setLoading(false);

      startEnergyRegen(data.user.id);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const startEnergyRegen = useCallback((userId) => {
    if (energyTimerRef.current) clearInterval(energyTimerRef.current);
    energyTimerRef.current = setInterval(async () => {
      try {
        const data = await api('/api/regen', { method: 'POST', body: '{}' });
        setUser(prev => prev ? { ...prev, energy: data.energy, maxEnergy: data.maxEnergy } : prev);
      } catch (e) {}
    }, 2000);
  }, []);

  const handleTap = async (taps) => {
    if (!user) return;
    if (user.energy <= 0) return;

    try {
      const data = await api('/api/tap', {
        method: 'POST',
        body: JSON.stringify({ taps })
      });

      const frenzyActive = activeBoosts.tapFrenzy;
      const finalEarned = frenzyActive ? data.coinsEarned * 2 : data.coinsEarned;

      setUser(prev => ({
        ...prev,
        coins: data.totalCoins,
        energy: data.energy,
        xp: (prev?.xp || 0) + taps
      }));

      for (let i = 0; i < Math.min(taps, 10); i++) {
        setTimeout(() => {
          addPopup(finalEarned, i);
        }, i * 60);
      }
    } catch (e) {}
  };

  const addPopup = (amount, index) => {
    const id = Date.now() + index;
    const x = 20 + Math.random() * 200;
    const y = window.innerHeight * 0.3 + Math.random() * 150;
    setPopups(prev => [...prev, { id, amount, x, y }]);
    setTimeout(() => {
      setPopups(prev => prev.filter(p => p.id !== id));
    }, 1000 + index * 60);
  };

  const handleBuyUpgrade = async (upgradeId) => {
    try {
      const data = await api(`/api/upgrade/${upgradeId}`, { method: 'POST', body: '{}' });
      if (data.error) {
        showError(data.error);
        return;
      }
      setUser(prev => ({ ...prev, coins: data.coins }));
      setUserUpgrades(prev => {
        const existing = prev.find(u => u.upgrade_id === upgradeId);
        if (existing) {
          return prev.map(u => u.upgrade_id === upgradeId ? { ...u, level: u.level + 1 } : u);
        }
        return [...prev, data.upgrade];
      });
    } catch (e) {
      showError(e.message);
    }
  };

  const handleClaimDaily = async () => {
    try {
      const data = await api('/api/daily', { method: 'POST', body: '{}' });
      if (data.error) {
        showError(data.error);
        return;
      }
      setUser(prev => ({ ...prev, coins: data.coins }));
      return data;
    } catch (e) {
      showError(e.message);
    }
  };

  const handleFrenzy = async () => {
    try {
      const data = await api('/api/boost/tap_frenzy', { method: 'POST', body: '{}' });
      if (data.error) {
        showError(data.error);
        return;
      }
      setUser(prev => ({ ...prev, coins: data.coins }));
      setActiveBoosts({ tapFrenzy: true, tapFrenzyDuration: data.duration });
    } catch (e) {
      showError(e.message);
    }
  };

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(''), 3000);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">⚡</div>
        <h1>CoreTap</h1>
        <p>Загрузка...</p>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="error-screen">
        <h1>⚠️ CoreTap</h1>
        <p>Не удалось подключиться к серверу.</p>
        <p>{error}</p>
        <button onClick={() => { setLoading(true); loadGame(); }}>Повторить</button>
      </div>
    );
  }

  return (
    <div className="app">
      {user && (
        <div className="coin-display">
          <div className="coin-icon">🪙</div>
          <div className="coin-amount">
            {Math.floor(user.coins).toLocaleString('ru-RU')}
          </div>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {activeBoosts.tapFrenzy && (
        <div className="frenzy-banner">
          🔥 TAP FRENZY x{2} АКТИВЕН!
        </div>
      )}

      <div className="screen-container">
        {activeTab === TABS.tap && <TapScreen user={user} onTap={handleTap} booses={activeBoosts} onFrenzy={handleFrenzy} />}
        {activeTab === TABS.shop && <ShopScreen user={user} upgrades={upgrades} userUpgrades={userUpgrades} onBuy={handleBuyUpgrade} />}
        {activeTab === TABS.profile && <ProfileScreen user={user} userUpgrades={userUpgrades} />}
        {activeTab === TABS.daily && <DailyScreen user={user} onClaim={handleClaimDaily} />}
        {activeTab === TABS.refer && <ReferralScreen user={user} />}
        {activeTab === TABS.rating && <LeaderboardScreen />}
      </div>

      <div className="popup-layer">
        {popups.map(popup => (
          <div key={popup.id} className="coin-popup" style={{ left: popup.x, top: popup.y }}>
            +{Math.floor(popup.amount)}
          </div>
        ))}
      </div>

      <nav className="bottom-nav">
        <button className={`nav-btn ${activeTab === TABS.tap ? 'active' : ''}`} onClick={() => setActiveTab(TABS.tap)}>
          <span className="nav-icon">👆</span>
          <span>Тап</span>
        </button>
        <button className={`nav-btn ${activeTab === TABS.shop ? 'active' : ''}`} onClick={() => setActiveTab(TABS.shop)}>
          <span className="nav-icon">🛒</span>
          <span>Магазин</span>
        </button>
        <button className={`nav-btn ${activeTab === TABS.daily ? 'active' : ''}`} onClick={() => setActiveTab(TABS.daily)}>
          <span className="nav-icon">🎁</span>
          <span>Награды</span>
        </button>
        <button className={`nav-btn ${activeTab === TABS.refer ? 'active' : ''}`} onClick={() => setActiveTab(TABS.refer)}>
          <span className="nav-icon">👥</span>
          <span>Друзья</span>
        </button>
        <button className={`nav-btn ${activeTab === TABS.rating ? 'active' : ''}`} onClick={() => setActiveTab(TABS.rating)}>
          <span className="nav-icon">🏆</span>
          <span>Топ</span>
        </button>
        <button className={`nav-btn ${activeTab === TABS.profile ? 'active' : ''}`} onClick={() => setActiveTab(TABS.profile)}>
          <span className="nav-icon">👤</span>
          <span>Профиль</span>
        </button>
      </nav>
    </div>
  );
}
