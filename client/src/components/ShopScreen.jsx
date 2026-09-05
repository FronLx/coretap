import React, { useState } from 'react';
import './ShopScreen.css';

const CATEGORIES = [
  { id: 'all', name: 'Все' },
  { id: 'energy', name: '⚡ Энергия' },
  { id: 'tap', name: '👆 Тап' },
  { id: 'passive', name: '🤖 Пассив' },
  { id: 'boost', name: '🔥 Бусты' }
];

const RARITY = { common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };

export default function ShopScreen({ user, upgrades, userUpgrades, skins, onBuyUpgrade, onBuySkin, onEquipSkin }) {
  const [section, setSection] = useState('upgrades');
  const [category, setCategory] = useState('all');

  const coins = Math.floor(user?.coins || 0);

  const filteredUpgrades = upgrades.filter(u => category === 'all' || u.category === category);

  const getLevel = (id) => {
    const found = userUpgrades.find(u => u.upgrade_id === id);
    return found ? found.level : 0;
  };

  return (
    <div className="shop-screen">
      <h2 className="screen-title">🛒 Магазин</h2>
      <p className="shop-balance">Баланс: <strong>{coins.toLocaleString('ru-RU')}</strong> 🪙</p>

      <div className="section-tabs">
        <button className={`section-tab ${section === 'upgrades' ? 'active' : ''}`} onClick={() => setSection('upgrades')}>
          ⚙️ Улучшения
        </button>
        <button className={`section-tab ${section === 'skins' ? 'active' : ''}`} onClick={() => setSection('skins')}>
          🎨 Скины
        </button>
      </div>

      {section === 'upgrades' ? (
        <>
          <div className="category-tabs">
            {CATEGORIES.map(cat => (
              <button key={cat.id} className={`category-btn ${category === cat.id ? 'active' : ''}`} onClick={() => setCategory(cat.id)}>
                {cat.name}
              </button>
            ))}
          </div>

          <div className="upgrades-list">
            {filteredUpgrades.map(upgrade => {
              const level = getLevel(upgrade.id);
              const maxed = level >= upgrade.max_level;
              const affordable = coins >= upgrade.cost;

              return (
                <div key={upgrade.id} className="card upgrade-card">
                  <div className="upgrade-icon">{upgrade.icon}</div>
                  <div className="upgrade-info">
                    <h3>{upgrade.name}</h3>
                    <p>{upgrade.description}</p>
                    <div className="upgrade-level">
                      Уровень {level}/{upgrade.max_level}
                      <div className="level-track">
                        <div className="level-fill" style={{ width: `${(level / upgrade.max_level) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                  <button
                    className={`upgrade-buy ${maxed ? 'maxed' : affordable ? 'affordable' : 'too-expensive'}`}
                    onClick={() => onBuyUpgrade(upgrade.id)}
                    disabled={maxed}
                  >
                    {maxed ? 'MAX' : `${Math.floor(upgrade.cost).toLocaleString('ru-RU')} 🪙`}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="skins-list">
          {skins.map(skin => {
            const affordable = coins >= skin.price;

            return (
              <div key={skin.id} className={`card skin-card ${skin.equipped ? 'equipped' : ''}`} style={{ '--skin': skin.color }}>
                <div className="skin-preview" style={{ borderColor: skin.color, boxShadow: `0 0 28px ${skin.color}44, inset 0 0 18px ${skin.color}22` }}>
                  <span className="skin-preview-icon">{skin.icon}</span>
                </div>
                <div className="skin-info">
                  <div className="skin-name-row">
                    <h3>{skin.name}</h3>
                    <span className={`rarity rarity-${skin.rarity}`}>{RARITY[skin.rarity]}</span>
                  </div>
                  <p className="skin-bonus">+{skin.bonus_per_tap} 🪙 к тапу</p>
                </div>
                <div className="skin-action">
                  {skin.equipped ? (
                    <span className="equipped-badge">✓ Надет</span>
                  ) : skin.owned ? (
                    <button className="btn-ghost equip-btn" onClick={() => onEquipSkin(skin.id)}>Надеть</button>
                  ) : (
                    <button
                      className={`skin-buy ${affordable ? 'affordable' : 'too-expensive'}`}
                      onClick={() => onBuySkin(skin.id)}
                      disabled={skin.price === 0}
                    >
                      {skin.price === 0 ? 'Бесплатно' : `${skin.price.toLocaleString('ru-RU')} 🪙`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}