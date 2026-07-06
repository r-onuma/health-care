import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'health-app-records'
const PROFILE_KEY = 'health-app-profile'

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const emptyProfile = {
  gender: '',
  age: '',
  height: '',
  weight: '',
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? { ...emptyProfile, ...JSON.parse(raw) } : emptyProfile
  } catch {
    return emptyProfile
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const emptyForm = {
  date: todayStr(),
  steps: '',
  sleepHours: '',
  weight: '',
  mealMemo: '',
}

function hasValue(v) {
  return v !== '' && v != null
}

// 「主食・主菜・副菜」がそろっているか、品目の多さ、ジャンクフードの有無で食事バランスを判定する
const MEAL_CATEGORIES = {
  staple: ['ご飯', 'ごはん', 'パン', '麺', 'めん', 'パスタ', 'うどん', 'そば', 'ラーメン', '米', 'おにぎり', 'シリアル', 'もち'],
  main: ['肉', '魚', '卵', 'たまご', '豆', '納豆', '豆腐', '鶏', '牛', '豚', '鮭', 'サーモン', 'マグロ', 'エビ', 'ハム', 'ソーセージ', 'チーズ', 'ヨーグルト', '大豆'],
  side: ['野菜', 'サラダ', 'きのこ', '海藻', 'わかめ', 'ほうれん草', 'トマト', 'きゅうり', 'キャベツ', 'ブロッコリー', '人参', 'にんじん', 'なす', 'ピーマン', '汁', 'スープ', '味噌汁'],
}
const MEAL_CATEGORY_LABELS = { staple: '主食', main: '主菜', side: '副菜' }

const JUNK_KEYWORDS = [
  'ジャンク', 'ファストフード', 'カップ麺', 'カップラーメン', 'インスタント麺', 'ポテトチップス', 'スナック菓子',
  'チョコレート', 'ケーキ', '菓子パン', 'ドーナツ', 'アイス', 'ジュース', 'コーラ', '揚げ物', '唐揚げ',
]

function findMealMatches(mealMemo) {
  const matches = {}
  for (const [key, words] of Object.entries(MEAL_CATEGORIES)) {
    matches[key] = words.filter((w) => mealMemo.includes(w))
  }
  return matches
}

function calcMealScore(mealMemo) {
  if (!mealMemo || !mealMemo.trim()) return 0

  const matches = findMealMatches(mealMemo)
  let score = 0

  // 主食・主菜・副菜、それぞれ1品目で20点、品目が増えるごとに+5点(上限25点)
  for (const key of Object.keys(MEAL_CATEGORIES)) {
    const count = matches[key].length
    score += count > 0 ? Math.min(20 + (count - 1) * 5, 25) : 0
  }

  // 3カテゴリすべて揃っている場合のバランスボーナス
  if (Object.values(matches).every((m) => m.length > 0)) {
    score += 25
  }

  // ジャンクフード・間食が多いと減点
  const junkCount = JUNK_KEYWORDS.filter((w) => mealMemo.includes(w)).length
  score -= junkCount * 15

  return Math.max(0, Math.min(100, Math.round(score)))
}

function getMealGaps(mealMemo) {
  if (!mealMemo || !mealMemo.trim()) {
    return Object.values(MEAL_CATEGORY_LABELS)
  }
  const matches = findMealMatches(mealMemo)
  return Object.entries(matches)
    .filter(([, words]) => words.length === 0)
    .map(([key]) => MEAL_CATEGORY_LABELS[key])
}

function hasJunkFood(mealMemo) {
  return !!mealMemo && JUNK_KEYWORDS.some((w) => mealMemo.includes(w))
}

// 身長・性別から適正体重(BMI基準)を算出する
function calcIdealWeight(profile) {
  if (!hasValue(profile.height)) return null
  const heightM = Number(profile.height) / 100
  if (!heightM) return null
  const idealBmi = profile.gender === 'male' ? 22 : profile.gender === 'female' ? 21 : 21.5
  return idealBmi * heightM * heightM
}

// その日の記録に体重があればそれを、なければプロフィールの体重を使う
function resolveWeight(record, profile) {
  return hasValue(record?.weight) ? record.weight : profile.weight
}

function calcWeightScore(record, profile) {
  const ideal = calcIdealWeight(profile)
  const weight = resolveWeight(record, profile)
  if (ideal == null || !hasValue(weight)) return null
  const diffRatio = Math.abs(Number(weight) - ideal) / ideal
  return Math.max(0, Math.round(100 - (diffRatio / 0.2) * 100))
}

function calcStepsScore(record) {
  if (!hasValue(record.steps)) return null
  return Math.round(Math.min(Number(record.steps) / 10000, 1) * 100)
}

function calcSleepScore(record) {
  if (!hasValue(record.sleepHours)) return null
  const h = Number(record.sleepHours)
  let ratio
  if (h >= 7 && h <= 9) ratio = 1
  else if (h < 7) ratio = Math.max(0, h / 7)
  else ratio = Math.max(0, 1 - (h - 9) / 9)
  return Math.round(ratio * 100)
}

// 各項目は100点満点で算出し、健康スコアはその加重平均(歩数30%・睡眠30%・体重20%・食事20%)
function calcHealthScore(record, profile) {
  const steps = calcStepsScore(record)
  const sleep = calcSleepScore(record)
  const weight = calcWeightScore(record, profile)
  const meal = calcMealScore(record.mealMemo)

  const weighted = [
    [steps, 0.3],
    [sleep, 0.3],
    [weight, 0.2],
    [meal, 0.2],
  ]

  let score = 0
  let weightSum = 0
  for (const [value, w] of weighted) {
    if (value != null) {
      score += value * w
      weightSum += w
    }
  }

  const total = weightSum === 0 ? null : Math.round(score / weightSum)
  return { total, steps, sleep, weight, meal }
}

function scoreLabel(score) {
  if (score >= 80) return { text: '絶好調', className: 'score-great' }
  if (score >= 60) return { text: '順調', className: 'score-good' }
  if (score >= 40) return { text: 'まずまず', className: 'score-ok' }
  return { text: '要改善', className: 'score-low' }
}

function getStepsComment(breakdown, record) {
  if (breakdown.steps == null) {
    return { label: '歩数', text: '歩数が未記録です。記録すると評価できます。', positive: false }
  }
  if (breakdown.steps >= 80) {
    return { label: '歩数', text: `歩数はとても良いペースです(${record.steps}歩)。この調子を維持しましょう。`, positive: true }
  }
  if (breakdown.steps >= 60) {
    return { label: '歩数', text: `歩数はまずまずです(${record.steps}歩)。もう少し歩けるとさらに良くなります。`, positive: true }
  }
  return {
    label: '歩数',
    text: `歩数が目標(1万歩)に届いていません(現在${record.steps}歩)。ウォーキングや階段の利用を増やしてみましょう。`,
    positive: false,
  }
}

function getSleepComment(breakdown, record) {
  if (breakdown.sleep == null) {
    return { label: '睡眠', text: '睡眠時間が未記録です。記録すると評価できます。', positive: false }
  }
  if (breakdown.sleep >= 80) {
    return { label: '睡眠', text: `理想的な睡眠時間です(${record.sleepHours}時間)。良い睡眠習慣を続けましょう。`, positive: true }
  }
  if (breakdown.sleep >= 60) {
    return { label: '睡眠', text: `睡眠時間はおおむね良好です(${record.sleepHours}時間)。`, positive: true }
  }
  return {
    label: '睡眠',
    text: `睡眠時間が理想の7〜9時間から外れています(現在${record.sleepHours}時間)。就寝・起床時間を見直してみましょう。`,
    positive: false,
  }
}

function getWeightComment(breakdown, record, profile) {
  if (breakdown.weight == null) {
    return {
      label: '体重',
      text: 'プロフィールに身長・体重を設定するか、記録に体重を入力すると体重の評価ができます。',
      positive: false,
    }
  }
  const ideal = calcIdealWeight(profile)
  const weight = resolveWeight(record, profile)
  const diff = Number(weight) - ideal
  const direction = diff > 0 ? '重め' : '軽め'
  if (breakdown.weight >= 80) {
    return { label: '体重', text: `体重は適正体重(約${ideal.toFixed(1)}kg)に近く良好です。`, positive: true }
  }
  if (breakdown.weight >= 60) {
    return {
      label: '体重',
      text: `体重はやや適正体重(約${ideal.toFixed(1)}kg)より${direction}です。無理のない範囲で調整しましょう。`,
      positive: true,
    }
  }
  return {
    label: '体重',
    text: `適正体重(約${ideal.toFixed(1)}kg)より${direction}です。${
      diff > 0 ? '食事量や運動量を見直しましょう' : 'しっかり栄養を摂りましょう'
    }。`,
    positive: false,
  }
}

function getMealComment(breakdown, record) {
  if (!record.mealMemo || !record.mealMemo.trim()) {
    return {
      label: '食事',
      text: '食事メモが記録されていません。主食・主菜・副菜を意識して記録してみましょう。',
      positive: false,
    }
  }
  const gaps = getMealGaps(record.mealMemo)
  const junk = hasJunkFood(record.mealMemo)

  if (breakdown.meal >= 80) {
    return { label: '食事', text: '主食・主菜・副菜のバランスが取れた良い食事です。', positive: true }
  }
  if (breakdown.meal >= 60) {
    const text = gaps.length > 0 ? `${gaps.join('・')}を加えるとさらにバランスが良くなります。` : 'バランスは良好です。'
    return { label: '食事', text, positive: true }
  }
  const parts = []
  if (gaps.length > 0) parts.push(`${gaps.join('・')}が不足しているようです`)
  if (junk) parts.push('ジャンクフードや間食が多いようです')
  return {
    label: '食事',
    text: parts.length > 0 ? `${parts.join('。')}。バランスよく取り入れましょう。` : '食事バランスを見直しましょう。',
    positive: false,
  }
}

// 記録ごとに歩数・睡眠・体重・食事の4項目すべてにコメントを付ける
function getCategoryComments(breakdown, record, profile) {
  return [
    getStepsComment(breakdown, record),
    getSleepComment(breakdown, record),
    getWeightComment(breakdown, record, profile),
    getMealComment(breakdown, record),
  ]
}

const FIELD_ORDER = ['date', 'steps', 'sleepHours', 'weight', 'mealMemo']

function getPreviousDateStr(dateStr) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

const CHART_MAX_DAYS = 10

function getDailyScores(records, profile, limit = CHART_MAX_DAYS) {
  const points = records
    .map((r) => ({ date: r.date, score: calcHealthScore(r, profile).total }))
    .filter((p) => p.score != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  return points.slice(-limit)
}

const TABS = [
  { key: 'add', label: '記録を追加' },
  { key: 'list', label: '記録一覧' },
  { key: 'chart', label: 'スコアの推移' },
  { key: 'profile', label: 'プロフィール設定' },
  { key: 'backup', label: 'バックアップ' },
]

function App() {
  const [records, setRecords] = useState(loadRecords)
  const [profile, setProfile] = useState(loadProfile)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [view, setView] = useState('add')
  const [lastResult, setLastResult] = useState(null)
  const [profileSaved, setProfileSaved] = useState(false)
  const fieldRefs = useRef({})
  const importInputRef = useRef(null)
  const profileSavedTimeoutRef = useRef(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  }, [records])

  useEffect(() => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  }, [profile])

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => b.date.localeCompare(a.date)),
    [records],
  )

  const idealWeight = useMemo(() => calcIdealWeight(profile), [profile])

  const dailyScorePoints = useMemo(
    () => getDailyScores(records, profile),
    [records, profile],
  )

  const handleExport = () => {
    const data = { profile, records, exportedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `health-app-backup-${todayStr()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportClick = () => {
    importInputRef.current?.click()
  }

  const handleImportFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        if (Array.isArray(data.records)) setRecords(data.records)
        if (data.profile) setProfile({ ...emptyProfile, ...data.profile })
      } catch {
        window.alert('ファイルの読み込みに失敗しました。正しいバックアップファイルか確認してください。')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleNavClick = (tab) => {
    setLastResult(null)
    setView(tab)
  }

  const handleProfileChange = (e) => {
    const { name, value } = e.target
    setProfile((p) => ({ ...p, [name]: value }))
    setProfileSaved(false)
  }

  const handleProfileSave = () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    setProfileSaved(true)
    clearTimeout(profileSavedTimeoutRef.current)
    profileSavedTimeoutRef.current = setTimeout(() => setProfileSaved(false), 2500)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const handleFieldKeyDown = (e, name) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const nextName = FIELD_ORDER[FIELD_ORDER.indexOf(name) + 1]
    if (nextName) {
      fieldRefs.current[nextName]?.focus()
    } else {
      fieldRefs.current.submit?.focus()
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.date) return

    if (editingId) {
      setRecords((rs) =>
        rs.map((r) => (r.id === editingId ? { ...form, id: editingId } : r)),
      )
      setEditingId(null)
      setForm(emptyForm)
      setView('list')
      return
    }

    const existing = records.find((r) => r.date === form.date)
    const newRecord = existing ? { ...form, id: existing.id } : { ...form, id: crypto.randomUUID() }

    setRecords((rs) =>
      existing ? rs.map((r) => (r.id === existing.id ? newRecord : r)) : [...rs, newRecord],
    )

    const previousDateStr = getPreviousDateStr(form.date)
    const previousRecord = records.find((r) => r.date === previousDateStr) ?? null
    const breakdown = calcHealthScore(newRecord, profile)
    const comments = getCategoryComments(breakdown, newRecord, profile)
    const previousBreakdown = previousRecord ? calcHealthScore(previousRecord, profile) : null

    setLastResult({ record: newRecord, breakdown, comments, previousDateStr, previousBreakdown })
    setForm(emptyForm)
  }

  const handleEdit = (record) => {
    setForm({
      date: record.date,
      steps: record.steps,
      sleepHours: record.sleepHours,
      weight: record.weight ?? '',
      mealMemo: record.mealMemo,
    })
    setEditingId(record.id)
    setLastResult(null)
    setView('add')
  }

  const handleDelete = (id) => {
    setRecords((rs) => rs.filter((r) => r.id !== id))
    if (editingId === id) {
      setEditingId(null)
      setForm(emptyForm)
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setForm(emptyForm)
    setView('list')
  }

  const handleGoToList = () => {
    setLastResult(null)
    setView('list')
  }

  return (
    <>
      <h1>健康管理アプリ</h1>
      <p className="subtitle">プロフィールを設定して、毎日の歩数・睡眠・食事から健康スコアをチェックしよう</p>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={view === t.key ? 'tab active' : 'tab'}
            onClick={() => handleNavClick(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {view === 'profile' && (
        <section className="card">
          <h2>プロフィール設定</h2>
          <div className="profile-form">
            <label>
              性別
              <select name="gender" value={profile.gender} onChange={handleProfileChange}>
                <option value="">選択してください</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
                <option value="other">その他</option>
              </select>
            </label>
            <label>
              年齢
              <input
                type="number"
                name="age"
                min="0"
                placeholder="例: 30"
                value={profile.age}
                onChange={handleProfileChange}
              />
            </label>
            <label>
              身長 (cm)
              <input
                type="number"
                name="height"
                min="0"
                step="0.1"
                placeholder="例: 165"
                value={profile.height}
                onChange={handleProfileChange}
              />
            </label>
            <label>
              体重 (kg)
              <input
                type="number"
                name="weight"
                min="0"
                step="0.1"
                placeholder="例: 60.5"
                value={profile.weight}
                onChange={handleProfileChange}
              />
            </label>
          </div>
          {idealWeight != null && (
            <p className="profile-hint">
              適正体重の目安: 約{idealWeight.toFixed(1)} kg
              {hasValue(profile.weight) &&
                ` (現在との差: ${Number(profile.weight) - idealWeight >= 0 ? '+' : ''}${(
                  Number(profile.weight) - idealWeight
                ).toFixed(1)} kg)`}
            </p>
          )}
          <p className="profile-hint">
            記録に体重を入力しなかった日は、この体重が代わりに使用されます。
          </p>
          <div className="profile-save">
            <button type="button" onClick={handleProfileSave}>
              保存する
            </button>
            {profileSaved && <span className="profile-saved-message">✓ 保存しました</span>}
          </div>
        </section>
      )}

      {view === 'backup' && (
        <section className="card">
          <h2>データのバックアップ</h2>
          <p className="backup-hint">
            記録はブラウザ内にのみ保存されています。機種変更やブラウザデータ削除に備えて、定期的にバックアップしましょう。
          </p>
          <div className="backup-actions">
            <button type="button" onClick={handleExport}>
              エクスポート
            </button>
            <button type="button" className="secondary" onClick={handleImportClick}>
              インポート
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              hidden
            />
          </div>
        </section>
      )}

      {view === 'chart' && (
        <section className="card">
          <h2>健康スコアの推移</h2>
          <p className="chart-hint">直近{CHART_MAX_DAYS}日分の日次スコアを表示します。</p>
          {dailyScorePoints.length > 1 ? (
            <ScoreChart points={dailyScorePoints} />
          ) : (
            <p className="empty">グラフ表示には2日分以上の記録が必要です。</p>
          )}
        </section>
      )}

      {view === 'add' &&
        (lastResult ? (
          <section className="card result-card">
            <h2>記録を保存しました</h2>
            <div className="record-date">{lastResult.record.date}</div>
            <RecordSummary
              record={lastResult.record}
              breakdown={lastResult.breakdown}
              comments={lastResult.comments}
              profile={profile}
            />
            {lastResult.previousBreakdown ? (
              <p
                className={`day-diff ${
                  lastResult.breakdown.total - lastResult.previousBreakdown.total >= 0 ? 'diff-up' : 'diff-down'
                }`}
              >
                前日({lastResult.previousDateStr})比:{' '}
                {lastResult.breakdown.total - lastResult.previousBreakdown.total >= 0 ? '+' : ''}
                {lastResult.breakdown.total - lastResult.previousBreakdown.total}点 (前日は
                {lastResult.previousBreakdown.total}点)
              </p>
            ) : (
              <p className="day-diff-none">前日({lastResult.previousDateStr})の記録はありません</p>
            )}
            <button type="button" onClick={handleGoToList}>
              記録一覧へ
            </button>
          </section>
        ) : (
          <section className="card">
            <h2>{editingId ? '記録を編集' : '今日の記録を追加'}</h2>
            <form onSubmit={handleSubmit} className="record-form">
              <label>
                日付
                <input
                  ref={(el) => (fieldRefs.current.date = el)}
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  onKeyDown={(e) => handleFieldKeyDown(e, 'date')}
                  required
                />
              </label>
              <label>
                歩数
                <input
                  ref={(el) => (fieldRefs.current.steps = el)}
                  type="number"
                  name="steps"
                  min="0"
                  placeholder="例: 8000"
                  value={form.steps}
                  onChange={handleChange}
                  onKeyDown={(e) => handleFieldKeyDown(e, 'steps')}
                />
              </label>
              <label>
                睡眠時間 (h)
                <input
                  ref={(el) => (fieldRefs.current.sleepHours = el)}
                  type="number"
                  name="sleepHours"
                  step="0.5"
                  min="0"
                  placeholder="例: 7.5"
                  value={form.sleepHours}
                  onChange={handleChange}
                  onKeyDown={(e) => handleFieldKeyDown(e, 'sleepHours')}
                />
              </label>
              <label>
                体重 (kg)
                <input
                  ref={(el) => (fieldRefs.current.weight = el)}
                  type="number"
                  name="weight"
                  min="0"
                  step="0.1"
                  placeholder={hasValue(profile.weight) ? `未入力時: ${profile.weight}kg` : '例: 60.5'}
                  value={form.weight}
                  onChange={handleChange}
                  onKeyDown={(e) => handleFieldKeyDown(e, 'weight')}
                />
              </label>
              <label className="full-width">
                食事メモ
                <textarea
                  ref={(el) => (fieldRefs.current.mealMemo = el)}
                  name="mealMemo"
                  rows="2"
                  placeholder="例: 朝はパン、昼は定食、夜は鍋"
                  value={form.mealMemo}
                  onChange={handleChange}
                  onKeyDown={(e) => handleFieldKeyDown(e, 'mealMemo')}
                />
              </label>
              <div className="form-actions">
                <button ref={(el) => (fieldRefs.current.submit = el)} type="submit">
                  {editingId ? '更新する' : '追加する'}
                </button>
                {editingId && (
                  <button type="button" className="secondary" onClick={handleCancelEdit}>
                    キャンセル
                  </button>
                )}
              </div>
            </form>
          </section>
        ))}

      {view === 'list' && (
        <section className="card">
          <h2>記録一覧</h2>
          {sortedRecords.length === 0 ? (
            <p className="empty">まだ記録がありません。</p>
          ) : (
            <ul className="record-list">
              {sortedRecords.map((r) => {
                const breakdown = calcHealthScore(r, profile)
                const comments = getCategoryComments(breakdown, r, profile)
                return (
                  <li key={r.id} className="record-item">
                    <div className="record-header">
                      <span className="record-date">{r.date}</span>
                      <div className="record-actions">
                        <button type="button" onClick={() => handleEdit(r)}>
                          編集
                        </button>
                        <button type="button" className="danger" onClick={() => handleDelete(r.id)}>
                          削除
                        </button>
                      </div>
                    </div>
                    <RecordSummary record={r} breakdown={breakdown} comments={comments} profile={profile} />
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </>
  )
}

function RecordSummary({ record, breakdown, comments, profile }) {
  const label = breakdown.total != null ? scoreLabel(breakdown.total) : null
  const weight = resolveWeight(record, profile)
  return (
    <>
      <div className="record-stats">
        <span>歩数: {record.steps !== '' ? `${record.steps} 歩` : '-'}</span>
        <span>睡眠: {record.sleepHours !== '' ? `${record.sleepHours} h` : '-'}</span>
        <span>
          体重:{' '}
          {hasValue(weight)
            ? `${weight} kg${hasValue(record.weight) ? '' : '(プロフィール)'}`
            : '-'}
        </span>
      </div>
      {label && (
        <div className={`health-score ${label.className}`}>
          <span className="health-score-value">健康スコア: {breakdown.total}</span>
          <span className="health-score-label">{label.text}</span>
        </div>
      )}
      <div className="score-breakdown">
        <span>歩数: {breakdown.steps ?? '-'}</span>
        <span>睡眠: {breakdown.sleep ?? '-'}</span>
        <span>体重: {breakdown.weight ?? '-'}</span>
        <span>食事: {breakdown.meal}</span>
      </div>
      {record.mealMemo && <p className="record-memo">{record.mealMemo}</p>}
      <ul className="comments">
        {comments.map((c) => (
          <li key={c.label} className={c.positive ? 'comment-positive' : 'comment-negative'}>
            <span className="comment-label">{c.label}</span>
            {c.text}
          </li>
        ))}
      </ul>
    </>
  )
}

function formatChartDate(dateStr) {
  const [, month, day] = dateStr.split('-')
  return `${month}/${day}`
}

function ScoreChart({ points }) {
  const width = 640
  const height = 220
  const padLeft = 34
  const padRight = 20
  const padTop = 14
  const padBottom = 30
  const plotWidth = width - padLeft - padRight
  const plotHeight = height - padTop - padBottom
  const yTicks = [0, 50, 100]

  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? padLeft
        : padLeft + (i / (points.length - 1)) * plotWidth
    const y = padTop + plotHeight - (p.score / 100) * plotHeight
    return { x, y, ...p }
  })

  const pathD = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="score-chart" role="img">
      {yTicks.map((t) => {
        const y = padTop + plotHeight - (t / 100) * plotHeight
        return (
          <g key={t}>
            <line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text x={padLeft - 8} y={y + 4} fontSize="11" textAnchor="end" fill="var(--text)">
              {t}
            </text>
          </g>
        )
      })}
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {coords.map((c) => (
        <g key={c.date}>
          <circle cx={c.x} cy={c.y} r="3" fill="var(--accent)">
            <title>
              {c.date}: {c.score}点
            </title>
          </circle>
          <text
            x={c.x}
            y={height - padBottom + 16}
            fontSize="10"
            textAnchor="middle"
            fill="var(--text)"
          >
            {formatChartDate(c.date)}
          </text>
        </g>
      ))}
    </svg>
  )
}

export default App
