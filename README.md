# 健康管理アプリ (health-care)

歩数・睡眠時間・体重・食事内容を記録し、内容から算出した健康スコアで生活習慣を振り返るアプリです。

- **フロントエンド**: React (Vite)
- **バックエンド**: Node.js (Express) + PostgreSQL — `server/`
- バックエンド未接続時は localStorage 保存のスタンドアロンモードで動作します

詳しい仕様は [SPEC.md](./SPEC.md)(または [SPEC.html](./SPEC.html))を参照してください。

## 開発(フルスタック)

### 1. PostgreSQL を用意

ローカルにPostgreSQLをインストールし、ユーザーとDBを作成します(devcontainerでの例):

```bash
sudo apt-get install -y postgresql
sudo service postgresql start
sudo su postgres -c "psql -c \"CREATE USER healthapp WITH PASSWORD 'healthapp-local';\" -c 'CREATE DATABASE healthcare OWNER healthapp;'"
```

### 2. APIサーバーを起動

```bash
cd server
npm install
DATABASE_URL='postgres://healthapp:healthapp-local@127.0.0.1:5432/healthcare' npm run dev
# → http://localhost:3001 (テーブルは起動時に自動作成)
```

環境変数は [server/.env.example](./server/.env.example) を参照。

### 3. フロントエンドを起動

```bash
npm install
npm run dev
# → http://localhost:5173
```

開発時のAPI接続先は [.env.development](./.env.development) の `VITE_API_BASE_URL` で指定します。
この値を空にすると localStorage 保存モードになります。

## API エンドポイント

| メソッド | パス | 役割 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック |
| GET | `/api/records` | 記録の一覧取得 |
| PUT | `/api/records` | 記録の保存(idでupsert、日付重複は409) |
| DELETE | `/api/records/:id` | 記録の削除 |
| GET / PUT | `/api/profile` | プロフィールの取得・保存 |
| PUT | `/api/import` | バックアップJSONの一括インポート(全置換) |

`API_TOKEN` を設定すると書き込み系リクエストに `Authorization: Bearer <token>` が必要になります。

## デプロイ

フロントは GitHub Pages、APIは Render、DBは Neon の無料枠を使う構成です。

### 1. DB: Neon (https://neon.tech)

1. アカウント作成 → プロジェクト作成(リージョンは Asia Pacific 推奨)
2. 接続文字列(`postgres://...?sslmode=require`)をコピー

### 2. API: Render (https://render.com)

1. アカウント作成 → **New > Blueprint** でこのリポジトリを接続([render.yaml](./render.yaml) が読み込まれる)
2. 環境変数 `DATABASE_URL` にNeonの接続文字列を設定
3. デプロイ完了後、`https://<サービス名>.onrender.com/api/health` で `{"ok":true}` を確認

※ 無料プランは15分アクセスがないとスリープし、次のリクエストで起き上がるまで数十秒かかります。

### 3. フロント: GitHub Pages

1. リポジトリの **Settings > Secrets and variables > Actions > Variables** で
   `VITE_API_BASE_URL` に RenderのURL(例: `https://health-care-api.onrender.com`)を設定
2. mainにプッシュすると自動デプロイ(この変数が未設定の間は localStorage モードでビルドされる)

### 既存データの移行

旧localStorage版で「バックアップ > エクスポート」したJSONを、API版の「バックアップ > インポート」で取り込むとサーバーに移行されます。

## ビルド

```bash
npm run build
```
