import React, { useState, useEffect, useCallback, useRef } from 'react';
import TapScreen from './components/TapScreen.jsx';
import ShopScreen from './components/ShopScreen.jsx';
import LeaderboardScreen from './components/LeaderboardScreen.jsx';
import AdminScreen from './components/AdminScreen.jsx';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import { BoltIcon, ShopIcon, TrophyIcon, CoinIcon, ShieldIcon } from './components/Icons.jsx';
import './styles/App.css';

const TABS = { tap: 'tap', shop: 'shop', rating: 'rating', admin: 'admin' };

const API_URL = import.meta.env.VITE_API_URL || '';

function getInitData() {
  if (window.Telegram?.WebApp?.initData) return window.Telegram.WebApp.initData;
  const params = new URLSearchParams(window.location.hash.substring(1) || window.location.search);
  return params.get('tgWebAppData') || '';
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': getInitData(), ...options.headers };
  const retries = options.retries ?? 2;
  const timeout = options.timeout ?? 8000;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`${API_URL}${path}`, { ...options, headers, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const e = new Error(err.error || 'API error');
        e.blocked = !!err.blocked;
        throw e;
      }
      return res.json();
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (attempt < retries && !e.blocked) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr || new Error('API error');
}

const SYNC_MS = 1500;

function initialTab() {
  const params = new URLSearchParams(window.location.hash.substring(1) || window.location.search);
  const t = params.get('tab');
  if (t && TABS[t]) return t;
  return TABS.tap;
}

export { api };

