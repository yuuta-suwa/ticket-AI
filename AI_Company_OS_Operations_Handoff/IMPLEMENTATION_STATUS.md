# 実装と証拠の状態｜2026-11-01
コードv0.6.0。詳細は DELIVERY_REPORT_2026-11-01.md。資料の詳細化・ローカル試験を本番や市場の実証と扱わない。

| 項目 | 現在の状態 | 根拠 |
|---|---|---|
| 8部・16課・42役割、社内タスク・検収 | ローカル実装（v0.5.0から継続） | organization.json、company.mjs |
| 本人認証・管理API・許可・停止・冪等 | **実装・ローカル試験済み**。実機・HTTPS経路は未確認 | authority.mjs、server.mjs、test/authority.test.mjs |
| 外部実行プロトコル（予約・直前検査・UNKNOWN照会） | **実装・ローカル試験済み**。実プロバイダー未接続 | execution.mjs |
| 調査→原本→機会→評価→選定→実証契約 | **実装・ローカル試験済み**。実調査1バッチ（抜粋のみ）→MORE_RESEARCH | research.mjs、review/p2-research |
| 収益モデル計画v2（視聴者と支払者、4判定） | **実装・ローカル試験済み**。旧計画互換 | commercial.mjs |
| 決済通知・利用・問い合わせ・費用・指標 | **実装・ローカル試験済み**。外部テスト未接続 | operations.mjs |
| RUN枠付き優先キュー | **実装・ローカル試験済み**。IMPROVE独立資金枠は未実装 | jobs.mjs |
| 知識・Obsidian一方向出力・顧客データ消去 | **実装・ローカル試験済み** | knowledge.mjs、operations.mjs |
| バックアップ・復元 | **実装・ローカル試験済み・CLIで実行確認** | backup.mjs、owner-cli.mjs |
| スマホ管理画面 | **実装・Chromiumエミュレーション確認**。実機未確認 | ui/index.html、review/p4-ui |
| AI社員の固定主体ツール | **実装・型チェック済み**。実モデル評価は未実行 | agent/lib/tools.ts |
| 生成コードの隔離 | 未実装 | A07部分合格 |
| 外部テスト・本番接続・実顧客・収益 | **未実証** | E02部分・E03未実行 |

検証：169試験成功（既存109＋新規60）、型チェック、運営監査、verify_design.py。受入マトリクス：LOCAL_PASS 56／LOCAL_PASS_PARTIAL 3／NOT_RUN 1。
支出方針は無効・0円のまま。本番公開・送信・実支出・定期タスク登録は行っていない。
