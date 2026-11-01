# 納品報告｜2026-11-01｜コード v0.6.0

対象：AI_Company_OS（v0.5.0 から継続。作り直しはせず、既存のID・履歴・資金正本・試験を再利用）
FRIDAY連携は対象外。支出方針は**無効・0円のまま**変更していない。本番公開・送信・実支出・定期タスク登録は行っていない。

## 0. 確認段階の区分（今回の到達点）

| 区分 | 状態 |
|---|---|
| 設計済み | 統合仕様（引継ぎ時点）＋今回の実装に合わせた本書 |
| 実装済み | 本人認証・管理API・許可・停止・外部実行プロトコル・調査〜実証契約・収益モデルv2・決済通知取り込み・利用/問い合わせ/費用/指標・優先キュー・知識出力・バックアップ/復元・スマホ画面・AI固定主体ツール |
| ローカル試験済み | 169件成功（既存109＋新規60）、型チェック、運営監査3シナリオ、Chromiumのスマホ画面エミュレーション11項目 |
| 外部テスト済み | **なし**（Stripe等のテスト環境は未接続。署名はStripe互換方式でローカル生成） |
| 本番接続済み | **なし** |
| スマホ実機確認済み | **なし**（iPhone 13サイズのChromiumエミュレーションのみ） |
| 実顧客・実視聴者の観察 | **なし** |
| 継続利用と収益性の実証 | **なし** |
| 実市場調査 | 1バッチ実施（検索抜粋レベル）。3候補とも不適格→**採用なし・追加調査**を記録 |

## 1. 実装した変更

新規モジュール（`AI_Company_OS/src/`）。すべて既存の `company.db`（単一SQLite）を共有し、別の財布・台帳を作っていない。

| ファイル | 内容 |
|---|---|
| `authority.mjs` | 本人パスフレーズ（scrypt）、サーバー側セッション（トークンはハッシュ保存）、CSRF、ログイン試行制限、再認証窓、判断カード（承認／操作の許可／重大例外を区別、対象の版とハッシュに拘束）、操作許可（対象・操作・内容ハッシュまたは検査可能な範囲・費用・回数・期限・取消）、冪等キー（変更と同一トランザクション）、全社停止の受付とworker確認、追加指示（許可や予算にならない） |
| `execution.mjs` | 外部実行：要求→許可検査→費用は既存`VentureLedger.reserve`で予約→直前再検査（取消・期限・停止・内容変更）→同じ操作IDで1回送信→照合。結果不明はUNKNOWNで予約保持、`reconcile`は同IDで照会のみ（再送経路なし）。再起動時のIN_FLIGHTはUNKNOWNへ |
| `research.mjs` | 媒体カタログ15種（YouTube・Instagram・TikTok・X・Threads・Reddit・フォーラム・検索・検索動向・アプリ/EC/ソフトのレビュー・競合・新製品/研究・統計・自社）と能力別の接続状態、調査バッチ（上限で自動停止）、取得試行（失敗/制限/未接続≠需要ゼロ）、原本と版付き観測（確認範囲必須、再取得は同一原本の新版）、元情報グループ（転載を独立根拠にしない）、条件の異なる指標の集計拒否、原本削除時の再確認、機会カードの版、部署評価（所属を名簿で検査）、決定的判定（禁止領域・権利・費用上限・提供不能を先に判定し点数で相殺しない）、採用なしを常に許可、実証契約の版とロック、事前登録版による評価、技術故障と市場反応不足の区別 |
| `commercial.mjs`（拡張） | v2 `registerModel/assessModel`：使用者と支払者の分離、6種の収益ストリーム、単価null＋理由、費用カテゴリ、`plan_completeness / experiment_readiness / operating_readiness / growth_evidence` の4判定。旧`register/assess`は互換維持（広告の阻害も従来どおり） |
| `operations.mjs` | 決済通知（Stripe互換署名・口座・test/live・イベントID重複排除・取引キー重複排除・返金の先着・契約状態の順不同・原本スナップショット照合）、利用イベント（customer/test/admin/monitor/bot）、問い合わせ（自動返信は解決にしない）、障害、費用（null＋理由、配賦比率合計1）、指標（CASH_CONTRIBUTION・CAC・FIRST_VALUE・SUPPORT_OVERDUE、算定不可はnull）、監視から健康観測を導出して既存`growthReadiness`へ投入、顧客データ消去（財務記録は仮名で保持） |
| `jobs.mjs` | RUN_CRITICAL＞RUN＞IMPROVE＞EXPLORE の永続キュー。RUN用の予約枠と重い処理の上限、停止中もRUN系は継続、外部操作を伴うリース切れは再実行せずNEEDS_RECONCILE |
| `knowledge.mjs` | 範囲（company/venture/customer）・区分・根拠・見直し期限付き知識、自己承認禁止、原本変更で再確認、Obsidianへ一方向出力（顧客範囲・機密は出力しない、手動編集は90_Conflictsへ退避） |
| `backup.mjs` | `VACUUM INTO`＋SHA-256マニフェスト、検査（期限切れ許可・結果不明操作・最終通知時刻）、別ファイルへの復元（停止状態で開始・全セッション失効・IN_FLIGHT→UNKNOWN、上書き禁止） |
| `runtime.mjs` | 全モジュールの結合、系譜トレース `lineage(experiment)`、撤退義務チェック `closeService` |
| `server.mjs`＋`ui/index.html` | スマホ管理API／画面（全社・機会・判断待ち・仕事・顧客品質・資金・接続知識）。未接続／不明／デモの明示、二重送信防止、オフライン時の操作無効化、停止の受付とworker確認、承認/許可/差戻しの区別 |
| `owner-cli.mjs` | 本人専用のローカル入口（パスフレーズ設定・調査方針・決済口座登録・全セッション失効・バックアップ/検査/復元）。HTTPやAIへは非公開 |
| `agent/lib/tools.ts` ほか | AI社員の固定主体ツール11種（調査開始・取得試行・観測・接続確認・機会提出・評価・判定・選定・実証契約・判断依頼・実行要求）を担当部署に配置。本人操作（方針・枠・許可発行・再開・復元）は含まない（試験A02で検査） |

