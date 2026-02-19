// ═══════════════════════════════════════════
// db.js — PostgreSQL через node-postgres
// ═══════════════════════════════════════════
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ══════════════════════════════════════════
// СХЕМА БД (выполни один раз: node db.js --migrate)
// ══════════════════════════════════════════
const MIGRATION = `
-- Пользователи
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  tg_id           BIGINT UNIQUE NOT NULL,
  username        TEXT,
  display_name    TEXT NOT NULL DEFAULT 'Warrior',
  focus_areas     TEXT[] DEFAULT '{}',
  current_stage   TEXT NOT NULL DEFAULT 'Novice',
  streak_days     INT NOT NULL DEFAULT 0,
  last_active_date DATE,
  stats JSONB NOT NULL DEFAULT '{
    "appearance": 0.3,
    "discipline": 0.3,
    "social": 0.3,
    "mental": 0.3,
    "physical": 0.3,
    "financial": 0.3
  }',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Шаблоны заданий (общие для всех)
CREATE TABLE IF NOT EXISTS quest_templates (
  id        SERIAL PRIMARY KEY,
  stat      TEXT NOT NULL,
  text      TEXT NOT NULL,
  xp        INT NOT NULL DEFAULT 100,
  active    BOOLEAN DEFAULT TRUE
);

-- Выполненные задания юзеров
CREATE TABLE IF NOT EXISTS quest_completions (
  id            SERIAL PRIMARY KEY,
  user_id       INT REFERENCES users(id) ON DELETE CASCADE,
  quest_id      INT REFERENCES quest_templates(id),
  completed_at  TIMESTAMPTZ DEFAULT NOW(),
  date          DATE DEFAULT CURRENT_DATE,
  UNIQUE(user_id, quest_id, date)  -- нельзя выполнить одно задание дважды в день
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users(tg_id);
CREATE INDEX IF NOT EXISTS idx_completions_user_date ON quest_completions(user_id, date);

-- Дефолтные задания
INSERT INTO quest_templates (stat, text, xp) VALUES
  ('physical',   'Morning workout — 30 min',    120),
  ('mental',     'Read 20 pages',               80),
  ('discipline', 'No phone before 10:00',       150),
  ('financial',  'Track all expenses',          60),
  ('social',     'Message one new person',      100),
  ('appearance', 'Cold shower + skincare',      90),
  ('mental',     'Meditate 10 minutes',         70),
  ('discipline', 'Sleep before midnight',       110),
  ('physical',   'Walk 8000+ steps',            85),
  ('financial',  'Learn one financial concept', 75),
  ('social',     'Give someone a compliment',   50),
  ('mental',     'No doom-scrolling today',     130)
ON CONFLICT DO NOTHING;
`;

// Логика обновления стадии персонажа
function computeStage(stats) {
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  if (total >= 58) return "Master";
  if (total >= 52) return "Expert";
  if (total >= 42) return "Advanced";
  if (total >= 30) return "Intermediate";
  if (total >= 18) return "Apprentice";
  return "Novice";
}

