// ═══════════════════════════════════════════
// bot.js — ASCEND Bot (RU) — Full Edition
// ═══════════════════════════════════════════
const { Telegraf, Markup } = require("telegraf");
const { db } = require("./db");

const BOT_TOKEN    = process.env.BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL;
const CHANNEL_URL  = "https://t.me/ascend_app"; // ← ЗАМЕНИ на свой канал

const bot = new Telegraf(BOT_TOKEN);

const STAGE_RU = {
  "Novice":       "Новичок",
  "Apprentice":   "Ученик",
  "Intermediate": "Середняк",
  "Advanced":     "Продвинутый",
  "Expert":       "Эксперт",
  "Master":       "Мастер",
};

const STAT_RU = {
  appearance: "Внешность",
  discipline: "Дисциплина",
  social:     "Общение",
  mental:     "Ментальное",
  physical:   "Физическое",
  financial:  "Финансы",
};

const STAT_ICONS = {
  appearance: "✦",
  discipline: "⚔",
  social:     "◈",
  mental:     "◉",
  physical:   "◆",
  financial:  "◎",
};

// ─────────────────────────────────────────
// /start — красивое приветствие
// ─────────────────────────────────────────
bot.start(async (ctx) => {
  const tgUser = ctx.from;

  let user = await db.getUserByTgId(tgUser.id);
  const isNew = !user;

  if (!user) {
    user = await db.createUser({
      tg_id:        tgUser.id,
      username:     tgUser.username || null,
      first_name:   tgUser.first_name,
      display_name: tgUser.first_name,
    });
    console.log(`[НОВЫЙ ИГРОК] ${tgUser.id} — ${tgUser.first_name}`);
  }

  const stageRu = STAGE_RU[user.current_stage] || user.current_stage;

  if (isNew) {
    // ── Новый юзер — полное приветствие ──
    const welcome = [
      `⬡ *Добро пожаловать в ASCEND* ⬡`,
      ``,
      `Привет, *${tgUser.first_name}*! 👋`,
      ``,
      `Ты только что нашёл RPG‑трекер саморазвития.`,
      `Здесь твои реальные действия превращаются в опыт персонажа.`,
      ``,
      `*Как это работает:*`,
      ``,
      `✦ *Внешность* — уход за собой и стиль`,
      `⚔ *Дисциплина* — привычки и режим дня`,
      `◈ *Общение* — социальные навыки и связи`,
      `◉ *Ментальное* — ум, чтение, медитация`,
      `◆ *Физическое* — спорт и здоровье тела`,
      `◎ *Финансы* — деньги, инвестиции, доход`,
      ``,
      `Каждый день — новые задания.`,
      `Каждое выполненное задание — +XP и рост навыка.`,
      `Набирай опыт → повышай ранг → становись лучшей версией себя.`,
      ``,
      `🔥 *Не ломай стрик — это самое важное*`,
      ``,
      `Готов начать? Нажми кнопку ниже 👇`,
    ].join("\n");

    await ctx.replyWithMarkdown(welcome,
      Markup.inlineKeyboard([
        [Markup.button.webApp("⚔ Начать прокачку", MINI_APP_URL)],
        [Markup.button.url("📢 Канал ASCEND", CHANNEL_URL)],
      ])
    );

  } else {
    // ── Вернувшийся юзер — короткое приветствие ──
    const total = Object.values(user.stats).reduce((a, b) => a + b, 0).toFixed(1);

    const returning = [
      `⚔ *С возвращением, ${tgUser.first_name}!*`,
      ``,
      `Ранг: *${stageRu}*`,
      `Общий счёт: *${total} / 60*`,
      `🔥 Стрик: *${user.streak_days} дней*`,
      ``,
      `Твои задания ждут. Не останавливайся.`,
    ].join("\n");

    await ctx.replyWithMarkdown(returning,
      Markup.inlineKeyboard([
        [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)],
        [
          Markup.button.callback("📊 Мои статы", "my_stats"),
          Markup.button.callback("🏆 Рейтинг",   "leaderboard"),
        ],
        [
          Markup.button.callback("❓ Помощь",         "help"),
          Markup.button.url("📢 Канал", CHANNEL_URL),
        ],
      ])
    );
  }
});

// ─────────────────────────────────────────
// /stats
// ─────────────────────────────────────────
bot.command("stats", async (ctx) => {
  const user = await db.getUserByTgId(ctx.from.id);
  if (!user) return ctx.replyWithMarkdown("Сначала запусти бота: /start");

  const stats   = user.stats;
  const total   = Object.values(stats).reduce((a, b) => a + b, 0).toFixed(1);
  const stageRu = STAGE_RU[user.current_stage] || user.current_stage;
  const pct     = Math.round((total / 60) * 100);

  // Прогресс-бар текстовый
  const filled = Math.round(pct / 10);
  const bar    = "█".repeat(filled) + "░".repeat(10 - filled);

  const lines = [
    `📊 *Статистика — ${user.display_name}*`,
    ``,
    `Ранг: *${stageRu}*`,
    `Прогресс: \`${bar}\` ${pct}%`,
    `🔥 Стрик: *${user.streak_days} дней*`,
    ``,
    `*Навыки:*`,
    ...Object.entries(stats).map(([key, val]) => {
      const v = Number(val);
      const mini = "▓".repeat(Math.round(v)) + "░".repeat(10 - Math.round(v));
      return `${STAT_ICONS[key]} ${STAT_RU[key]}: *${v.toFixed(1)}* \`${mini}\``;
    }),
  ];

  await ctx.replyWithMarkdown(lines.join("\n"),
    Markup.inlineKeyboard([
      [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)]
    ])
  );
});