既存コードへの変更は最小：`company.mjs` の安全書込み関数2つを export、`commercial.mjs` に v2 を追記のみ。既存109試験は無変更で成功。

## 2. 検証結果と証拠

| 項目 | 結果 | 証拠 |
|---|---|---|
| P0ベースライン（Node v24.22.2で再現） | 109/109、型チェック成功、監査3シナリオ | `review/p0-2026-11-01/` |
| 最終自動試験 | **169/169成功**、型チェック成功、監査成功 | `review/p4-2026-11-01/final-tests.txt` ほか |
| 受入マトリクス60件 | LOCAL_PASS 56、LOCAL_PASS_PARTIAL 3（A07・E02・U06）、NOT_RUN 1（E03） | `REBUILD_ACCEPTANCE_MATRIX.json`（更新前は `review/REBUILD_ACCEPTANCE_MATRIX.2026-10-26.json`） |
| スマホ画面 | Chromium iPhone 13 エミュレーションで11項目成功（誤パスフレーズ表示の不具合を1件発見・修正） | `review/p4-ui/ui-smoke.json`、スクリーンショット6枚 |
| 実調査バッチ | 取得試行12件・観測10件（全て検索抜粋）・候補3件・部署評価15件・選定1件（MORE_RESEARCH） | `review/p2-research/` |
| 設計整合検査 | 成功（マトリクス検査を「NOT_RUN以外は証拠と確認範囲必須」に更新） | `review/verify_design.py` |

試験中に見つけて直した実装不具合：許可カード承認時に許可IDが採番されない（e2e試験で検出）、ログイン失敗が「セッション無効」と表示される（画面試験で検出）。

**部分合格の理由**：A07＝生成コードのOSレベル隔離は未実装（秘密を返さないこと・AIに鍵/DB/シェルを渡さないことのみ検証）。E02＝外部のStripeテスト環境は未接続。U06＝実機・モバイル回線・HTTPS経路は未検証。

