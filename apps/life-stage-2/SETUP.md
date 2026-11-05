# LIFE STAGE 2.0 公開セットアップ手順（クリック手順）

所要時間：合計 約20〜30分。上から順に進めてください。

---

## STEP 1｜GitHub Pages を有効にする（約2分）

1. ブラウザで https://github.com/yuuta-suwa/ticket-AI を開く
2. 上部メニューの **Settings**（歯車）をクリック
3. 左メニューの **Pages** をクリック
4. 「Build and deployment」の **Source** を **Deploy from a branch** にする
5. **Branch** を `gh-pages`、フォルダを `/ (root)` にして **Save**
6. 1〜3分待ってページを再読み込みすると、上部に
   「Your site is live at https://yuuta-suwa.github.io/ticket-AI/」と表示されます
7. そのURLをスマホで開き、LIFE STAGE のオープニングが出れば成功

> この時点では「ローカル試用モード」（ログインなし・端末内保存・コアタブ非表示）です。

---

## STEP 2｜Supabase プロジェクトを作る（約5分）

1. https://supabase.com を開き **Start your project** → GitHubアカウント等でサインアップ
2. **New project** をクリック
   - Name：`life-stage`
   - Database Password：**Generate a password** → 安全な場所に控える
   - Region：**Northeast Asia (Tokyo)**
   - Plan：Free でOK（初期50人規模なら十分）
3. **Create new project** → 1〜2分待つ

## STEP 3｜データベースを作る（約2分）

1. 左メニュー **SQL Editor** → **New query**
2. GitHub で `apps/life-stage-2/supabase/migrations/0001_life_stage.sql` を開き（ブランチ `feature/life-stage-2`）、右上の **コピー** ボタンで全文コピー
3. SQL Editor に貼り付けて **Run**
4. 「Success. No rows returned」と出れば完了

## STEP 4｜ログイン設定（約3分）

1. 左メニュー **Authentication** → **URL Configuration**
   - **Site URL**：`https://yuuta-suwa.github.io/ticket-AI/`
   - **Redirect URLs** → **Add URL**：`https://yuuta-suwa.github.io/ticket-AI/` → Save
2. （推奨）**Authentication → Emails → Magic Link** のテンプレートを日本語に：
   - Subject：`【LIFE STAGE】ログイン用リンク`
   - Body：
     ```html
     <p>LIFE STAGE 2.0 へのログインリンクです。</p>
     <p><a href="{{ .ConfirmationURL }}">ここをタップしてログイン</a></p>
     <p>心当たりがない場合はこのメールを破棄してください。</p>
     ```
   同様に **Confirm signup** も同じ文面にしておくと初回ログイン時も日本語になります。
3. 誰でも登録できる状態を避けたい（招待制）場合：
   **Authentication → Sign In / Providers → Email** で「Allow new users to sign up」を **OFF**。
   メンバーは **Authentication → Users → Add user → Send invitation** で招待します。

> 無料プランの標準メール送信は1時間あたりの送信数に上限があります。人数が増えたら
> **Authentication → Emails → SMTP Settings** で独自のメール送信（例：Resend、SendGrid）を設定してください。

## STEP 5｜アプリに接続情報を入れる（約3分）

1. Supabase 左下 **Project Settings** → **API**（または **Data API / API Keys**）
2. 次の2つをコピー
   - **Project URL**（`https://xxxx.supabase.co`）
   - **anon public** キー（`eyJ...` で始まる長い文字列）
   - ※ **service_role** キーは絶対に使わない・誰にも渡さない
3. 方法A（おすすめ）：この2つを Claude に送る → `config.js` を更新して再公開します
4. 方法B（自分で）：GitHub で ブランチを `gh-pages` に切り替え → `config.js` を開く → 鉛筆アイコン（Edit）
   ```js
   supabaseUrl: "https://xxxx.supabase.co",
   supabaseAnonKey: "eyJ....",
   ```
   を記入 → **Commit changes**。1〜3分で反映されます。

## STEP 6｜管理者とコアメンバーの設定（約3分）

1. 公開URLを開き、自分のメールでログイン（届いたメールのリンクを**同じ端末**で開く）
2. Supabase **SQL Editor** で次を実行（メールは自分のものに置換）
   ```sql
   update public.ls_profiles set role = 'admin' where email = 'あなたのメール@example.com';
   ```
3. アプリを再読み込み → マイページに「管理：メンバーのロール」が表示されます
4. コアメンバーにしたい人に **一度ログインしてもらう** → マイページの管理欄でその人のメールを入力 →「コアメンバー」→ **変更**
5. その人がアプリを再読み込みすると、上部に「コアメンバー」タブが表示されます

確認チェック：
- [ ] 一般メンバーのアカウントではコアタブが表示されない
- [ ] コアメンバーのアカウントでは表示され、KPI・実践ログが保存できる
- [ ] 別の端末で同じメールでログインすると続きが表示される

---

## STEP 7（任意）｜システムAI分析をつなぐ（約10分）

コピペ方式だけで運用する場合は不要です。

1. https://console.anthropic.com で APIキーを作成（利用料がかかります。Billing で上限を設定推奨）
2. Supabase 左メニュー **Edge Functions** → **Deploy a new function** → **Via Editor**
   - Function name：`ls-ai`
   - GitHub の `apps/life-stage-2/supabase/functions/ls-ai/index.ts` の全文を貼り付け → **Deploy**
   - 「Verify JWT」は **ON** のまま
3. **Edge Functions → Secrets** で追加
   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | 作成したAPIキー（チャットには貼らない） |
   | `LS_ALLOWED_ORIGIN` | `https://yuuta-suwa.github.io` |
   | `LS_AI_DAILY_LIMIT` | `20`（1人1日あたりの回数・任意） |
4. Claude に「システムAIをONに」と伝える（または `config.js` の `aiEnabled` を `true` に）

---

## うまくいかない時

| 症状 | 確認すること |
|---|---|
| 404 が出る | STEP 1 の Branch が `gh-pages` / `(root)` か。数分待つ |
| ログインメールが届かない | 迷惑メールフォルダ。送信上限（1時間あたり）に達していないか |
| リンクを開いてもログイン画面に戻る | STEP 4 の Site URL / Redirect URLs が公開URLと完全一致しているか（末尾の `/` も） |
| コアタブが出ない | SQL Editor で `select email, role from ls_profiles;` を実行し role が `core` か。アプリを再読み込み |
| 「データを読み込めませんでした」 | STEP 3 のSQLが成功しているか |
| 古い画面のまま | ブラウザで再読み込みを2回（画面キャッシュ更新のため） |
