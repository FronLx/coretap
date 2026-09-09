import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../App.jsx';
import { ShieldIcon, CoinIcon, UsersIcon, CloseIcon, TrophyIcon } from './Icons.jsx';
import { Emoji } from './Emoji.jsx';
import './AdminScreen.css';

function CoinModal({ title, placeholder, confirmLabel, onConfirm, onClose }) {
  const [value, setValue] = useState(placeholder || '');

  const submit = () => {
    const amount = parseInt(value);
    if (isNaN(amount) || amount === 0) return;
    onConfirm(amount);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><CloseIcon size={18} /></button>
        <h2 className="modal-title">{title}</h2>
        <input
          className="admin-input"
          type="number"
          value={value}
          autoFocus
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={submit}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminScreen({ showNotice }) {
  const [tab, setTab] = useState('users');
  const [stats, setStats] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [myTg, setMyTg] = useState(0);
  const [loggedIn, setLoggedIn] = useState(false);

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [busy, setBusy] = useState(false);

  const [logs, setLogs] = useState([]);
  const [modal, setModal] = useState(null);

  const loadStats = useCallback(async () => {
    try {
      const data = await api('/api/admin/stats');
      setStats(data.stats);
      setAdmins(data.admins);
      const me = await api('/api/admin/me');
      setMyTg(Number(localStorage.getItem('coretap_me') || 0));
    } catch (e) {}
    try {
      const initData = (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe) || null;
      if (initData?.user?.id) {
        setMyTg(initData.user.id);
        localStorage.setItem('coretap_me', String(initData.user.id));
      }
    } catch (e) {}
  }, []);

  const loadUsers = useCallback(async (q, offset) => {
    try {
      setBusy(true);
      const data = await api(`/api/admin/users?q=${encodeURIComponent(q || '')}&offset=${offset || 0}&limit=30`);
      setUsers(data.rows || []);
      setTotal(data.total || 0);
    } catch (e) {
      showNotice('Ошибка загрузки: ' + e.message);
    } finally {
      setBusy(false);
    }
  }, [showNotice]);

  const loadLogs = useCallback(async () => {
    try {
      const data = await api('/api/admin/logs?limit=60');
      setLogs(data.logs || []);
    } catch (e) {}
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (tab === 'users' && !loggedIn) {
      loadUsers('');
      setLoggedIn(true);
    }
  }, [tab, loggedIn, loadUsers]);

  useEffect(() => {
    if (tab === 'logs') loadLogs();
  }, [tab, loadLogs]);

  const doAction = async (path, body, reload = true) => {
    try {
      const data = await api(path, { method: 'POST', body: JSON.stringify(body || {}) });
      if (data.error) { showNotice(data.error); return; }
      showNotice('Готово');
      if (reload) {
        loadStats();
        loadUsers(query);
      }
    } catch (e) {
      showNotice(e.message);
    }
  };

  const coinAction = (u, amount) => {
    doAction(`/api/admin/users/${u.telegram_id}/coins`, { amount });
    setModal(null);
  };

  const resetMyStats = async () => {
    setModal(null);
    try {
      const data = await api('/api/admin/reset-me', { method: 'POST', body: JSON.stringify({}) });
      if (data.error) { showNotice(data.error); return; }
      showNotice('Твоя статистика сброшена');
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      showNotice(e.message);
    }
  };

  const actionLabel = {
    coins: 'Монеты',
    block: 'В ЧС',
    unblock: 'Из ЧС',
    grant_admin: 'Админ',
    revoke_admin: 'Снять',
    reset: 'Сброс',
    set_level: 'Уровень',
    daily_claim: 'Дневная',
  };

  const renderUsers = () => (
    <div className="admin-users">
      <div className="search-row">
        <input
          className="admin-input"
          placeholder="Поиск: имя, юзернейм, Telegram ID"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setQuery(searchInput); loadUsers(searchInput); } }}
        />
        <button className="btn-ghost" onClick={() => { setQuery(searchInput); loadUsers(searchInput); }}>Поиск</button>
      </div>
      <p className="admin-hint">Найдено: {total}</p>

      {busy && <p className="admin-hint">Загрузка...</p>}

      <div className="admin-list">
        {!busy && users.length === 0 && <p className="admin-hint">Игроки не найдены</p>}
        {users.map(u => {
          const isProtAdmin = admins.some(a => a.telegram_id === u.telegram_id && a.can_remove === 0);
          const isAdminRow = admins.some(a => a.telegram_id === u.telegram_id);
          return (
            <div key={u.telegram_id} className={`admin-user-card ${u.blocked ? 'blocked' : ''}`}>
              <div className="au-info">
                <div className="au-name">
                  {u.first_name || u.username || `#${u.telegram_id}`}
                  {u.blocked && <span className="tag tag-danger">ЧС</span>}
                  {isProtAdmin && <span className="tag tag-prot">Владелец</span>}
                  {isAdminRow && !isProtAdmin && <span className="tag tag-admin">Админ</span>}
                  <span className="au-id">ID {u.telegram_id}</span>
                </div>
                <div className="au-meta">
                  <span><CoinIcon size={13} /> {Math.floor(u.coins).toLocaleString('ru-RU')}</span>
                  <span>LVL {u.level}</span>
                  <span>👆 {u.total_taps}</span>
                  <span>👥 {u.referrals || 0}</span>
                </div>
              </div>
              <div className="au-actions">
                <button className="mini-btn ok" onClick={() => setModal({ type: 'coins', user: u, sign: 1 })}>+</button>
                <button className="mini-btn warn" onClick={() => setModal({ type: 'coins', user: u, sign: -1 })}>−</button>
                {u.blocked ? (
                  <button className="mini-btn ok" onClick={() => doAction(`/api/admin/users/${u.telegram_id}/unblock`)}>Разбанить</button>
                ) : (
                  <button className="mini-btn danger" disabled={isAdminRow} onClick={() => doAction(`/api/admin/users/${u.telegram_id}/block`)}>В ЧС</button>
                )}
                {isProtAdmin ? (
                  <button className="mini-btn" disabled>Неудаляемый</button>
                ) : isAdminRow ? (
                  <button className="mini-btn warn" onClick={() => doAction(`/api/admin/users/${u.telegram_id}/remove-admin`)}>Снять</button>
                ) : (
                  <button className="mini-btn blue" onClick={() => doAction(`/api/admin/users/${u.telegram_id}/admin`, {})}>Админ</button>
                )}
                {!isAdminRow && (
                  <button className="mini-btn" onClick={() => setModal({ type: 'level', user: u })}>Уровень</button>
                )}
                {!isAdminRow && (
                  <button className="mini-btn danger" onClick={() => setModal({ type: 'reset', user: u })}>Сброс</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderAdmins = () => (
    <div className="admin-list">
      {admins.map(a => {
        const isMe = myTg && a.telegram_id === myTg;
        return (
          <div key={a.telegram_id} className="admin-user-card">
            <div className="au-info">
              <div className="au-name">
                {a.first_name || a.username || `#${a.telegram_id}`}
                {a.can_remove === 0 ? <span className="tag tag-prot">Владелец</span> : <span className="tag tag-admin">Админ</span>}
                {isMe && <span className="tag tag-blue">Ты</span>}
                <span className="au-id">ID {a.telegram_id}</span>
              </div>
              <div className="au-meta">
                <span>Назначил: #{a.added_by || 0}</span>
                <span>{a.created_at}</span>
              </div>
            </div>
            <div className="au-actions">
              {a.telegram_id !== myTg && a.can_remove === 1 && (
                <button className="mini-btn warn" onClick={() => doAction(`/api/admin/users/${a.telegram_id}/remove-admin`)}>Снять</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderLogs = () => (
    <div className="admin-list">
      {logs.length === 0 && <p className="admin-hint">Логов пока нет</p>}
      {logs.map(l => (
        <div key={l.id} className="admin-log-row">
          <span className="au-id">{l.created_at}</span>
          <span className={`tag ${l.action === 'block' ? 'tag-danger' : l.action === 'coins' ? 'tag-admin' : 'tag-border'}`}>
            {actionLabel[l.action] || l.action}
          </span>
          <span className="au-id">#{l.target_tg}{l.first_name ? ' · ' + l.first_name : ''}</span>
          <span className="au-id">{l.detail}</span>
          <span className="au-id">админ #{l.admin_tg}</span>
        </div>
      ))}
    </div>
  );

  if (!admins.some(a => a.can_remove === 0) && stats === null) {
    return <div className="admin-screen"><p className="admin-hint">Загрузка...</p></div>;
  }

  const statItems = stats
    ? [
        { label: 'Игроки', value: stats.users, icon: <UsersIcon size={16} /> },
        { label: 'Монет в игре', value: Math.floor(stats.coins).toLocaleString('ru-RU'), icon: <CoinIcon size={16} /> },
        { label: 'В ЧС', value: stats.blocked, icon: <ShieldIcon size={16} /> },
        { label: 'Админы', value: stats.admins, icon: <ShieldIcon size={16} /> },
        { label: 'Всего тапов', value: Math.floor(stats.taps).toLocaleString('ru-RU'), icon: <TrophyIcon size={16} /> },
      ]
    : [];

  return (
    <div className="admin-screen">
      <h2 className="screen-title admin-title"><ShieldIcon size={20} className="screen-title-icon" /> Админ панель</h2>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>Игроки</button>
        <button className={`admin-tab ${tab === 'admins' ? 'active' : ''}`} onClick={() => setTab('admins')}>Админы</button>
        <button className={`admin-tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>Логи</button>
      </div>

      {tab === 'users' && !stats && <div className="admin-list"><p className="admin-hint">Загрузка...</p></div>}

      <div className="admin-actions">
        <button className="admin-action admin-action-danger" onClick={() => setModal({ type: 'resetMe' })}>
          <span className="admin-action-icon"><Emoji>🔄</Emoji></span>
          <span><b>Сбросить свою статистику</b><em>только для тебя</em></span>
        </button>
      </div>

      <div className="admin-stats">
        {statItems.map((s, i) => (
          <div key={i} className="admin-stat-card">
            <span className="as-icon">{s.icon}</span>
            <span className="as-value">{s.value}</span>
            <span className="as-label">{s.label}</span>
          </div>
        ))}
      </div>

      {tab === 'users' && renderUsers()}
      {tab === 'admins' && renderAdmins()}
      {tab === 'logs' && renderLogs()}

      {modal?.type === 'coins' && (
        <CoinModal
          title={`${modal.sign > 0 ? 'Выдать' : 'Снять'} монеты · ${modal.user.first_name || '#' + modal.user.telegram_id}`}
          placeholder={String(modal.sign > 0 ? 1000 : 100)}
          confirmLabel={modal.sign > 0 ? 'Выдать' : 'Снять'}
          onConfirm={amount => coinAction(modal.user, modal.sign > 0 ? amount : -amount)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'level' && (
        <CoinModal
          title={`Уровень · XP игрока #${modal.user.telegram_id}`}
          placeholder={String(modal.user.xp)}
          confirmLabel="Сохранить"
          onConfirm={xp => { doAction(`/api/admin/users/${modal.user.telegram_id}/level`, { xp }); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'reset' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)}><CloseIcon size={18} /></button>
            <h2 className="modal-title">Сбросить игрока?</h2>
            <p className="modal-sub">Монеты, уровень и все улучшения #<b>{modal.user.telegram_id}</b> будут обнулены.</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setModal(null)}>Отмена</button>
              <button className="btn-danger" onClick={() => { doAction(`/api/admin/users/${modal.user.telegram_id}/reset`); setModal(null); }}>Сбросить</button>
            </div>
          </div>
        </div>
      )}
      {modal?.type === 'resetMe' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)}><CloseIcon size={18} /></button>
            <h2 className="modal-title">Сбросить свою статистику?</h2>
            <p className="modal-sub">Обнулятся <b>монеты, уровень, тапы и все улучшения</b> твоего аккаунта. Отменить это будет нельзя.</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setModal(null)}>Отмена</button>
              <button className="btn-danger" onClick={resetMyStats}>Сбросить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}