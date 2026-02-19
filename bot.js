// ═══════════════════════════════════════════
// bot.js — Telegram Bot для ASCEND Mini App
// ═══════════════════════════════════════════
const { Telegraf, Markup } = require("telegraf");
const { db } = require("./db");

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL; // https://your-vercel-app.vercel.app

const bot = new Telegraf(BOT_TOKEN);

// ── /start ──────────────────────────────────
bot.start(async (ctx) => {
  const tgUser = ctx.from;

  // Регистрируем / находим юзера
  let user = await db.getUserByTgId(tgUser.id);
  if (!user) {
    user = await db.createUser({
      tg_id:        tgUser.id,
      username:     tgUser.username || null,
      first_name:   tgUser.first_name,
      display_name: tgUser.first_name,
    });
    console.log(`[NEW USER] ${tgUser.id} — ${tgUser.first_name}`);
  }

  await ctx.replyWithPhoto(
    { url: "https://i.imgur.com/PLACEHOLDER.png" }, // заменить на свой баннер
    {
      caption: `*⬡ ASCEND — Level Up Your Real Life ⬡*\n\nПривет, ${tgUser.first_name}!\n\nЭто RPG‑трекер саморазвития прямо в Telegram.\n\n✦ Прокачивай 6 навыков\n⚔ Выполняй ежедневные задания\n◆ Смотри свой ранг среди друзей\n\nТвой уровень: *${user.current_stage || "Novice"}*`,
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.webApp("⬡ Открыть ASCEND", MINI_APP_URL)],
        [Markup.button.callback("📊 Моя статистика", "my_stats")],
        [Markup.button.callback("🏆 Топ игроков", "leaderboard")],
      ])
    }
  );
});

// ── Команды ──────────────────────────────────
bot.command("stats", async (ctx) => {
  const user = await db.getUserByTgId(ctx.from.id);
  if (!user) return ctx.reply("Сначала запусти бота: /start");

  const stats = user.stats;
  const total = Object.values(stats).reduce((a, b) => a + b, 0).toFixed(1);

  const lines = [
    `*📊 Твои статы, ${user.display_name}*`,
    `Уровень: *${user.current_stage}*`,
    `Всего очков: *${total}*`,
    "",
    `✦ Appearance:  ${stats.appearance.toFixed(1)}`,
    `⚔ Discipline:  ${stats.discipline.toFixed(1)}`,
    `◈ Social:      ${stats.social.toFixed(1)}`,
    `◉ Mental:      ${stats.mental.toFixed(1)}`,
    `◆ Physical:    ${stats.physical.toFixed(1)}`,
    `◎ Financial:   ${stats.financial.toFixed(1)}`,
    "",
    `🔥 Стрик: *${user.streak_days} дней*`,
  ];

  await ctx.replyWithMarkdown(lines.join("\n"),
    Markup.inlineKeyboard([[Markup.button.webApp("⬡ Открыть приложение", MINI_APP_URL)]])
  );
});

bot.command("top", async (ctx) => {
  const leaders = await db.getLeaderboard(10);
  const lines = ["*🏆 Топ игроков ASCEND*", ""];

  leaders.forEach((u, i) => {
    const medals = ["🥇","🥈","🥉"];
    const prefix = medals[i] || `${i+1}.`;
    const total = Object.values(u.stats).reduce((a,b)=>a+b,0).toFixed(1);
    lines.push(`${prefix} *${u.display_name}* — ${total} (${u.current_stage})`);
  });

  await ctx.replyWithMarkdown(lines.join("\n"));
});

// ── Callback кнопки ──────────────────────────
bot.action("my_stats", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await db.getUserByTgId(ctx.from.id);
  if (!user) return ctx.reply("Сначала /start");
  const total = Object.values(user.stats).reduce((a,b)=>a+b,0).toFixed(1);
  await ctx.replyWithMarkdown(`Твой уровень: *${user.current_stage}*\nВсего очков: *${total}*\n\nОткрой приложение для деталей 👇`,
    Markup.inlineKeyboard([[Markup.button.webApp("⬡ Открыть ASCEND", MINI_APP_URL)]])
  );
});

bot.action("leaderboard", async (ctx) => {
  await ctx.answerCbQuery();
  const leaders = await db.getLeaderboard(5);
  const lines = leaders.map((u, i) => {
    const total = Object.values(u.stats).reduce((a,b)=>a+b,0).toFixed(1);
    return `${i+1}. ${u.display_name} — ${total}`;
  });
  await ctx.replyWithMarkdown("*🏆 Топ-5:*\n\n" + lines.join("\n"));
});

// ── Настройка меню ────────────────────────────
bot.telegram.setMyCommands([
  { command: "start",  description: "🚀 Запустить ASCEND" },
  { command: "stats",  description: "📊 Мои статы" },
  { command: "top",    description: "🏆 Топ игроков" },
]);

module.exports = { bot };
