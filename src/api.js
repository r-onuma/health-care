// バックエンドAPIとの通信層。
// VITE_API_BASE_URL が設定されていればAPI保存モード、なければ従来のlocalStorage保存モードで動く。
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export const apiEnabled = Boolean(API_BASE)

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `APIエラー (${res.status})`)
  }
  return res.json()
}

export function fetchRecords() {
  return request('/api/records')
}

export function fetchProfile() {
  return request('/api/profile')
}

export function saveRecord(record) {
  return request('/api/records', { method: 'PUT', body: JSON.stringify(record) })
}

export function deleteRecord(id) {
  return request(`/api/records/${id}`, { method: 'DELETE' })
}

export function saveProfile(profile) {
  return request('/api/profile', { method: 'PUT', body: JSON.stringify(profile) })
}

export function importAll(data) {
  return request('/api/import', { method: 'PUT', body: JSON.stringify(data) })
}
