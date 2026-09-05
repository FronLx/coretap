import React, { useState, useEffect } from 'react';
import './LeaderboardScreen.css';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function LeaderboardScreen() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initData = window.Telegram?.WebApp?.initData || '';
    fetch(`${API_URL}/api/leaderboard`, {
      headers: { 'X-Telegram-Init-Data': initData }
    })
      .then(r => r.json())
      .then(data => {
        setLeaderboard(data.leaderboard || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getMedal = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return index + 1;
  };

  return (
    <div className="leaderboard-screen">
      <h2 className="leaderboard-title">🏆 Топ игроков</h2>

      {loading ? (
        <p className="leaderboard-loading">Загрузка топ-игроков...</p>
      ) : (
        <div className="leaderboard-list">
          {leaderboard.length === 0 && <p>Пока нет игроков</p>}
          {leaderboard.map((player, index) => (
            <div key={player.telegram_id} className={`leaderboard-card ${index < 3 ? 'top-3' : ''}`}>
              <span className="leaderboard-rank">{getMedal(index)}</span>
              <div className="leaderboard-player">
                <span className="leaderboard-name">{player.first_name || player.username || 'Игрок'}</span>
                <span className="leaderboard-level">LVL {player.level || 1}</span>
              </div>
              <span className="leaderboard-coins">
                {Math.floor(player.coins).toLocaleString('ru-RU')} 🪙
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