export default function App() {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [user, setUser] = useState(null);
  const [upgrades, setUpgrades] = useState([]);
  const [userUpgrades, setUserUpgrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [display, setDisplay] = useState({ coins: 0, energy: 0 });
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeMeta, setWelcomeMeta] = useState({ firstName: '', isNew: false });

  const popupsRef = useRef([]);
  const [popups, setPopups] = useState([]);
  const tapBufRef = useRef(0);
  const displayRef = useRef({ coins: 0, energy: 0 });
  const statsRef = useRef({});
  const rafRef = useRef(null);
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
    if (user) startEnergyRegen();
    return () => clearInterval(regenTimerRef.current);
  }, [user?.id]);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  }, []);

  const startEnergyRegen = useCallback(() => {
    if (regenTimerRef.current) clearInterval(regenTimerRef.current);
    regenTimerRef.current = setInterval(() => {
      const cur = displayRef.current;
      const s = statsRef.current;
      if (cur.energy >= (s.maxEnergy || 0)) return;
      const d = { ...cur, energy: Math.min((s.maxEnergy || 0), cur.energy + (s.energyRegen || 1)) };
      displayRef.current = d;
      setDisplay(d);
    }, 1000);
  }, []);

  const loadGame = async () => {
    try {
      const data = await api('/api/auth', { method: 'POST', body: JSON.stringify({ initData: getInitData() }) });
      setUser(data.user);
      setUpgrades(data.upgrades);
      setUserUpgrades(data.userUpgrades);
      statsRef.current = {
        coinsPerTap: data.user.coinsPerTap,
        energyRegen: data.user.energyRegen || 1,
        maxEnergy: data.user.maxEnergy,
        globalMultiplier: data.user.globalMultiplier || 1,
        tapMultiplier: data.user.tapMultiplier || 1,
        luckyChance: data.user.luckyChance || 0,
        autoTap: data.user.autoTap || 0,
        frenzyActive: !!data.user.frenzyActive,
      };
      const d = { coins: data.user.coins, energy: data.user.energy };
      displayRef.current = d;
      setDisplay(d);
      setLoading(false);
      const welcomed = localStorage.getItem('coretap_welcomed_v1');
      const needWelcome = !welcomed || !!data.isNew;
      if (needWelcome) {
        setWelcomeMeta({ firstName: data.user.first_name, isNew: !!data.isNew });
        setWelcomeOpen(true);
      }
      if (data.offlineCoins > 0) showNotice(`Пока тебя не было: +${data.offlineCoins} монет (автотап)`);
    } catch (e) {
      if (e.blocked) {
        setError('Вы в черном списке. Доступ к игре ограничен.');
        setLoading(false);
        return;
      }
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
    const gained = statsRef.current.coinsPerTap * statsRef.current.globalMultiplier * (statsRef.current.tapMultiplier || 1);
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
      if (data.leveledUp) {
        setUser(prev => prev ? { ...prev, xp: data.xp, level: data.level } : prev);
        showNotice(`Уровень ${data.level}! +${data.levelReward} монет`);
      }
    } catch (e) {
      tapBufRef.current += n;
    }
  }, [showNotice]);

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
        if (ex) return prev.map(u => u.upgrade_id === upgradeId ? { ...u, level: u.level + 1 } : u);
        return [...prev, { ...data.upgrade, upgrade_id: upgradeId, level: data.newLevel || 1 }];
      });
      statsRef.current = { ...statsRef.current, ...data.stats };
      setUser(prev => prev ? { ...prev, coins: data.coins, ...data.stats } : prev);
      if (data.stats?.frenzyActive) showNotice('🔥 Tap Frenzy активен 30 сек!');
    } catch (e) { showError(e.message); }
  };

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(''), 3000);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loader-ring">
          <div className="loader-ring-inner"></div>
        </div>
        <div className="loader-coin-wrapper">
          <CoinIcon size={48} className="loader-coin" />
        </div>
        <h1 className="loader-title">CORETAP</h1>
        <div className="loader-dots">
          <span className="loader-dot"></span>
          <span className="loader-dot"></span>
          <span className="loader-dot"></span>
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="error-screen">
        <h1>CoreTap</h1>
        <p>{error}</p>
        {!error.startsWith('Вы в черном') ? (
          <button className="btn-primary" onClick={() => { setLoading(true); loadGame(); }}>Повторить</button>
        ) : (
          <button className="btn-ghost" onClick={() => setError('')}>Ок</button>
        )}
      </div>
    );
  }

  const tabDefs = [
    { id: TABS.tap, icon: <BoltIcon size={24} />, label: 'Тап' },
    { id: TABS.shop, icon: <ShopIcon size={24} />, label: 'Магазин' },
    { id: TABS.rating, icon: <TrophyIcon size={24} />, label: 'Топ' },
  ];
  if (user?.isAdmin) tabDefs.push({ id: TABS.admin, icon: <ShieldIcon size={24} />, label: 'Админ' });

  return (
    <div className="app">
      <div className="coin-display">
        <CoinIcon size={30} className="coin-icon" />
        <span className="coin-amount">{Math.floor(display.coins).toLocaleString('ru-RU')}</span>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <div className="screen-container">
        {activeTab === TABS.tap && (
          <TapScreen
            display={display}
            stats={statsRef.current}
            user={user}
            onTap={handleTap}
          />
        )}
        {activeTab === TABS.shop && (
          <ShopScreen
            user={{ ...user, coins: display.coins }}
            upgrades={upgrades}
            userUpgrades={userUpgrades}
            onBuyUpgrade={handleBuyUpgrade}
          />
        )}
        {activeTab === TABS.rating && <LeaderboardScreen />}
        {activeTab === TABS.admin && user?.isAdmin && <AdminScreen showNotice={showNotice} />}
      </div>

      <div className="popup-layer">
        {popups.map(p => (
          <div key={p.id} className="coin-popup" style={{ left: p.x, top: p.y }}>
            +{Math.floor(p.amount)}
          </div>
        ))}
      </div>

      <nav className="bottom-nav">
        {tabDefs.map(tab => (
          <button key={tab.id} className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            <span className="nav-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {welcomeOpen && (
        <WelcomeScreen
          firstName={welcomeMeta.firstName}
          isNew={welcomeMeta.isNew}
          onStart={() => {
            localStorage.setItem('coretap_welcomed_v1', '1');
            setWelcomeOpen(false);
          }}
        />
      )}
    </div>
  );
}