// ══════════════════════════════════════════
// QUERIES
// ══════════════════════════════════════════
const db = {

  async getUserByTgId(tgId) {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE tg_id = $1",
      [tgId]
    );
    return rows[0] || null;
  },

  async createUser({ tg_id, username, first_name, display_name }) {
    const { rows } = await pool.query(
      `INSERT INTO users (tg_id, username, display_name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [tg_id, username || null, display_name || first_name || "Warrior"]
    );
    return rows[0];
  },

  async updateUser(tgId, { display_name, focus_areas }) {
    const fields = [];
    const values = [];
    let i = 1;

    if (display_name !== undefined) { fields.push(`display_name = $${i++}`); values.push(display_name); }
    if (focus_areas  !== undefined) { fields.push(`focus_areas  = $${i++}`); values.push(focus_areas); }

    if (!fields.length) return this.getUserByTgId(tgId);

    values.push(tgId);
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(", ")} WHERE tg_id = $${i} RETURNING *`,
      values
    );
    return rows[0];
  },

  async getTodayQuests(tgId) {
    const { rows: user } = await pool.query("SELECT id FROM users WHERE tg_id = $1", [tgId]);
    if (!user[0]) return [];
    const userId = user[0].id;

    const { rows } = await pool.query(`
      SELECT
        qt.id, qt.stat, qt.text, qt.xp,
        CASE WHEN qc.id IS NOT NULL THEN true ELSE false END AS done
      FROM quest_templates qt
      LEFT JOIN quest_completions qc
        ON qc.quest_id = qt.id AND qc.user_id = $1 AND qc.date = CURRENT_DATE
      WHERE qt.active = true
      ORDER BY qt.id
    `, [userId]);

    return rows;
  },

  async completeQuest(tgId, questId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Находим юзера
      const { rows: [user] } = await client.query(
        "SELECT * FROM users WHERE tg_id = $1 FOR UPDATE", [tgId]
      );
      if (!user) throw new Error("User not found");

      // Находим квест
      const { rows: [quest] } = await client.query(
        "SELECT * FROM quest_templates WHERE id = $1", [questId]
      );
      if (!quest) throw new Error("Quest not found");

      // Попытка вставить completion (UNIQUE constraint не даст задвоить)
      const { rows: [comp] } = await client.query(`
        INSERT INTO quest_completions (user_id, quest_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, quest_id, date) DO NOTHING
        RETURNING id
      `, [user.id, questId]);

      if (!comp) {
        await client.query("ROLLBACK");
        return null; // уже выполнено
      }

      // Обновляем стат
      const prevStage = user.current_stage;
      const newStats  = { ...user.stats };
      newStats[quest.stat] = Math.min(10, (newStats[quest.stat] || 0) + 0.3);
      const newStage = computeStage(newStats);

      // Обновляем streak
      const today = new Date().toISOString().split("T")[0];
      const lastDate = user.last_active_date?.toISOString?.()?.split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const newStreak = lastDate === yesterday ? user.streak_days + 1
                       : lastDate === today    ? user.streak_days
                       : 1;

      await client.query(`
        UPDATE users
        SET stats = $1, current_stage = $2, streak_days = $3, last_active_date = CURRENT_DATE
        WHERE id = $4
      `, [JSON.stringify(newStats), newStage, newStreak, user.id]);

      await client.query("COMMIT");

      return {
        xpGained: quest.xp,
        statKey:  quest.stat,
        newStats,
        prevStage,
        newStage,
        streak: newStreak,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },

  async getLeaderboard(limit = 50) {
    const { rows } = await pool.query(`
      SELECT
        display_name, current_stage, streak_days, stats,
        (
          (stats->>'appearance')::float +
          (stats->>'discipline')::float +
          (stats->>'social')::float +
          (stats->>'mental')::float +
          (stats->>'physical')::float +
          (stats->>'financial')::float
        ) AS total_score
      FROM users
      ORDER BY total_score DESC
      LIMIT $1
    `, [limit]);
    return rows;
  },

  async getLeaderboardByIds(tgIds) {
    const { rows } = await pool.query(`
      SELECT
        tg_id, display_name, current_stage, stats,
        (
          (stats->>'appearance')::float +
          (stats->>'discipline')::float +
          (stats->>'social')::float +
          (stats->>'mental')::float +
          (stats->>'physical')::float +
          (stats->>'financial')::float
        ) AS total_score
      FROM users
      WHERE tg_id = ANY($1)
      ORDER BY total_score DESC
    `, [tgIds]);
    return rows;
  },
};

// ── CLI миграция ─────────────────────────────
if (require.main === module && process.argv[2] === "--migrate") {
  pool.query(MIGRATION)
    .then(() => { console.log("✅ Migration complete"); process.exit(0); })
    .catch(e => { console.error("❌ Migration failed:", e); process.exit(1); });
}

module.exports = { db, pool };
