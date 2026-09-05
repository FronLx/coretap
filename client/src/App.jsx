import React, { useState, useEffect, useCallback, useRef } from 'react';
import TapScreen from './components/TapScreen.jsx';
import ShopScreen from './components/ShopScreen.jsx';
import ProfileScreen from './components/ProfileScreen.jsx';
import DailyScreen from './components/DailyScreen.jsx';
import ReferralScreen from './components/ReferralScreen.jsx';
import LeaderboardScreen from './components/LeaderboardScreen.jsx';
import './styles/App.css';

const TABS = { tap: 'tap', shop: 'shop', profile: 'profile', daily: 'daily', refer: 'refer', rating: 'rating' };

const API_URL = import.meta.env.VITE_API_URL || '';

function getInitData() {
  if (window.Telegram?.WebApp?.initData) return window.Telegram.WebApp.initData;
  const params = new URLSearchParams(window.location.hash.substring(1) || window.location.search);
  return params.get('tgWebAppData') || '';
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': getInitData(), ...options.headers };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

const SYNC_MS = 1500;

export default function App() {
  const [activeTab, setActiveTab] = useState(TABS.tap);
  const [user, setUser] = useState(null);
  const [upgrades, setUpgrades] = useState([]);
  const [userUpgrades, setUserUpgrades] = useState([]);
  const [skins, setSkins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeBoosts, setActiveBoosts] = useState({});
  const [display, setDisplay] = useState({ coins: 0, energy: 0 });

  const popupsRef = useRef([]);
  const [popups, setPopups] = useState([]);
  const tapBufRef = useRef(0);
  const displayRef = useRef({ coins: 0, energy: 0 });
  const statsRef = useRef({});
  const rafRef = useRef(null);
  const frenzyRef = useRef(false);
  const regenTimerRef = useRef(null);

  useEffect(() => {
    loadGame();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); flushTaps(); };
  }, []);

  useEffect(() => {
    const iv = setInterval(syncTaps, SYNC_MS);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const syncOnHide = () => { if (document.visibilityState === 'hidden') flushTaps(); };
    document.addEventListener('visibilitychange', syncOnHide);
    window.addEventListener('beforeunload', flushTaps);
    return () => {
      document.removeEventListener('visibilitychange', syncOnHide);
      window.removeEventListener('beforeunload', flushTaps);
    };
  }, []);

  useEffect(() => {
    if (activeBoosts.tapFrenzy) {
      frenzyRef.current = true;
      const t = setTimeout(() => {
        frenzyRef.current = false;
        setActiveBoosts(prev => ({ ...prev, tapFrenzy: false }));
      }, activeBoosts.tapFrenzyDuration * 1000);
      return () => clearTimeout(t);
    }
  }, [activeBoosts.tapFrenzy, activeBoosts.tapFrenzyDuration]);

  useEffect(() => {
    if (user) {
      startEnergyRegen();
    }
    return () => clearInterval(regenTimerRef.current);
  }, [user?.id]);

  const startEnergyRegen = useCallback(() => {
    if (regenTimerRef.current) clearInterval(regenTimerRef.current);
    regenTimerRef.current = setInterval(async () => {
      try {
        const data = await api('/api/regen', { method: 'POST', body: '{}' });
        const d = { ...displayRef.current, energy: data.energy };
        displayRef.current = d;
        setDisplay(d);
      } catch (e) {}
    }, 2000);
  }, []);

  const loadGame = async () => {
    try {
      const data = await api('/api/auth', { method: 'POST', body: JSON.stringify({ initData: getInitData() }) });
      setUser(data.user);
      setUpgrades(data.upgrades);
      setUserUpgrades(data.userUpgrades);
      setSkins(data.skins || []);
      statsRef.current = {
        coinsPerTap: data.user.coinsPerTap,
        energyRegen: data.user.energyRegen || 1,
        maxEnergy: data.user.maxEnergy,
        globalMultiplier: data.user.globalMultiplier || 1
      };
      const d = { coins: data.user.coins, energy: data.user.energy };
      displayRef.current = d;
      setDisplay(d);
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const pushPopups = (amount) => {
    const now = Date.now();
    const popped = popupsRef.current.filter(p => now - p.ts < 900);
    if (popped.length > 8) return;
    const p = { id: now + Math.random(), ts: now, x: 15 + Math.random() * 190, y: window.innerHeight * 0.26 + Math.random() * 120, amount };
    popped.push(p);
    popupsRef.current = popped;
    setPopups(popped);
  };

  const handleTap = useCallback(() => {
    const cur = displayRef.current;
    if (cur.energy <= 0) return;
    const multi = frenzyRef.current ? 2 : 1;
    const gained = statsRef.current.coinsPerTap * statsRef.current.globalMultiplier * multi;
    const d = { coins: cur.coins + gained, energy: cur.energy - 1 };
    displayRef.current = d;
    tapBufRef.current += 1;
    pushPopups(gained);
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setDisplay(displayRef.current);
      });
    }
  }, []);

  const syncTaps = useCallback(async () => {
    const n = tapBufRef.current;
    if (n <= 0) return;
    tapBufRef.current = 0;
    try {
      const data = await api('/api/tap', { method: 'POST', body: JSON.stringify({ taps: n }) });
      const d = { coins: data.totalCoins, energy: data.energy };
      displayRef.current = d;
      setDisplay(d);
      if (data.stats) statsRef.current = { ...statsRef.current, ...data.stats };
      const addedXp = n;
      setUser(prev => prev ? { ...prev, xp: (prev.xp || 0) + addedXp } : prev);
    } catch (e) {
      tapBufRef.current += n;
    }
  }, []);

  const flushTaps = useCallback(() => {
    const n = tapBufRef.current;
    if (n <= 0) return;
    tapBufRef.current = 0;
    fetch(`${API_URL}/api/tap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': getInitData() },
      body: JSON.stringify({ taps: n }),
      keepalive: true
    }).catch(() => {});
  }, []);

  const handleBuyUpgrade = async (upgradeId) => {
    try {
      const data = await api(`/api/upgrade/${upgradeId}`, { method: 'POST', body: '{}' });
      if (data.error) { showError(data.error); return; }
      const d = { ...displayRef.current, coins: data.coins };
      displayRef.current = d;
      setDisplay(d);
      setUserUpgrades(prev => {
        const ex = prev.find(u => u.upgrade_id === upgradeId);
        return ex ? prev.map(u => u.upgrade_id === upgradeId ? { ...u, level: u.level + 1 } : u) : [...prev, data.upgrade];
      });
      statsRef.current = { ...statsRef.current, ...data.stats };
      setUser(prev => prev ? { ...prev, coins: data.coins, ...data.stats } : prev);
    } catch (e) { showError(e.message); }
  };

  const handleBuySkin = async (skinId) => {
    try {
      const data = await api(`/api/skins/${skinId}/buy`, { method: 'POST', body: '{}' });
      if (data.error) { showError(data.error); return; }
      const d = { ...displayRef.current, coins: data.coins };
      displayRef.current = d;
      setDisplay(d);
      setSkins(data.skins);
      setUser(prev => prev ? { ...prev, coins: data.coins } : prev);
    } catch (e) { showError(e.message); }
  };

  const handleEquipSkin = async (skinId) => {
    try {
      const data = await api(`/api/skins/${skinId}/equip`, { method: 'POST', body: '{}' });
      if (data.error) { showError(data.error); return; }
      setSkins(data.skins);
      statsRef.current = { ...statsRef.current, coinsPerTap: data.coinsPerTap };
      setUser(prev => prev ? { ...prev, coinsPerTap: data.coinsPerTap } : prev);
    } catch (e) { showError(e.message); }
  };

  const handleClaimDaily = async () => {
    try {
      const data = await api('/api/daily', { method: 'POST', body: '{}' });
      if (data.error) { showError(data.error); return; }
      const d = { ...displayRef.current, coins: data.coins };
      displayRef.current = d;
      setDisplay(d);
      setUser(prev => prev ? { ...prev, coins: data.coins, daily_streak: data.streak } : prev);
      return data;
    } catch (e) { showError(e.message); }
  };

  const handleFrenzy = async () => {
    try {
      const data = await api('/api/boost/tap_frenzy', { method: 'POST', body: '{}' });
      if (data.error) { showError(data.error); return; }
      const d = { ...displayRef.current, coins: data.coins };
      displayRef.current = d;
      setDisplay(d);
      setUser(prev => prev ? { ...prev, coins: data.coins } : prev);
      setActiveBoosts({ tapFrenzy: true, tapFrenzyDuration: data.duration });
    } catch (e) { showError(e.message); }
  };

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(''), 3000);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">🪙</div>
        <h1>CORETAP</h1>
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
        <button className="btn-primary" onClick={() => { setLoading(true); loadGame(); }}>Повторить</button>
      </div>
    );
  }

  const equippedSkin = (skins || []).find(s => s.equipped) || skins?.[0];

  return (
    <div className="app">
      <div className="coin-display">
        <span className="coin-icon">🪙</span>
        <span className="coin-amount">{Math.floor(display.coins).toLocaleString('ru-RU')}</span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {activeBoosts.tapFrenzy && (
        <div className="frenzy-banner">🔥 TAP FRENZY ×2 — АКТИВЕН!</div>
      )}

      <div className="screen-container">
        {activeTab === TABS.tap && (
          <TapScreen
            display={display}
            stats={statsRef.current}
            equippedSkin={equippedSkin}
            onTap={handleTap}
            frenzy={activeBoosts.tapFrenzy}
            onFrenzy={handleFrenzy}
          />
        )}
        {activeTab === TABS.shop && (
          <ShopScreen
            user={{ ...user, coins: display.coins }}
            upgrades={upgrades}
            userUpgrades={userUpgrades}
            skins={skins}
            onBuyUpgrade={handleBuyUpgrade}
            onBuySkin={handleBuySkin}
            onEquipSkin={handleEquipSkin}
          />
        )}
        {activeTab === TABS.profile && <ProfileScreen user={{ ...user, coins: display.coins }} userUpgrades={userUpgrades} />}
        {activeTab === TABS.daily && <DailyScreen user={user} onClaim={handleClaimDaily} />}
        {activeTab === TABS.refer && <ReferralScreen user={user} />}
        {activeTab === TABS.rating && <LeaderboardScreen />}
      </div>

      <div className="popup-layer">
        {popups.map(p => (
          <div key={p.id} className="coin-popup" style={{ left: p.x, top: p.y }}>
            +{Math.floor(p.amount)}
          </div>
        ))}
      </div>

      <nav className="bottom-nav">
        {[
          { id: TABS.tap, icon: '👆', label: 'Тап' },
          { id: TABS.shop, icon: '🛒', label: 'Магазин' },
          { id: TABS.daily, icon: '🎁', label: 'Награды' },
          { id: TABS.refer, icon: '👥', label: 'Друзья' },
          { id: TABS.rating, icon: '🏆', label: 'Топ' },
          { id: TABS.profile, icon: '👤', label: 'Профиль' }
        ].map(tab => (
          <button key={tab.id} className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            <span className="nav-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}