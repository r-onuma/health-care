import pg from 'pg'

// DATABASE_URL 例: postgres://healthapp:healthapp-local@127.0.0.1:5432/healthcare
// Neonなどのクラウド接続では ?sslmode=require が付くためSSLを自動判定する
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('環境変数 DATABASE_URL が設定されていません')
  process.exit(1)
}

export const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
})

// 起動時にテーブルを用意する(存在すれば何もしない)
export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      id UUID PRIMARY KEY,
      date DATE NOT NULL UNIQUE,
      steps TEXT NOT NULL DEFAULT '',
      sleep_hours TEXT NOT NULL DEFAULT '',
      weight TEXT NOT NULL DEFAULT '',
      meal_memo TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      gender TEXT NOT NULL DEFAULT '',
      age TEXT NOT NULL DEFAULT '',
      height TEXT NOT NULL DEFAULT '',
      weight TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)
}

// DBの行(snake_case)をフロントの形(camelCase)へ変換
export function rowToRecord(row) {
  return {
    id: row.id,
    date: row.date.toISOString ? row.date.toISOString().slice(0, 10) : String(row.date),
    steps: row.steps,
    sleepHours: row.sleep_hours,
    weight: row.weight,
    mealMemo: row.meal_memo,
  }
}

export function rowToProfile(row) {
  return {
    gender: row.gender,
    age: row.age,
    height: row.height,
    weight: row.weight,
  }
}
