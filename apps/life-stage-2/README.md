# LIFE STAGE 2.0 ワーク v1.0

1つのアプリで「全メンバー向け」を基本とし、**サーバーに登録されたロールが「コアメンバー」のアカウントにだけ**コアメンバー向けタブが表示されます。

- 静的Web/PWA（ビルド不要）：`index.html` / `app.js` / `config.js` / `vendor/supabase.js`
- バックエンド：Supabase（認証・DB・RLS・Edge Function）

## コアメンバー限定の仕組み
| 層 | 内容 |
|---|---|
| ログイン | メールのログインリンク（パスワード不要・Supabase Auth） |
| ロール | `ls_profiles.role` = member / core / admin。新規登録は必ず member。本人はロールを変更できない（列権限＋RLS） |
| 表示 | ログイン後サーバーから取得したロールが core/admin の時だけ、コース切替タブとコア画面を描画 |
| データ | `ls_work` の `program='core'` 行はRLSで core/admin 本人のみ読み書き可。画面を改造してもデータは取得できない |
| 付与 | 管理者がマイページ「管理：メンバーのロール」でメールアドレスを指定して変更（`ls_set_role`） |
| 管理者でも | 他人のワーク本文は読めない（プロフィール一覧のみ） |

RLSの検証：`npm i @electric-sql/pglite && node tests/rls.test.mjs`（14項目PASS確認済み）

## AI分析
1. **基本：コピペ方式** — AIタブで記録から依頼文を自動作成 →「依頼文をコピー」→ 各自のAI（ChatGPT/Claude/Gemini等）に貼り付け → 回答を貼り戻して「メモとして保存」。
2. **システムAI（任意）** — Edge Function `ls-ai` が Anthropic API に接続。ログイン必須・コアの依頼はコアのみ・1日上限（既定20回）・APIキーはサーバー側のみ。`config.js` の `aiEnabled: true` でボタン表示。

## 公開までの手順（初回のみ）
1. https://supabase.com で新規プロジェクト作成（東京リージョン推奨）
2. SQL Editor で `supabase/migrations/0001_life_stage.sql` を実行
3. Authentication → URL Configuration：Site URL と Redirect URLs に公開URL（例 `https://yuuta-suwa.github.io/ticket-AI/`）を設定
   - 招待制にする場合：Providers → Email で新規サインアップをOFF、Users → Invite user で招待
4. Project Settings → API の **Project URL** と **anon public key** を `config.js` に記入（公開してよい値。service_role キーは絶対に書かない）
5. 自分で1度ログイン → SQL Editor で管理者化：`update public.ls_profiles set role='admin' where email='あなたのメール';`
6. 以降はアプリのマイページからメンバーをコアメンバーに変更
7. システムAIを使う場合：
   ```
   supabase functions deploy ls-ai --project-ref <ref>
   supabase secrets set ANTHROPIC_API_KEY=... LS_ALLOWED_ORIGIN=https://yuuta-suwa.github.io --project-ref <ref>
   ```
   その後 `config.js` の `aiEnabled` を `true` に。
8. 静的ファイル（index.html, app.js, config.js, sw.js, manifest.webmanifest, icon.svg, vendor/）をGitHub Pages等に配置

`config.js` が空の間は「ローカル試用モード」（ログインなし・端末内保存・コアタブ非表示）で動作します。

## ローカル確認
`cd apps/life-stage-2 && python3 -m http.server 8080` → http://localhost:8080

## 残っている確認事項
- 教材本文は仕様書の構造から作成した暫定文（教材責任者の確認が必要）
- PDFはブラウザ印刷による保存／実機（iOS/Android）表示確認
- 退会・データ削除は運営対応（Supabaseでユーザー削除するとデータも連鎖削除）
