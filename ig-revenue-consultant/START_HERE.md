# Instagram収益最大化AIコンサル｜Claude引き継ぎ v3
作成日：2026-11-01（日本時間）

## この一式でできること
現在の稼働版のソースを読み、保存・承認・金額計算を引き継ぎながら、「自分の状況を理解してくれる専属コンサル」の体験へ刷新する。今回は引き継ぎと設計・デザイン案の作成であり、新デザインを現在の本番URLへ適用したものではない。

## 最短の始め方：Mac / iMac
1. ZIPを解凍する。
2. Claude Desktopの **Code** で、この `IG_REVENUE_CONSULTANT_V3_HANDOFF` フォルダを選ぶ。通常のチャットへのZIP添付だけで、本番の認証・DB・公開まで移るとは考えない。
3. `00_CLAUDE_CODE_START_PROMPT.md` の全文を最初の指示として渡す。`CLAUDE.md` も自動で参照できる位置にある。
4. 採用済みの2番「STRATEGY ATELIER」を使用する。画像は `reference/design/strategy-atelier.png` に同梱済み。`docs/DESIGN_SELECTION.md` と `docs/03_DESIGN_BRIEF.md`、トークンを実装基準とする。
5. Claudeに読み取り→起動確認→実装→検証まで継続させる。設定情報は、そのサービスの正規画面やローカルの環境変数から入力し、チャットへ秘密鍵を貼らない。

ターミナルで使う場合は、解凍したフォルダで `claude` を開始して同じプロンプトを渡す。初期の開発対象は `source/`。本番を変更する認証情報は含んでいない。

## 通常のClaudeチャットしか使わない場合
`00_CLAUDE_CHAT_DESIGN_PROMPT.md` を使う。まず画面・対話・導線を確認するプロトタイプを作る。実アカウント接続、永続DB、セキュアな本番公開は、Codeまたは適切な開発環境で別途実装・検証する。チャットで見える画面が完成しても、そのまま事業運用まで完了したことにはならない。

## お渡ししたもの
- `source/`：稼働版と同じコミットの追跡ソース。依存ライブラリ本体、Git認証、ユーザー実績、DB、APIキーは含めない。
- `source-snapshot-manifest.json`：元コミット、各ファイルのSHA-256・サイズ。`source/CLAUDE.md` は引き継ぎのための追加ファイルで、元ソースのハッシュ対象外。
- `docs/01_CURRENT_STATUS.md`：何ができて、何が未実装か。
- `docs/02_CONSULTING_PRODUCT_PRD.md`：収益コンサルとしての役割・導線・優先順位。
- `docs/03_DESIGN_BRIEF.md`：画面ごとの構成、3つの見た目、余白・文字・動き・モバイルの基準。
- `docs/04_AI_CONSULTING_SPEC.md`：AIの入力・出力・根拠・反証・改善ループ。
- `docs/05_PORTABILITY_AND_SECURITY.md`：Sitesからの移植、認証、DB、鍵の取り扱い。
- `docs/06_PLAN_AND_ACCEPTANCE.md`：実装順と合格条件。
- `docs/07_VALIDATION.md`：今回確認できたことと未検証部分。
- `docs/design-tokens.json`、`docs/consulting-report-v2.schema.json`：新仕様案。まだアプリへ接続されていない。
- `docs/fixtures/consulting-cases.json`：架空の検証ケース。本番データではない。
- `reference/requirements-v1.1.md`：既存の詳細要件。全項目が実装済みという意味ではない。
- `reference/design/`：ローカル保存先を取得できた場合の生成デザイン案。収益や表示値は実績ではない。

## 最初に知っておくこと
**Claude Codeで作るための引き継ぎは可能。ただし既存URL・ログイン・DB・暗号化済み接続情報は、ZIPを開くだけでは引き継がれない。** UI刷新と本番移設を分けて進める。移設前に元サイトを削除せず、元の暗号鍵を上書きしない。

現行サイト：https://instagram-revenue-learning-os.suwayuuta.chatgpt.site/
現行コミット：`03a801ccd82d8aca8378554dfc61ec5104596032`

公式の開始手順（確認日2026-11-01）：
- https://code.claude.com/docs/en/overview
- https://support.claude.com/en/articles/14552382-your-first-day-in-claude-code
