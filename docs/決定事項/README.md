# Nexus Studio 決定事項

Nexus Studio の決定案・確定記録・調査結果の**正式な保管先**。

## 保管先を決めた経緯

2026-09-22 の判断（D-20）により、Nexus Studio の決定事項は**このリポジトリ内**に置く。

理由：Nexus Studio は Windows での開発も想定するため、Mac のローカルフォルダに置くと参照できない環境が生じる。リポジトリ内に置けば、開発環境を問わず同じ内容を参照でき、変更履歴も残る。

Nexus（iOS・nexus-mobile）側の決定事項は、当面 iOS 開発が Mac 中心であるため `~/Desktop/アプリ開発/決定事項収納フォルダ` に置く。**Studio 側と混在させない。**

## 命名規則

```
{2桁連番}_NexusStudio_{内容}_{YYYY-MM-DD}_{vNN}.md
```

- 連番は作成順。欠番は作らない。
- **同名がある場合は旧版を保持し、日付・版を更新する。** 過去版を削除・上書きしない。
- 22〜24 は文書 21 が Figma 調査用に予約済み。

## 読む順序

| 目的 | 文書 |
|---|---|
| 全体の入口・最新版の一覧 | `00_..._決定案一覧・実装範囲` |
| 確定した製品方針 | `06_..._公開方針・機能境界` |
| 機能ごとの詳細案 | `07`（イベント）`08`（開催情報・カテゴリ）`09`（Spots）`10`（Map Editor）`11`（Validation・Releases）`12`（共通UI） |
| 既存システムの調査結果 | `14_..._既存システム調査結果`（最新日付のもの） |
| 実装計画 | `15_..._実装開始判断・初期実装計画`（最新版のもの） |
| UI設計・承認記録 | `16`〜`20` |
| nexus-mobile との整合 | `25_..._nexus-mobile意思決定棚卸し・再編成案`（最新版のもの） |

## 区別して読むこと

各文書は次を明示的に分けて書いている。読むときも混同しない。

- **確定事項**：利用者が承認した内容。
- **提案**：未承認の案。作成済み文書に含まれていても承認済みではない。
- **調査で判明した事実**：根拠（ファイル・行番号・URL・確認日）を伴う。

文書内のイベント名・日時・件数・Release ID・座標・canonical ID は、断りがない限り**設計用サンプル**である。正式データ・API仕様・計測済み位置の根拠にしない。

## 関連する正本（このフォルダの外）

| 対象 | 正本の場所 |
|---|---|
| Nexus（iOS）の決定事項 | `~/Desktop/アプリ開発/決定事項収納フォルダ` |
| v1.0 の包含・除外、リリース条件 | `nexus-mobile/docs/v1.0-scope.md` |
| ID・座標・GeoJSON スキーマの技術契約 | `nexus-mobile/docs/decisions/`、`nexus-mobile/docs/schemas/` |
| API のルート・DTO・検証 | `nexus-mobile/packages/openapi/admin.yaml`、`nexus-mobile/openapi/public.yaml` |
| スコープ変更の経緯 | GitLab Work item |
| 地図原本・ID台帳 | `~/Desktop/アプリ開発/マップ詳細情報/` |

Studio 側の決定が nexus-mobile に影響する場合は、**nexus-mobile 側の正本へも反映する**。片方だけを更新しない。

## Windows で参照する場合

ファイル名に日本語を含む。Git の設定は次を推奨する。

```bash
git config core.quotepath false
```

macOS 側は `core.precomposeunicode = true`（設定済み）により、コミット時に NFC へ正規化される。
