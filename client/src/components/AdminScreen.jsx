import React, { useState, useEffect, useCallback } from 'react';
import './AdminScreen.css';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function AdminScreen() {
  const [tab, setTab] = useState('admins');
  const [msg, setMsg] = useState('');

  const [admins, setAdmins] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [promos, setPromos] = useState([]);

  const [newAdminId, setNewAdminId] = useState('');
  const [banId, setBanId] = useState('');
  const [banReason, setBanReason] = useState('');
  const [coinsId, setCoinsId] = useState('');
  const [coinsAmount, setCoinsAmount] = useState('');

  const [promoCode, setPromoCode] = useState('');
  const [promoCoins, setPromoCoins] = useState('');
  const [promoMaxUses, setPromoMaxUses] = useState('');

  const showMsg = (text, isError = false) => {
    setMsg({ text, isError });
    setTimeout(() => setMsg(''), 3000);
  };

  const api = useCallback(async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const initData = window.Telegram?.WebApp?.initData || new URLSearchParams(window.location.hash.substring(1)).get('tgWebAppData') || '';
    const res = await fetch(`${API_URL}${path}`, { ...options, headers: { ...headers, 'X-Telegram-Init-Data': initData } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    return data;
  }, []);

  const load = useCallback(async () => {
    try {
      const [a, b, p] = await Promise.all([
        api('/api/admin/admins'),
        api('/api/admin/blacklist'),
        api('/api/admin/promos')
      ]);
      setAdmins(a.admins);
      setBlacklist(b.blacklist);
      setPromos(p.promos);
    } catch (e) { showMsg(e.message, true); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (fn, success) => {
    try {
      const d = await fn();
      if (d.admins) setAdmins(d.admins);
      if (d.blacklist) setBlacklist(d.blacklist);
      if (d.promos) setPromos(d.promos);
      showMsg(success);
      if (d === undefined) {}
    } catch (e) { showMsg(e.message, true); }
  };

  const refreshPromos = async () => {
    try {
      const p = await api('/api/admin/promos');
      setPromos(p.promos);
    } catch (e) {}
  };

  return (
    <div className="admin-screen">
      <h2 className="admin-title">🛠 Админ-панель</h2>

      <div className="admin-tabs">
        {[['admins','👑 Админы'],['blacklist','🚫 ЧС'],['coins','🪙 Монеты'],['promos','🎟 Промокоды']].map(([id,label]) => (
          <button key={id} className={`admin-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {msg && <div className={`admin-msg ${msg.isError ? 'err' : 'ok'}`}>{msg.text}</div>}

      <div className="admin-content">
        {tab === 'admins' && (
          <div className="admin-section">
            <h3>Администраторы</h3>
            <div className="admin-list">
              {admins.map(a => (
                <div className="admin-row" key={a.id}>
                  <span className="admin-row-id">TG: {a.telegram_id}</span>
                  <button className="danger-btn" disabled={String(a.telegram_id) === '8587383413'} onClick={() => doAction(() => api('/api/admin/admins/remove', { method: 'POST', body: JSON.stringify({ telegramId: a.telegram_id }) }), 'Админ удалён')}>Удалить</button>
                </div>
              ))}
            </div>
            <div className="admin-form">
              <input className="admin-input" placeholder="Telegram ID нового админа" value={newAdminId} onChange={e => setNewAdminId(e.target.value)} inputMode="numeric" />
              <button className="ok-btn" onClick={() => { if (!newAdminId) return; doAction(() => api('/api/admin/admins/add', { method: 'POST', body: JSON.stringify({ telegramId: newAdminId }) }), 'Админ добавлен'); setNewAdminId(''); }}>Добавить</button>
            </div>
          </div>
        )}

        {tab === 'blacklist' && (
          <div className="admin-section">
            <h3>Чёрный список</h3>
            <div className="admin-list">
              {blacklist.length === 0 && <p className="admin-empty">Пусто</p>}
              {blacklist.map(b => (
                <div className="admin-row" key={b.id}>
                  <span className="admin-row-id">
                    {b.username ? `@${b.username}` : b.first_name || b.telegram_id}
                    {b.reason ? <em> — {b.reason}</em> : ''}
                  </span>
                  <button className="ok-btn" onClick={() => doAction(() => api('/api/admin/blacklist/unban', { method: 'POST', body: JSON.stringify({ telegramId: b.telegram_id }) }), 'Разбанен')}>Разбанить</button>
                </div>
              ))}
            </div>
            <div className="admin-form">
              <input className="admin-input" placeholder="Telegram ID" value={banId} onChange={e => setBanId(e.target.value)} inputMode="numeric" />
              <input className="admin-input" placeholder="Причина (необязательно)" value={banReason} onChange={e => setBanReason(e.target.value)} />
              <button className="danger-btn" onClick={() => { if (!banId) return; doAction(() => api('/api/admin/blacklist/ban', { method: 'POST', body: JSON.stringify({ telegramId: banId, reason: banReason }) }), 'Забанен'); setBanId(''); setBanReason(''); }}>Забанить</button>
            </div>
          </div>
        )}

        {tab === 'coins' && (
          <div className="admin-section">
            <h3>Начислить / снять монеты</h3>
            <div className="admin-form">
              <input className="admin-input" placeholder="Telegram ID" value={coinsId} onChange={e => setCoinsId(e.target.value)} inputMode="numeric" />
              <input className="admin-input" placeholder="Количество (+ добавить, – снять)" value={coinsAmount} onChange={e => setCoinsAmount(e.target.value)} inputMode="numeric" />
              <button className="ok-btn" onClick={async () => {
                if (!coinsId || !coinsAmount) return;
                try {
                  const d = await api('/api/admin/coins', { method: 'POST', body: JSON.stringify({ telegramId: coinsId, amount: coinsAmount }) });
                  showMsg(`Готово, баланс: ${d.coins.toLocaleString('ru-RU')} 🪙`);
                  setCoinsId(''); setCoinsAmount('');
                } catch (e) { showMsg(e.message, true); }
              }}>Применить</button>
            </div>
          </div>
        )}

        {tab === 'promos' && (
          <div className="admin-section">
            <h3>Промокоды</h3>
            <div className="admin-list">
              {promos.length === 0 && <p className="admin-empty">Промокодов нет</p>}
              {promos.map(p => (
                <div className="promo-row" key={p.id}>
                  <div className="promo-info">
                    <strong>{p.code}</strong>
                    <span>{p.coins.toLocaleString('ru-RU')} 🪙 · использован {p.used_count}{p.max_uses > 0 ? `/${p.max_uses}` : ''}</span>
                    <span className={p.active ? 'badge-on' : 'badge-off'}>{p.active ? 'Активен' : 'Выключен'}</span>
                  </div>
                  <div className="promo-actions">
                    {p.active ? (
                      <button className="ghost-btn" onClick={() => doAction(() => api('/api/admin/promos/update', { method: 'POST', body: JSON.stringify({ id: p.id, active: false }) }), 'Выключен')}>Выкл.</button>
                    ) : (
                      <button className="ok-btn" onClick={() => doAction(() => api('/api/admin/promos/update', { method: 'POST', body: JSON.stringify({ id: p.id, active: true }) }), 'Включён')}>Вкл.</button>
                    )}
                    <button className="ghost-btn" onClick={() => { const v = prompt('Изменение монет (можно формат X): текущее ' + p.coins); if (v !== null) doAction(() => api('/api/admin/promos/update', { method: 'POST', body: JSON.stringify({ id: p.id, coins: Number(v) }) }), 'Обновлено'); refreshPromos(); }}>Изменить</button>
                    <button className="danger-btn" onClick={() => doAction(() => api('/api/admin/promos/delete', { method: 'POST', body: JSON.stringify({ id: p.id }) }), 'Удалён')}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
            <h3 className="admin-sub">Создать промокод</h3>
            <div className="admin-form">
              <input className="admin-input" placeholder="Код (без пробелов)" value={promoCode} onChange={e => setPromoCode(e.target.value)} />
              <input className="admin-input" placeholder="Монет" value={promoCoins} onChange={e => setPromoCoins(e.target.value)} inputMode="numeric" />
              <input className="admin-input" placeholder="Лимит активаций (0 = безлимит)" value={promoMaxUses} onChange={e => setPromoMaxUses(e.target.value)} inputMode="numeric" />
              <button className="ok-btn" onClick={async () => {
                if (!promoCode || !promoCoins) return;
                try {
                  await api('/api/admin/promos/create', { method: 'POST', body: JSON.stringify({ code: promoCode, coins: Number(promoCoins), maxUses: Number(promoMaxUses) || 0 }) });
                  showMsg('Промокод создан');
                  setPromoCode(''); setPromoCoins(''); setPromoMaxUses('');
                  refreshPromos();
                } catch (e) { showMsg(e.message, true); }
              }}>Создать</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