## 3. 起動・停止方法

前提：Node.js 24以上（このコンテナでは公式配布物をSHA256検証して導入）。
~~~bash
cd AI_Company_OS
npm ci --ignore-scripts
printf '%s' '<12文字以上のパスフレーズ>' | node src/owner-cli.mjs set-passphrase   # 本人のみ・初回
npm run server            # 127.0.0.1:8787 で起動（COMPANY_PORT / COMPANY_HOST / COMPANY_ALLOWED_ORIGINS）
# 停止：Ctrl+C または SIGTERM（接続を閉じてDBを閉じる）
npm test && npm run typecheck && node scripts/audit-operating-gaps.mjs
PLAYWRIGHT_PATH=<playwrightの場所> npm run ui:smoke   # スマホ幅の画面確認（一時DB・合成データ）
npm run research:batch -- ../review/p2-research/run-2026-11-01.json ../review/p2-research/opportunities-2026-11-01.json data/company.sqlite
~~~
Cookieは既定でSecure。HTTPSなしのローカル確認時のみ `COMPANY_INSECURE_COOKIE=1`。

## 4. 本人が行う設定（本人にしかできない操作）

| 対象 | 手順・設定箇所 | 費用 | 依存する受入 |
|---|---|---|---|
| 管理画面のパスフレーズ | 上記 `set-passphrase`（会話へ貼らない） | 0円 | U06本番 |
| スマホからの私有HTTPS経路 | 実行機で `tailscale serve` 等により `127.0.0.1:8787` を公開、`COMPANY_ALLOWED_ORIGINS` にそのURL | Tailscale個人プランは無料枠あり（現行条件を本人が確認） | U06実機 |
| 本文取得の許可ドメイン | このクラウド環境の設定（タイトルバーの環境メニュー→Edit→Network access）で `reddit.com`、`www.indiehackers.com`、`api.craftybase.com` 等を許可、または上位のアクセスレベル。手順：https://code.claude.com/docs/en/cloud-environments#network-access | 0円 | 次の調査バッチ |
| YouTube Data API キー | Google Cloudでプロジェクト作成→API有効化→キーを実行環境の `YOUTUBE_API_KEY` へ | 無料枠（クォータ制） | R系の実媒体接続 |
| Reddit API / Instagram / TikTok | 各社の開発者登録・審査。取得後に環境変数（`REDDIT_CLIENT_ID` 等）へ | 媒体による | R系 |
| Stripeテスト口座 | Stripeでテストモードのwebhook署名シークレットを発行→`node src/owner-cli.mjs provider-account` に `{provider:"stripe",account_id,environment:"test",venture_id,secret_env}`、シークレット値は環境変数へ。webhook先は `/hooks/stripe` | テストは0円 | E02外部テスト |
| 支出方針・実験枠 | `node src/venture-cli.mjs policy`（POLICY.example.json参照）。対象・上限・期限を本人が決める | 本人が決める上限 | E03 |
| 公開先アカウント・禁止領域 | 公開先（Webページ等）の用意、`owner-cli research-policy` で禁止領域を登録 | 0円〜 | E03 |

## 5. バックアップ・復元方法

~~~bash
node src/owner-cli.mjs backup  /secure/path/company-YYYYMMDD.sqlite   # 一貫したスナップショット＋.manifest.json
node src/owner-cli.mjs inspect /secure/path/company-YYYYMMDD.sqlite   # 改ざん検出、期限切れ許可・結果不明操作・最終通知時刻
node src/owner-cli.mjs restore /secure/path/company-YYYYMMDD.sqlite data/company-restored.sqlite
~~~
復元先は新しいファイルのみ（稼働DBを上書きしない）。復元DBは**停止状態**・全セッション失効・送信中操作はUNKNOWN。再開前に、バックアップ後の決済通知の再取得、結果不明操作の同ID照会、有効な許可の再確認を行う。同期はバックアップの代わりにしない。今回CLIで実データDBのバックアップ→検査→復元を実行して確認した（チェックサム一致、停止・失効を確認）。

