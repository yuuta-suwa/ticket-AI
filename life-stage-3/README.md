# LIFE STAGE 3.0 — Gate-0（ChatGPT Sites 互換検証）

Claude Code で作ったアプリが ChatGPT Sites で動くかを確かめる最小構成。既存の DEAL HUNTER AI と LIFE STAGE 2.0（`feature/life-stage-2` ブランチ）には手を加えていない。

## 構成
```
src/domain/        業務ルール（会員承認・目標・画像検証）。外部依存なし
src/application/   ユースケースと差し替え用インターフェース(ports.ts)
src/adapters/http/ 標準 Request/Response のAPIとHTML配信（実行環境に依存しない）
src/adapters/sites/ Sites固有: Worker入口・D1・R2・本人情報ヘッダー  ← 移植時はここだけ差し替える
src/adapters/dev/  ローカル専用の疑似サインイン（DEV_AUTH=1 かつ localhost のみ）
src/web/           全会員共通のHOME画面（スマホ優先・ビルド不要）
migrations/        D1スキーマ
.openai/hosting.json  Sitesの接続名（d1: DB / r2: FILES）。project_id は Sites が付与するので手で書かない
```

## 確認できた公式仕様（learn.chatgpt.com/docs/sites/*、2026-11-06に確認）
- サインインとサインアウトは、Sitesが用意するパス `/signin-with-chatgpt` と `/signout-with-chatgpt` で行う
- 本人情報は `oai-authenticated-user-email` ヘッダーで届く（`oai-authenticated-user-full-name` は任意）。権限の判定はサーバー側で行う
- D1は1サイトあたり10GB、R2は容量の固定上限なし。D1/R2の接続名は `.openai/hosting.json` に書き、秘密情報は書かない
- 既存のプロジェクトは、ChatGPTに互換性の確認と公開準備を依頼して取り込む

## ローカル実行
```bash
npm ci
npm test            # ユニットテストとHTTPテスト（D1はnode:sqliteで実SQL、R2はメモリ上）
npm run typecheck
cp .dev.vars.example .dev.vars && npm run db:migrate:local
npm run dev         # wrangler/workerd 上で起動 → http://localhost:8787
npm run smoke       # 起動中の環境に対してE2Eスモークテストを実行
```

## 設定値（Sitesの設定画面で入力する。Gitには入れない）
- `ADMIN_EMAILS`：初代管理者の候補メール（カンマ区切り）。**有効な管理者が1人もいない時だけ**、このメールで初回サインインした人が管理者になる。2人目以降は自動では管理者にならない
- `DEV_AUTH`：本番では絶対に設定しない

## API（Gate-0）
- `GET /health`（認証不要・会員情報なし）
- `GET /api/me`、`GET/PUT /api/goal`、`GET/POST /api/images`、`GET/DELETE /api/images/:id`
- 管理者のみ：`GET /api/admin/pending`、`POST /api/admin/members/:id/status`（pending/active/suspended/cancelled）、`GET /api/admin/backup`、`POST /api/admin/restore`

## D1テーブル
`users` / `member_eligibility` / `role_grants` / `life_goals` / `file_objects` / `audit_logs`（spec/03 の論理設計に準拠）

詳しい検証記録と未検証の事項は [docs/GATE0.md](docs/GATE0.md)、判断の記録は [DECISIONS.md](DECISIONS.md) を参照。
