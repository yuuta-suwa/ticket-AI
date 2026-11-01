# IG Revenue Consultant — Claude引き継ぎ

採用デザインは **STRATEGY ATELIER（会話で表示した2番）** に確定。`docs/DESIGN_SELECTION.md` と `reference/design/strategy-atelier.png` を実装の基準とする。他の案への再選択は不要。

ユーザーの目的：Instagramの収益最大化を支援する、感動するほど分かりやすく上質な専属AIコンサルティング体験を作る。現行はソース `source/`、現行コミット `03a801ccd82d8aca8378554dfc61ec5104596032`。

最初に `00_CLAUDE_CODE_START_PROMPT.md`、`docs/01_CURRENT_STATUS.md`、`docs/03_DESIGN_BRIEF.md`、`docs/05_PORTABILITY_AND_SECURITY.md`、`docs/06_PLAN_AND_ACCEPTANCE.md` を読む。

- この一式は引き継ぎ。新デザイン・新スキーマは提案であり、実装済みではない。
- 既存の会計・承認・データ分離・CSV重複防止を壊さない。
- 無償優先。プロトタイプでは有料APIを呼ばず、明確なデモ状態を使う。
- 元のSites専用認証ヘッダーを、別ホストで信用してはならない。
- 機密情報・ユーザー実績・本番DBはこのZIPにない。偽造して補わない。
- UIの色だけ変えて完了扱いにしない。状況理解→根拠付き診断→施策判断→成果確認の流れを実装する。
- 主要CTAは1画面1つ。本文16px、スマートフォン最小14px。偽の売上、AIスコア、成長率は禁止。
- 日常の実装・修正は判断して継続し、「続けていいですか」を反復しない。認証や実際の支出・公開で環境固有の許可が必要なら、対象と理由を具体的に示す。
- 有料実行、Instagram公開、送信、契約は、対応する権限と承認がないまま実行しない。
- 現行本番への自動反映を想定しない。まずローカルで完成させる。
- `source/` の変更後は型・ドメイン・DB・主要ブラウザー導線を検証し、結果を更新する。
- `docs/BUILD_PROGRESS.md` に変更・検証・残作業を随時保存し、会話が途切れても再開できるようにする。
