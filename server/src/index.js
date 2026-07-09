import express from 'express'
import cors from 'cors'
import { pool, initSchema, rowToRecord, rowToProfile } from './db.js'

const app = express()
const port = Number(process.env.PORT) || 3001

// CORS: 許可するフロントエンドのオリジンをカンマ区切りで指定
// 例: ALLOWED_ORIGINS=http://localhost:5173,https://r-onuma.github.io
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '1mb' }))

// API_TOKEN を設定した場合のみ、書き込み系リクエストにBearerトークンを要求する
const apiToken = process.env.API_TOKEN
app.use((req, res, next) => {
  if (!apiToken || req.method === 'GET' || req.method === 'OPTIONS') return next()
  const header = req.headers.authorization ?? ''
  if (header === `Bearer ${apiToken}`) return next()
  res.status(401).json({ error: '認証が必要です' })
})

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.get('/api/profile', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM profile WHERE id = 1')
    res.json(rows.length > 0 ? rowToProfile(rows[0]) : { gender: '', age: '', height: '', weight: '' })
  } catch (err) {
    next(err)
  }
})

app.put('/api/profile', async (req, res, next) => {
  try {
    const { gender = '', age = '', height = '', weight = '' } = req.body ?? {}
    const { rows } = await pool.query(
      `INSERT INTO profile (id, gender, age, height, weight, updated_at)
       VALUES (1, $1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE
         SET gender = $1, age = $2, height = $3, weight = $4, updated_at = now()
       RETURNING *`,
      [String(gender), String(age), String(height), String(weight)],
    )
    res.json(rowToProfile(rows[0]))
  } catch (err) {
    next(err)
  }
})

app.get('/api/records', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM records ORDER BY date')
    res.json(rows.map(rowToRecord))
  } catch (err) {
    next(err)
  }
})

// 1件保存(同じ日付があれば上書き)。フロントの「1日1件」ルールと対応
app.put('/api/records', async (req, res, next) => {
  try {
    const { id, date, steps = '', sleepHours = '', weight = '', mealMemo = '' } = req.body ?? {}
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
      return res.status(400).json({ error: 'id と date (YYYY-MM-DD) は必須です' })
    }
    const { rows } = await pool.query(
      `INSERT INTO records (id, date, steps, sleep_hours, weight, meal_memo, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE
         SET date = $2, steps = $3, sleep_hours = $4, weight = $5, meal_memo = $6, updated_at = now()
       RETURNING *`,
      [id, date, String(steps), String(sleepHours), String(weight), String(mealMemo)],
    )
    res.json(rowToRecord(rows[0]))
  } catch (err) {
    // 23505 = unique制約違反。編集で他の記録と同じ日付に変更した場合に発生する
    if (err.code === '23505') {
      return res.status(409).json({ error: '同じ日付の記録が既に存在します' })
    }
    next(err)
  }
})

app.delete('/api/records/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM records WHERE id = $1', [req.params.id])
    if (rowCount === 0) return res.status(404).json({ error: '記録が見つかりません' })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// バックアップのインポート用: 全記録・プロフィールをまとめて置き換える
app.put('/api/import', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { records, profile } = req.body ?? {}
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'records は配列で指定してください' })
    }
    await client.query('BEGIN')
    await client.query('DELETE FROM records')
    for (const r of records) {
      if (!r?.id || !/^\d{4}-\d{2}-\d{2}$/.test(r?.date ?? '')) continue
      await client.query(
        `INSERT INTO records (id, date, steps, sleep_hours, weight, meal_memo)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (date) DO NOTHING`,
        [r.id, r.date, String(r.steps ?? ''), String(r.sleepHours ?? ''), String(r.weight ?? ''), String(r.mealMemo ?? '')],
      )
    }
    if (profile) {
      await client.query(
        `INSERT INTO profile (id, gender, age, height, weight, updated_at)
         VALUES (1, $1, $2, $3, $4, now())
         ON CONFLICT (id) DO UPDATE
           SET gender = $1, age = $2, height = $3, weight = $4, updated_at = now()`,
        [String(profile.gender ?? ''), String(profile.age ?? ''), String(profile.height ?? ''), String(profile.weight ?? '')],
      )
    }
    await client.query('COMMIT')
    res.json({ ok: true, imported: records.length })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

// 想定外のエラーは500で返す(スタックトレースはサーバーログのみに出す)
// 引数4つのミドルウェアがExpressのエラーハンドラとして認識されるため _next は削れない
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'サーバーエラーが発生しました' })
})

await initSchema()
app.listen(port, () => {
  console.log(`health-care API listening on port ${port}`)
})
