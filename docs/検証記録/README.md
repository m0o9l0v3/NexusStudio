# Nexus Studio 検証記録

実行した検証の証拠を置く場所（2026-10-08 利用者判断）。根拠は [24 実装移行計画](../決定事項/24_NexusStudio_ClaudeCode実装移行計画_2026-10-08_v01.md) §5。

## 置き方

```
{YYYY-MM-DD}_{作業単位}_{内容}.md
{YYYY-MM-DD}_{作業単位}_{内容}/   # 画面画像など
```

例：`2026-10-09_A_Step1-2比較検証.md`

各記録には次を書く。

- 対象のコミット（HEAD）と dirty state
- 環境（隔離DBか・SQLiteテストか・viewport・ブラウザ）。設計用 fixture を使った場合はそう明記する
- 手順・期待結果・実結果（✅／❌）。失敗はそのまま残す
- 関連する operationId・Revision・Release（公開系）
- 比較した Figma Node と取得日

パスワード・Cookie・接続文字列などの秘密値は記録しない。

## 検証方式

- A（既存 Step 1・2 の比較検証）のブラウザ操作は手動で行い、ここへ記録する。
- E2E 自動化（Playwright 等）は導入していない。C（公開の完成検証）の後に、理由と代替案を添えて別途提案する。
- SQLite メモリDBのテスト（`StudioApiFactory`）の合格を、PostgreSQL での合格として記録しない（24 §5.2）。
