# 参照と確認日
2026-11-01。以下は引き継ぎ作成時に参照した一次情報の入口。機能、料金、プラン、権限、API仕様は実装時に再確認する。

- Claude Code overview: https://code.claude.com/docs/en/overview
  コードの読取・編集・コマンド実行を行う開発ツール。今回の実コードの継続開発に適する。
- Your first day in Claude Code: https://support.claude.com/en/articles/14552382-your-first-day-in-claude-code
  Claude DesktopのCodeでローカルのプロジェクトを選択する流れ。
- Claude Artifacts: https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them
  通常チャットで扱える制作物と、コード開発の選択を判断する入口。小さなAIアプリが作れることと、既存アプリの認証/DBが移設済みであることは異なる。
- Claude API Messages: https://platform.claude.com/docs/en/api/messages/create
- Instagram API: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
- Meta公式Postman: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api

元実装の根拠：復元したGitコミット、アプリのREADME、APIとドメイン関数、既存テスト。
元要件：`reference/requirements-v1.1.md`。詳細要件の全実装を主張しない。
新しい画面と相談体験の部分は、本引き継ぎで提案した設計であり、既存の実績・研究結果ではない。
