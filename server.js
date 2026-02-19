// ═══════════════════════════════════════════
// server.js — Express REST API для ASCEND
// ═══════════════════════════════════════════
require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const crypto   = require("crypto");
const { bot }  = require("./bot");
const { db }   = require("./db");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.MINI_APP_URL || "*" }));
app.use(express.json());

// ── Telegram InitData валидация ───────────────
// Защищает API от левых запросов
function validateTelegramData(initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    params.delete("hash");

    const sortedKeys = [...params.keys()].sort();
    const dataCheckString = sortedKeys.map(k => `${k}=${params.get(k)}`).join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(process.env.BOT_TOKEN)
      .digest();

    const expectedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    return hash === expectedHash;
  } catch {
    return false;
  }
}

// Middleware — проверяем Telegram auth на защищённых роутах
function requireTgAuth(req, res, next) {
  const initData = req.headers["x-telegram-init-data"];
  if (!initData) return res.status(401).json({ error: "No auth" });

  // В dev-режиме пропускаем валидацию
  if (process.env.NODE_ENV === "development") {
    req.tgUserId = parseInt(req.headers["x-dev-user-id"] || "0");
    return next();
  }

  if (!validateTelegramData(initData)) {
    return res.status(401).json({ error: "Invalid Telegram data" });
  }

  const params = new URLSearchParams(initData);
  const user = JSON.parse(params.get("user") || "{}");
  req.tgUserId = user.id;
  next();
}

// ══════════════════════════════════════════
// ENDPOINTS
// ══════════════════════════════════════════

// GET /api/user — получить профиль текущего юзера
app.get("/api/user", requireTgAuth, async (req, res) => {
  try {
    let user = await db.getUserByTgId(req.tgUserId);
    if (!user) {
      // Авто-создание при первом заходе через Mini App
      user = await db.createUser({
        tg_id: req.tgUserId,
        display_name: "Warrior",
      });
    }
    res.json(user);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});

// PATCH /api/user — обновить имя/фокус после онбординга
app.patch("/api/user", requireTgAuth, async (req, res) => {
  try {
    const { display_name, focus_areas } = req.body;
    const user = await db.updateUser(req.tgUserId, { display_name, focus_areas });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: "DB error" });
  }
});

// GET /api/quests — список квестов на сегодня
app.get("/api/quests", requireTgAuth, async (req, res) => {
  try {
    const quests = await db.getTodayQuests(req.tgUserId);
    res.json(quests);
  } catch (e) {
    res.status(500).json({ error: "DB error" });
  }
});

// POST /api/quests/:id/complete — выполнить квест
app.post("/api/quests/:id/complete", requireTgAuth, async (req, res) => {
  try {
    const questId = parseInt(req.params.id);
    const result  = await db.completeQuest(req.tgUserId, questId);

    if (!result) {
      return res.status(400).json({ error: "Quest not found or already done" });
    }

    // Проверяем level-up
    const user         = await db.getUserByTgId(req.tgUserId);
    const leveledUp    = result.prevStage !== user.current_stage;

    // Если level-up — отправляем уведомление в Telegram
    if (leveledUp) {
      try {
        await bot.telegram.sendMessage(req.tgUserId,
          `🎉 *LEVEL UP!*\n\nТы достиг уровня *${user.current_stage}*!\n\nПродолжай в том же духе 💪`,
          { parse_mode: "Markdown" }
        );
      } catch {} // юзер мог заблокировать бота — игнорируем
    }

    res.json({ ...result, leveledUp, newStage: user.current_stage });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});

// GET /api/leaderboard — глобальный рейтинг
app.get("/api/leaderboard", requireTgAuth, async (req, res) => {
  try {
    const leaders = await db.getLeaderboard(50);
    res.json(leaders);
  } catch (e) {
    res.status(500).json({ error: "DB error" });
  }
});

// GET /api/leaderboard/friends — рейтинг среди друзей
// (нужно передать массив tg_ids из Telegram contact list)
app.post("/api/leaderboard/friends", requireTgAuth, async (req, res) => {
  try {
    const { tg_ids } = req.body; // array of numbers
    if (!Array.isArray(tg_ids)) return res.status(400).json({ error: "tg_ids required" });
    const leaders = await db.getLeaderboardByIds([req.tgUserId, ...tg_ids]);
    res.json(leaders);
  } catch (e) {
    res.status(500).json({ error: "DB error" });
  }
});

// POST /api/webhook — Telegram webhook
app.post("/api/webhook", (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// ── Запуск ────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`✅ API server running on port ${PORT}`);

  if (process.env.WEBHOOK_URL) {
    await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/api/webhook`);
    console.log(`✅ Webhook set: ${process.env.WEBHOOK_URL}/api/webhook`);
  } else {
    // Long polling для локальной разработки
    bot.launch();
    console.log("✅ Bot running in long-polling mode");
  }
});

process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
