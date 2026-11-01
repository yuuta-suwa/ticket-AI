# ソース案内

| ファイル | 役割 | 今回の刷新で触る候補 |
|---|---|---|
| `app/page.tsx` | Studioを表示 | 入口/認証境界を維持 |
| `app/layout.tsx` | メタデータ、全体レイアウト | 新ブランド・フォント |
| `app/globals.css` | 現行の全画面CSSと追記テーマ | トークン化・コンポーネント分離。追記の積み重ねを整理 |
| `components/Studio.tsx` | State、保存、ナビ、デモ、相談テーマ | 相談状態の追加、主要ナビ整理 |
| `components/consultant-home.tsx` | 現行のコンサルホーム | 初回/再訪で分岐する戦略ブリーフ |
| `components/views.tsx` | 収益源/調査/施策/投稿/明細/AI/設定 | 相談室と根拠・比較・検証UIへ再構成 |
| `components/editors.tsx` | 入力・接続・公開・承認モーダル | 新デザインと段階入力。既存保護を維持 |
| `components/ui.tsx` | ボタン/パネル/フォーム/ダイアログ | デザインシステムの共通基盤 |
| `components/asset-preview.tsx` | 完成素材プレビュー | 素材確認・失敗状態 |
| `components/workspace-context.tsx` | 画面/操作/相談テーマの型 | セッションと読み取りモデル |
| `lib/model.ts` | State v1、Zod、収益分類 | 後方互換を保って新型を追加 |
| `lib/domain.ts` | 金額、参照、承認、診断、AIプロンプト | 相談根拠と判定・期間を拡張。会計は保持 |
| `lib/analysis.ts` | API生成/取り込み/自動分析 | セッション、データ版、レポートv2、失敗分離 |
| `lib/server.ts` | DB、鍵、所有者、日次制限 | 移植時の認証/保存アダプター |
| `lib/csv.ts` | 共通CSV読み書き | 重複防止と明細状態を保持 |
| `lib/demo.ts` | 明示的な架空データ | デザイン検証用に分離して維持 |
| `app/api/workspace/route.ts` | 所有者単位の読書き、revision | 新データの検証・移行 |
| `app/api/ai/route.ts` | AI入口 | セッション/レポート検証 |
| `app/api/content/route.ts` | 承認・手動公開記録 | 版の固定と再承認 |
| `app/api/instagram/route.ts` | 同期・API公開・重複防止 | 接続可否を正しく表示 |
| `app/api/connections/route.ts` | キー確認/保存/削除 | 実値を返さない |
| `app/chatgpt-auth.ts` | Sitesの信頼境界での本人確認 | 他ホストでヘッダーを信用しない |
| `db/schema.ts` / `drizzle/` | 6テーブルと移行 | セッション等の追加はマイグレーション化 |
| `tests/domain.test.mjs` | 14件の業務保護 | 回帰を防ぐ |
| `tests/persistence_test.py` | SQL・所有者・競合・上限 | 実認証のE2Eとは区別 |
| `scripts/` / `vite.config.ts` / `worker/` | 起動・Workers・元環境の接続 | 直接削除せず依存を把握 |

既存ソースを整形するだけの巨大差分と機能変更を混ぜない。必要な型とコンポーネントの境界を確立し、段階ごとにビルド可能な状態を維持する。
