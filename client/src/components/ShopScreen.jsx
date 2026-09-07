import React from 'react';
import { ShopIcon, CoinIcon } from './Icons.jsx';
import './ShopScreen.css';

export default function ShopScreen({ user, upgrades, userUpgrades, onBuyUpgrade }) {
  const coins = Math.floor(user?.coins || 0);

  const getLevel = (id) => {
    const found = userUpgrades.find(u => u.upgrade_id === id);
    return found ? found.level : 0;
  };

  return (
    <div className="shop-screen">
      <div className="shop-header">
        <h2 className="screen-title"><ShopIcon size={22} className="screen-title-icon" /> 🛒 Магазин</h2>
        <p className="shop-balance"><CoinIcon size={15} className="inline-coin" /><strong>{coins.toLocaleString('ru-RU')}</strong></p>
      </div>

      <div className="upgrades-grid">
        {upgrades.map(upgrade => {
          const level = getLevel(upgrade.id);
          const maxed = level >= upgrade.max_level;
          const cost = Math.floor(upgrade.base_cost * Math.pow(upgrade.cost_multiplier, level));
          const affordable = coins >= cost;

          return (
            <div key={upgrade.id} className="card upgrade-cell">
              <div className="upgrade-head">
                <span className="upgrade-icon">{upgrade.icon}</span>
                <span className="upgrade-level-chip">Lv {level}<em>/{upgrade.max_level}</em></span>
              </div>
              <h3 className="upgrade-name">{upgrade.name}</h3>
              <p className="upgrade-desc">{upgrade.description}</p>
              <div className="upgrade-track">
                <div className="level-track">
                  <div className="level-fill" style={{ width: `${Math.min(100, (level / upgrade.max_level) * 100)}%` }} />
                </div>
              </div>
              <button
                className={`upgrade-buy ${maxed ? 'maxed' : affordable ? 'affordable' : 'too-expensive'}`}
                onClick={() => onBuyUpgrade(upgrade.id)}
                disabled={maxed}
              >
                {maxed ? 'MAX' : <><CoinIcon size={13} className="inline-coin" />{cost.toLocaleString('ru-RU')}</>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}