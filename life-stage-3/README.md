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
npm run build       # Sites向けの成果物を dist/ に作成（公開はしない。Sitesが保存・公開時に使う）
```

## 設定値（Sitesの設定画面で入力する。Gitには入れない）
- `ADMIN_EMAILS`：初代管理者の候補メール（カンマ区切り）。**有効な管理者が1人もいない時だけ**、このメールで初回サインインした人が管理者になる。2人目以降は自動では管理者にならない
- `DEV_AUTH`：本番では絶対に設定しない

## 画面（下部5タブ）
- HOME：今の自分・今日のミッション（最大3件）・前進（今日/昨日、今週/先週）・レベル・自動提案（ルール）
- MY GOAL：目的達成10ステップ（途中保存・版管理・完了条件）・LIFE MAP・次のサイクル
- PROJECTS / COMMUNITY：準備中（契約・法務の確認後に BUILD-C / D で実装）
- MY PAGE：プロフィール・XP履歴・成長履歴・週次レビュー・MANAGEMENT（管理者のみ）
- HOME から：DAILY MISSION・週次レビュー・AI LIFE COACH（APIを呼ばない相談文コピー方式）

## 構成の補足
- 画面：`src/web/client/`（TypeScript・フレームワークなし）を esbuild で1ファイルにまとめ、`/app.js` として配信（`npm run gen`）。インラインスクリプト禁止のCSP
- `src/web/generated/` は自動生成（Gitに入れない）。`npm test` / `typecheck` / `dev` / `build` の前に自動で作られる

## D1テーブル
- 0001：`users` / `member_eligibility` / `role_grants` / `life_goals` / `file_objects` / `audit_logs`
- 0002：`goal_step_versions` / `life_stages` / `life_stage_events` / `missions` / `mission_logs` / `xp_rule_versions` / `xp_ledger` / `weekly_reviews` / `coach_notes`
- 適用済みのマイグレーションは変更しない。変更は新しい番号のファイルを追加する

詳しい検証記録と未検証の事項は [docs/GATE0.md](docs/GATE0.md)、判断の記録は [DECISIONS.md](DECISIONS.md) を参照。
