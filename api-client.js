// ═══════════════════════════════════════════
// api.js — Клиент для общения фронта с бэком
// Подключи в Mini App: import { api } from './api'
// ═══════════════════════════════════════════

const BASE_URL = import.meta.env.VITE_API_URL || "https://ascend-api.railway.app";

// Получаем initData из Telegram WebApp SDK
function getInitData() {
  if (typeof window !== "undefined" && window.Telegram?.WebApp) {
    return window.Telegram.WebApp.initData;
  }
  return "";
}

async function request(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": getInitData(),
      // Dev: передаём свой tg_id вручную
      ...(import.meta.env.DEV && { "x-dev-user-id": "123456789" }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Загрузить профиль
  getUser: () => request("GET", "/api/user"),

  // Сохранить имя и фокус после онбординга
  updateUser: (data) => request("PATCH", "/api/user", data),

  // Квесты на сегодня
  getQuests: () => request("GET", "/api/quests"),

  // Выполнить квест
  completeQuest: (id) => request("POST", `/api/quests/${id}/complete`),

  // Глобальный лидерборд
  getLeaderboard: () => request("GET", "/api/leaderboard"),

  // Лидерборд среди конкретных юзеров
  getFriendsLeaderboard: (tg_ids) =>
    request("POST", "/api/leaderboard/friends", { tg_ids }),
};
