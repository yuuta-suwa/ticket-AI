# JSON Schemaの次に必要な検証

このスキーマは提案であり、Zod/DB/API/表示へまだ接続していない。形が正しくても、事実が正しいとは限らない。

1. snapshotはサーバーが作成し、クライアントやモデルに書き換えさせない。
2. period.start<=period.end、利用者が選んだ期間と一致。
3. 参照IDの所有者、種別、存在、取得可能性を検証。webは実際の検索取得結果に限る。
4. factsの数値・期間・分母はサーバー集計と照合。未対応の文章を事実へ昇格しない。
5. action/option/ref IDを一意にし、recommendedActionIdは実在するaction IDかnull。
6. 調査不足ならknowledgeStateはinsufficient。根拠がない仮説をsupportedとしない。
7. deadlineや上限がnullなら未設定と表示し、実行済みや無制限の許可と解釈しない。
8. v1レポートの形と混同せず、schemaVersionで読取・移行を分岐。
9. executionPerformed=falseで、提案だけから外部操作を行わない。実行は別の認可/承認/冪等性を持つ。
10. stop/paused、料金同意、日次制限はモデル外のサーバーで強制する。