## 6. 接続済みと未接続の一覧

| 接続先 | 状態 |
|---|---|
| エージェントのWeb検索（実装者の道具） | 利用可・**検索抜粋のみ**（PARTIAL） |
| 本文取得（indiehackers.com・craftybase.com 等） | **失敗**（このセッションのネットワーク方針で遮断） |
| Reddit・App Store（コンテナから） | **失敗**（外向き通信遮断、curl 000） |
| YouTube Data API | **認証が必要**（到達はするが鍵なしで403） |
| Instagram・TikTok・X・Threads | **未接続** |
| GitHub API | 到達可（今回の調査では未使用） |
| Stripe等の決済 | **未接続**（取り込み処理はローカル試験済み） |
| 公開先・提供先・監視 | **未接続**（LocalTestAdapterのみ） |
| 実モデル（eveのAI社員） | **未実行**（ツールは型チェック済み、実モデルでの行動評価なし） |
| Obsidian | ローカル出力のみ（一方向） |
| 銀行残高 | **未接続** |

## 7. 顧客価値・収入・費用・介入の確認状態

- 顧客価値：**未観察**。実顧客・実視聴者はいない。
- 収入：**0件**（本番の支払記録なし。テスト取引はローカル合成で、本番集計から除外されることを試験で確認）。
- 費用：外部支出**0円**（支出方針が無効）。調査で使ったエージェント道具の費用は個別計測できず **null（理由付き）** で記録。
- 本人の介入時間：**不明（未記録）**。管理画面にもそう表示する。
- 実市場：調査1バッチの結果、最有力の「請求書の督促文作成」は無料の代替（Stripe Invoicing等の自動督促）が強い反証、需要根拠は利害関係者の投稿が中心。「Etsy手数料・利益管理」は顧客の声が未取得・CSV/規約の権利未確認。「海外向けAIツール解説動画」は根拠が販売者のまとめ記事のみ・公開アカウント未許可。**どれも採用せず追加調査**（需要がないという結論ではなく、根拠不足）。

## 8. 未解決事項

1. 実際の調査で一候補を実証契約まで通す工程は、本文取得の遮断により**判断（G2）で停止**。調査→実証契約→提供の一巡は**合成データでのみ**接続確認（E01）。
2. 外部プロバイダーのテスト接続（E02外部）、本番実証（E03）は本人設定待ち。
3. 生成コードのOSレベルのサンドボックス（A07残り）は未実装。
4. スマホは実機・HTTPS経路・プッシュ通知が未実装/未確認。
5. AI社員（eve）の実モデル実行と、新ツールを使う行動の評価が未実施。役割指示文（instructions.md）への新ツールの使い方の追記も次の作業。
6. IMPROVEの独立資金枠は未実装（キュー上の優先レーンのみ）。
7. 多通貨は「未換算として別表示」まで。換算・多通貨台帳は未対応。
8. 常時稼働ホスト（iMac停止時の提供・照合）は未構成。

## 9. 次に実行する具体的な作業

1. 本人：本文取得ドメインの許可（または YouTube/Reddit API キー）を設定 → 同じ調査契約で `run-research-batch` を再実行し、顧客の声・代替/支出・到達経路の3種を本文で取得。
2. AI：結果で適格な候補が出た場合のみ `defineExperiment`→`launchExperiment`→`registerModel` を作成し、0円で可能な最小提供（静的ページ等）を制作。適格がなければ採用なしを維持し次の探索経路（自社実績・変化）へ。
3. 本人：Stripeテスト口座を登録 → `/hooks/stripe` へテストイベントを送り、E02を外部テストとして再判定。
4. 実装：各部署の `instructions.md` に新ツールの使い方を追記し、eveで実モデルの一巡（調査→機会→評価→判定）を実行して行動を記録。
5. 実装：生成コード実行の隔離（ネットワーク遮断・読み取り専用・鍵なしのworker）を追加しA07を完了。
6. 本人：私有HTTPS経路を用意し、実機でU01〜U06を再確認。
