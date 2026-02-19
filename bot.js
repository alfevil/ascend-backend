// ═══════════════════════════════════════════
// bot.js — Telegram Bot ASCEND (RU) — fixed
// ═══════════════════════════════════════════
const { Telegraf, Markup } = require("telegraf");
const { db } = require("./db");

const BOT_TOKEN   = process.env.BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL;

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

// ── /start ───────────────────────────────────
bot.start(async (ctx) => {
  const tgUser = ctx.from;

  let user = await db.getUserByTgId(tgUser.id);
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

  const text = [
    `⬡ *ASCEND — Прокачай себя* ⬡`,
    ``,
    `Привет, *${tgUser.first_name}*! 👋`,
    ``,
    `RPG‑трекер саморазвития прямо в Telegram.`,
    `Превращай реальные действия в очки опыта.`,
    ``,
    `✦ Прокачивай 6 навыков`,
    `⚔ Выполняй ежедневные задания`,
    `◆ Соревнуйся с другими игроками`,
    `🔥 Не ломай стрик`,
    ``,
    `Твой ранг: *${stageRu}*`,
    `Дней в игре: *${user.streak_days}*`,
  ].join("\n");

  await ctx.replyWithMarkdown(text,
    Markup.inlineKeyboard([
      [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)],
      [
        Markup.button.callback("📊 Мои статы", "my_stats"),
        Markup.button.callback("🏆 Рейтинг",   "leaderboard"),
      ],
      [Markup.button.callback("❓ Помощь", "help")],
    ])
  );
});

// ── /stats ───────────────────────────────────
bot.command("stats", async (ctx) => {
  const user = await db.getUserByTgId(ctx.from.id);
  if (!user) return ctx.replyWithMarkdown("Сначала запусти бота: /start");

  const stats   = user.stats;
  const total   = Object.values(stats).reduce((a, b) => a + b, 0).toFixed(1);
  const stageRu = STAGE_RU[user.current_stage] || user.current_stage;

  const lines = [
    `📊 *Статистика — ${user.display_name}*`,
    ``,
    `Ранг: *${stageRu}*`,
    `Счёт: *${total} / 60*`,
    `🔥 Стрик: *${user.streak_days} дней*`,
    ``,
    `*Навыки:*`,
    ...Object.entries(stats).map(([key, val]) =>
      `${STAT_ICONS[key]} ${STAT_RU[key]}: *${Number(val).toFixed(1)}*`
    ),
  ];

  await ctx.replyWithMarkdown(lines.join("\n"),
    Markup.inlineKeyboard([
      [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)]
    ])
  );
});

// ── /top ─────────────────────────────────────
bot.command("top", async (ctx) => {
  const leaders = await db.getLeaderboard(10);
  const lines   = ["🏆 *Топ игроков ASCEND*", ""];

  leaders.forEach((u, i) => {
    const medals  = ["🥇", "🥈", "🥉"];
    const prefix  = medals[i] || `${i + 1}.`;
    const total   = Object.values(u.stats).reduce((a, b) => a + b, 0).toFixed(1);
    const stageRu = STAGE_RU[u.current_stage] || u.current_stage;
    lines.push(`${prefix} *${u.display_name}* — ${total} _(${stageRu})_`);
  });

  if (leaders.length === 0) lines.push("_Пока никого нет. Будь первым!_");

  await ctx.replyWithMarkdown(lines.join("\n"));
});

// ── /help ─────────────────────────────────────
bot.command("help", async (ctx) => {
  const text = [
    `❓ *Помощь — ASCEND*`,
    ``,
    `*Команды:*`,
    `/start — главное меню`,
    `/stats — твои навыки`,
    `/top — рейтинг игроков`,
    `/help — эта подсказка`,
    ``,
    `*Как играть:*`,
    `Каждый день доступны задания по 6 навыкам.`,
    `Выполняй → получай XP → растёт уровень.`,
    `Не пропускай дни — стрик важен.`,
    ``,
    `*Навыки:*`,
    `✦ Внешность — уход за собой`,
    `⚔ Дисциплина — привычки и режим`,
    `◈ Общение — социальные навыки`,
    `◉ Ментальное — ум и психика`,
    `◆ Физическое — спорт и тело`,
    `◎ Финансы — деньги и инвестиции`,
  ].join("\n");

  await ctx.replyWithMarkdown(text,
    Markup.inlineKeyboard([
      [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)]
    ])
  );
});

// ── Callback кнопки ──────────────────────────
bot.action("my_stats", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await db.getUserByTgId(ctx.from.id);
  if (!user) return ctx.reply("Сначала /start");

  const total   = Object.values(user.stats).reduce((a, b) => a + b, 0).toFixed(1);
  const stageRu = STAGE_RU[user.current_stage] || user.current_stage;

  await ctx.replyWithMarkdown(
    `📊 Ранг: *${stageRu}*\nСчёт: *${total} / 60*\n🔥 Стрик: *${user.streak_days} дней*`,
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
    lines.push(`${prefix} ${u.display_name} — ${total}`);
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
  await ctx.reply(
    "Выполняй задания каждый день → прокачивай навыки → поднимайся в рейтинге.\n\nКоманды: /stats /top /help",
    Markup.inlineKeyboard([
      [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)]
    ])
  );
});

// ── Уведомление о level-up ────────────────────
bot.notifyLevelUp = async (tgId, newStage) => {
  const stageRu = STAGE_RU[newStage] || newStage;
  try {
    await bot.telegram.sendMessage(tgId,
      `🎉 *НОВЫЙ УРОВЕНЬ!*\n\nТы достиг ранга *${stageRu}*!\n\nТак держать 💪`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.webApp("⚔ Открыть ASCEND", MINI_APP_URL)]
        ])
      }
    );
  } catch {}
};

// ── Меню команд (только латиница!) ───────────
bot.telegram.setMyCommands([
  { command: "start", description: "🚀 Главное меню" },
  { command: "stats", description: "📊 Мои навыки и прогресс" },
  { command: "top",   description: "🏆 Рейтинг игроков" },
  { command: "help",  description: "❓ Как играть" },
]);

module.exports = { bot };