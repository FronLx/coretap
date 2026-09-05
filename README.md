# CoreTap ⚡ — Telegram Mini App тапалка

Тапалка в стиле Hamster Kombat для Telegram.

## Функции
- 👆 **Тапание** — клик по кубу, заработок монет
- 🛒 **Магазин улучшений** — 8 апгрейдов в 4 категориях
- 👤 **Профиль** — уровень, XP, статистика
- 🎁 **Ежедневные награды** — 7-дневный стрик
- 👥 **Реферальная система** — +5000 монет за друга
- 🏆 **Лидерборд** — топ-50 игроков

## Структура
```
TOKEN/
├── client/          # Frontend (React + Vite)
│   └── src/
│       ├── components/  # Экраны игры
│       └── styles/       # CSS
└── server/          # Backend (Express + SQLite)
    ├── index.js     # API роуты
    └── db.js        # База данных и логика
```

## Установка

### 1. Бэкенд
```bash
cd server
npm install
npm run dev
```
Сервер запускается на `http://localhost:3001`.

### 2. Фронтенд
```bash
cd client
npm install
npm run dev
```
Frontend доступен на `http://localhost:5173`.

### 3. Установка Telegram-токена
В `server/index.js` замените `BOT_TOKEN` на ваш реальный токен от @BotFather.

В `client/src/components/ReferralScreen.jsx` замените `BOT_USERNAME` на username вашего бота.

## Создание бота в Telegram
1. Напишите @BotFather
2. Отправьте `/newbot`
3. Выберите имя (CoreTap) и username
4. Получите токен
5. Создайте Mini App через @BotFather → `/newapp` → укажите URL хостарованного фронтенда

## Деплой
Frontend и Backend нужно хостировать на HTTPS (например Vercel/Netlify для frontend, Railway/Render для backend), так как Telegram требует HTTPS.

В `client/vite.config.js` настройте `VITE_API_URL` на URL вашего backend.

## API Эндпоинты
| Метод | Путь | Описание |
|-------|------|----------|
| POST | /api/auth | Авторизация, получение данных игрока |
| POST | /api/tap | Отправка тапов |
| POST | /api/regen | Регенерация энергии |
| GET  | /api/upgrades | Список улучшений |
| POST | /api/upgrade/:id | Покупка улучшения |
| GET  | /api/leaderboard | Топ игроков |
| POST | /api/daily | Забрать дневную награду |
| POST | /api/boost/tap_frenzy | Активировать френзи |
| GET  | /api/profile | Данные профиля |
