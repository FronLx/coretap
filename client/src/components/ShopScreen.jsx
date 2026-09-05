import React, { useState } from 'react';
import './ShopScreen.css';

export default function ShopScreen({ user, upgrades, userUpgrades, onBuy }) {
  const [category, setCategory] = useState('all');

  const categories = [
    { id: 'all', name: 'Все' },
    { id: 'energy', name: '⚡ Энергия' },
    { id: 'tap', name: '👆 Тап' },
    { id: 'passive', name: '🤖 Пассив' },
    { id: 'boost', name: '🔥 Бусты' }
  ];

  const filtered = upgrades.filter(u => category === 'all' || u.category === category);

  const getLevel = (upgradeId) => {
    const found = userUpgrades.find(u => u.upgrade_id === upgradeId);
    return found ? found.level : 0;
  };

  return (
    <div className="shop-screen">
      <h2 className="shop-title">🛒 Магазин улучшений</h2>
      <p className="shop-balance">Баланс: {user?.coins ? Math.floor(user.coins).toLocaleString('ru-RU') : 0} 🪙</p>

      <div className="category-tabs">
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`category-btn ${category === cat.id ? 'active' : ''}`}
            onClick={() => setCategory(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="upgrades-list">
        {filtered.map(upgrade => {
          const level = getLevel(upgrade.id);
          const maxed = level >= upgrade.max_level;
          const affordable = user?.coins >= upgrade.cost;

          return (
            <div key={upgrade.id} className="upgrade-card">
              <div className="upgrade-icon">{upgrade.icon}</div>
              <div className="upgrade-info">
                <h3>{upgrade.name}</h3>
                <p>{upgrade.description}</p>
                <div className="upgrade-level">
                  Уровень: {level} / {upgrade.max_level}
                </div>
              </div>
              <button
                className={`upgrade-buy ${maxed ? 'maxed' : affordable ? 'affordable' : 'too-expensive'}`}
                onClick={() => onBuy(upgrade.id)}
                disabled={maxed}
              >
                {maxed ? 'MAX' : `${Math.floor(upgrade.cost).toLocaleString('ru-RU')} 🪙`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