// ─────────────────────────────────────────
// /top
// ─────────────────────────────────────────
bot.command("top", async (ctx) => {
  const leaders = await db.getLeaderboard(10);
  const lines   = [
    `🏆 *Топ игроков ASCEND*`,
    ``,
  ];

  leaders.forEach((u, i) => {
    const medals  = ["🥇", "🥈", "🥉"];
    const prefix  = medals[i] || `  ${i + 1}.`;
    const total   = Object.values(u.stats).reduce((a, b) => a + b, 0).toFixed(1);
    const stageRu = STAGE_RU[u.current_stage] || u.current_stage;
    const streak  = u.streak_days > 0 ? ` 🔥${u.streak_days}` : "";
    lines.push(`${prefix} *${u.display_name}*${streak}`);
    lines.push(`    ${stageRu} · ${total}/60`);
    lines.push(``);
  });

  if (leaders.length === 0) {
    lines.push("_Пока никого нет. Будь первым!_");
  }

  await ctx.replyWithMarkdown(lines.join("\n"),
    Markup.inlineKeyboard([
      [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)]
    ])
  );
});

// ─────────────────────────────────────────
// /help
// ─────────────────────────────────────────
bot.command("help", async (ctx) => {
  const text = [
    `❓ *Помощь — ASCEND*`,
    ``,
    `*О проекте:*`,
    `ASCEND — это RPG‑трекер саморазвития.`,
    `Прокачивай реальные навыки, получай XP,`,
    `поднимайся от Новичка до Мастера.`,
    ``,
    `*Команды:*`,
    `/start — главное меню`,
    `/stats — твои навыки и прогресс`,
    `/top — рейтинг лучших игроков`,
    `/help — эта подсказка`,
    ``,
    `*Механика:*`,
    `• Каждый день — 8 заданий по навыкам`,
    `• Выполняй → получай XP → растёт навык`,
    `• Не пропускай дни — стрик даёт бонусы`,
    `• Прокачай все 6 навыков → стань Мастером`,
    ``,
    `*Ранги:*`,
    `🔰 Новичок → 📘 Ученик → ⚙️ Середняк`,
    `⚔️ Продвинутый → 💎 Эксперт → 👑 Мастер`,
    ``,
    `*Следи за обновлениями:*`,
  ].join("\n");

  await ctx.replyWithMarkdown(text,
    Markup.inlineKeyboard([
      [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)],
      [Markup.button.url("📢 Канал ASCEND", CHANNEL_URL)],
    ])
  );
});

// ─────────────────────────────────────────
// Callback кнопки
// ─────────────────────────────────────────
bot.action("my_stats", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await db.getUserByTgId(ctx.from.id);
  if (!user) return ctx.reply("Сначала /start");

  const total   = Object.values(user.stats).reduce((a, b) => a + b, 0).toFixed(1);
  const stageRu = STAGE_RU[user.current_stage] || user.current_stage;
  const pct     = Math.round((total / 60) * 100);
  const filled  = Math.round(pct / 10);
  const bar     = "█".repeat(filled) + "░".repeat(10 - filled);

  await ctx.replyWithMarkdown(
    [
      `📊 *${user.display_name}*`,
      `Ранг: *${stageRu}*`,
      `Прогресс: \`${bar}\` ${pct}%`,
      `🔥 Стрик: *${user.streak_days} дней*`,
    ].join("\n"),
    Markup.inlineKeyboard([
      [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)]
    ])
  );
});

bot.action("leaderboard", async (ctx) => {
  await ctx.answerCbQuery();
  const leaders = await db.getLeaderboard(5);
  const lines   = ["🏆 *Топ-5 игроков:*", ""];

  leaders.forEach((u, i) => {
    const medals = ["🥇", "🥈", "🥉"];
    const prefix = medals[i] || `${i + 1}.`;
    const total  = Object.values(u.stats).reduce((a, b) => a + b, 0).toFixed(1);
    lines.push(`${prefix} *${u.display_name}* — ${total}/60`);
  });

  if (leaders.length === 0) lines.push("_Пока никого нет_");

  await ctx.replyWithMarkdown(lines.join("\n"),
    Markup.inlineKeyboard([
      [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)]
    ])
  );
});

bot.action("help", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(
    [
      `*Как играть:*`,
      `Каждый день выполняй задания → получай XP → растут навыки → повышается ранг.`,
      ``,
      `Не пропускай дни — стрик это твой главный ресурс.`,
      ``,
      `Команды: /stats /top /help`,
    ].join("\n"),
    Markup.inlineKeyboard([
      [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)],
      [Markup.button.url("📢 Канал ASCEND", CHANNEL_URL)],
    ])
  );
});

// ─────────────────────────────────────────
// Level-up уведомление
// ─────────────────────────────────────────
bot.notifyLevelUp = async (tgId, newStage) => {
  const stageRu = STAGE_RU[newStage] || newStage;
  try {
    await bot.telegram.sendMessage(tgId,
      [
        `🎉 *НОВЫЙ РАНГ!*`,
        ``,
        `Ты достиг уровня *${stageRu}*!`,
        ``,
        `Это не конец — это только начало.`,
        `Продолжай прокачиваться 💪`,
      ].join("\n"),
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)],
          [Markup.button.url("📢 Поделись в канале", CHANNEL_URL)],
        ])
      }
    );
  } catch {}
};

// ─────────────────────────────────────────
// Меню команд
// ─────────────────────────────────────────
bot.telegram.setMyCommands([
  { command: "start", description: "🚀 Главное меню" },
  { command: "stats", description: "📊 Мои навыки и прогресс" },
  { command: "top",   description: "🏆 Рейтинг игроков" },
  { command: "help",  description: "❓ О проекте и помощь" },
]);

module.exports = { bot };