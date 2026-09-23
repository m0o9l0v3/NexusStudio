# CLAUDE.md

このファイルは Claude Code が Nexus Studio リポジトリで作業する際に毎セッション自動的に読み込む前提知識です。ここに書かれていることは常に守ってください。

## プロジェクト概要

Nexus Studio は、Nexus（`gitlab.com/11h27m/nexus-mobile`）の管理ポータル（旧 `apps/admin-web`）を置き換える別プロダクトです。開催回・カテゴリ・Spot・地図（MapDataset）の編集と公開を担当します。参加者向けの配信エンドポイントは持ちません（`nexus-mobile` の `apps/public-api` が担当）。

この分離の経緯・責務境界は `nexus-mobile/docs/decisions/E0-7-studio-scope-split.md` に、実装順序・データ契約は本リポジトリ `docs/決定事項/15_NexusStudio_実装開始判断・初期実装計画_2026-09-22_v02.md`（および同日v01）に記録されている。**実装前に必ずこれらを確認すること。**

## 現在の実装状態（重要）

**Step 0（基盤整備）・Step 1（認証＋App Shell）完了。Step 2（イベント編集）以降は未着手。**

- Step 0 完了内容: `studio-api`/`studio-web` のソリューション骨格、`studio` schema の EF Core マイグレーション、MapDataset validator の移植（テスト全件成功）。
- Step 1 完了内容: Identity＋Cookie認証（`/api/auth/*`、CSRF検証、未認証は既定で拒否）、運用者用の管理者コマンド（`dotnet run -- admin ...`）、ログイン画面（L01〜L04・L06）、App Shell（Sidebar・Toolbar・管理者メニュー・再ログインダイアログL05）。各領域の本文は準備中表示。
- Figmaモックアップは Phase 1（Login・Events編集・保存/競合/期限切れ・一覧状態）まで作成済み（2026-09-23確認）。Phase 2（Open Campus・カテゴリ管理・Map Data・Validation・Releases履歴・Logs・中止/取り下げ）は未作成。
- Step 2 は、Events編集画面の構成（「イベントを編集」「開催枠を編集」「共通情報を編集」「開催枠一覧」の4種を1画面へ統合するか）を利用者が確認してから着手する。
- Figma画面棚卸しの成果物（`docs/決定事項/22`〜`24`、Issue #1）は未作成。
- 地図公開機構の二重開発を避ける整理案（15 v02 §9.1、A/B/C案）は利用者判断待ち。

## リポジトリ構成

```
nexusstudio/
├── apps/
│   ├── studio-web/       # Vite + React 18 + TypeScript + Tailwind v4（ログイン画面・App Shell）
│   ├── studio-api/       # ASP.NET Core Web API（.NET 10 LTS）
│   └── studio-api-tests/ # xUnit
├── docs/
│   ├── schemas/           # nexus-mobileからpinしたMapDataset GeoJSON Schema（SHA-256で同一性確認）
│   └── 決定事項/           # 意思決定記録（00〜27、日付・版が新しいものが正）
├── docker-compose.yml     # PostgreSQL検証環境のみ
└── NexusStudio.slnx
```

## 技術スタック

| Area | Stack |
|---|---|
| Studio Web | React 18 + TypeScript + Vite、Tailwind CSS v4（Figma Variablesを `src/index.css` の `@theme` に定義）、React Router 7（v8はReact 19必須のため）、TanStack Query、Radix（Dialog・DropdownMenu）。**MUIは持ち込まない** |
| Studio API | ASP.NET Core 8→**.NET 10 LTS**、EF Core 10 + Npgsql、PostgreSQLの`studio` schemaを所有 |
| DB | PostgreSQL。`nexus-mobile`と同一インスタンス内の別schema（`studio`）を想定。本リポジトリの検証環境は専用のDocker Compose PostgreSQL |

## 開発コマンド

```bash
# Studio API
cd apps/studio-api
dotnet build ../../NexusStudio.slnx
dotnet test ../studio-api-tests/StudioApi.Tests.csproj

# マイグレーション適用（起動時の自動適用はしない。Step 0-c）
dotnet tool restore
ConnectionStrings__StudioDatabase="Host=localhost;Port=5433;Database=nexus_studio;Username=studio;Password=<.envと同じ値>" \
  dotnet tool run dotnet-ef database update

# Studio Web
cd apps/studio-web
npm install
npm run dev          # /api は http://localhost:5001 へ中継
npm run typecheck
npm run lint
npm run build

# 管理者アカウント（運用者のみ。パスワードは引数で渡さない）
cd apps/studio-api
dotnet run -- admin add --email <メールアドレス> --name <表示名>   # ほか disable / enable / reset-password / list

# 検証用DB
cp .env.example .env   # STUDIO_DB_PASSWORD等を設定
docker compose up -d postgres   # ホスト側は5433番ポート（nexus-mobileの5432と衝突回避）
```

## アーキテクチャ上の重要な設計判断

- **接続文字列に既定値を持たせない**（Step 0-d）。`appsettings.json` に `ConnectionStrings` を書かない。`ConnectionStrings__StudioDatabase` が未設定なら起動時に例外を投げて即座に失敗させる。`nexus-mobile/apps/admin-api` の「動く既定値」問題（本番資格情報と誤用されうる）を再発させない。
- **起動時にDBへ副作用を起こさない**（Step 0-c）。マイグレーション適用・シードを `Program.cs` に書かない。`nexus-mobile` の `DbSeeder` が起動のたびに本番DBへマイグレーションを自動適用する設計ミスを繰り返さない。
- **canonical ID を生成・正規化・推測するコードを書かない。** 文字列として厳密一致で保持する（大文字小文字を含む）。部屋IDの規則（`{building}_{floor}_{type}_{seq:03}`）が未確定のため、規則確定後にデータ移行だけで済むようにする。
- **MapDataset Schema・validatorの契約は `nexus-mobile` を正とする。** `docs/schemas/` はpinしたコピーであり、Studio側で勝手に緩めない。同一性は `PinnedSchemaHashTests` のSHA-256確認で担保する。nexus-mobile側でSchemaが更新されたら、コピーとテスト内のhash値を意図的に更新すること。
- **編集と公開を分離する**（Revision＝不変スナップショット／head＝可変の現在の下書き／Release＝不変の公開結果）。Step 2以降で `studio.event_heads`/`studio.event_revisions` 等として実装する。手入力の状態フィールドを持たず、公開状態は算出する。
- **`operationId` の冪等性・`rowVersion` による楽観的排他制御を最初から作る。** 後付けしない。

## セキュリティ上、絶対に守ること

- ASP.NET Core Identityで個別の管理者アカウントを作る。`nexus-mobile/apps/admin-api` の単一固定資格情報・平文比較を踏襲しない。
- 公開サインアップ画面を作らない。初期管理者の登録・無効化は運用者のみ実行できる管理コマンドで提供する。
- 秘密値のプレースホルダー（`CHANGE_ME_TO_A_LONG_RANDOM_SECRET`等）は、本番デプロイ手順の提案時に必ず差し替えを促すこと。

## ドキュメント参照先

| ファイル | 内容 |
|---|---|
| `docs/決定事項/15_..._v02.md`（および同日v01） | 実装開始判断・技術構成・データ契約・実装順序（Step 0〜6）の正本 |
| `docs/決定事項/21_...実装準備プロンプト.md` | Figma画面棚卸しの依頼文（`22`〜`24`は未作成） |
| `docs/決定事項/07`〜`12`（最新版） | 画面の動き・状態・検証・受け入れ条件（機能ID） |
| `docs/UI補完記録.md` | Figmaに描かれていない部分をエージェントが補完した記録 |
| `docs/決定事項/26_...canonical_ID対応表.md` | 部屋canonical IDの対応表 |
| `docs/決定事項/27_...別セッション移行プロンプト.md` | このリポジトリとnexus-mobileの並行作業の引き継ぎ記録 |
| `nexus-mobile/docs/decisions/E0-7-studio-scope-split.md` | nexus-mobile側からみたStudio分離の決定記録 |

## UI実装とFigmaの関係

Figma（`https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio`）は**見た目の基準**、`docs/決定事項/` は**動きの基準**とする。

- **Figmaを正とするもの：** 情報配置・余白・文字・色・階層・Component・文言。実装する画面は、その都度Figmaの現在のノードを取得して確認する（記憶やNode IDの控えだけで実装しない）。
- **Figmaを正としないもの：** Prototypeのリンク・遷移。遷移・状態・検証・保存/公開の挙動は `07`〜`12`（最新版）と `15` の機能ID・受け入れ条件に従う。Figma内のイベント名・日時・ID・座標・件数は設計用サンプルであり、データやAPI仕様の根拠にしない。

### エージェントが補完してよいもの

既存のComponent・Variables・Text Stylesと、承認済み画面の表現を流用する範囲で、確認なしに実装してよい。

- Figmaに描かれていない状態：読み込み中・正式0件・検索0件・取得失敗・対象なし・保存中など。
- 抜け出せない画面・遷移先のない操作・状態の矛盾など、Figma上の不具合の解消。例：保存競合で再保存できないE29・E30。
- キーボード操作・フォーカス管理・読み上げ用ラベルなどのアクセシビリティ。
- 文字の見切れ・部品の不揃い・レイヤーの崩れなど、見た目の細かな不整合の調整。

### 実装前に利用者の確認を取るもの

- Figmaに存在しない画面・領域の新設。Phase 2のうち、Validation・Releases・Logsのような一覧＋詳細の構成は、構成案を示して確認を取った後に実装してよい。Map Dataは確認前に実装しない。
- 画面構成・ナビゲーション・主要操作の配置など、見た目が大きく変わる判断。
- `docs/決定事項/` に書かれていないルールの決定。推奨案を添えて質問する。
- Figmaと決定事項の食い違い。どちらかに黙って合わせない。

### 補完内容の記録

- 補完した内容は `docs/UI補完記録.md` に1件1行で追記する。項目は、日付・対象画面（Node ID）・種別（状態不足／不具合修正／a11y／見た目調整）・内容・根拠（機能IDまたは決定事項の節）。
- MRの説明文にも、そのMRで補完した項目を列挙する。
- Figmaへの反映が必要な補完は、記録に「Figma要反映」と付ける。エージェントはFigmaを直接変更しない。

## 作業時の基本姿勢

- 技術的意思決定者は1名（このリポジトリのオーナー）。変更は小さく、レビューしやすい単位に分割する。
- 新しいライブラリやアーキテクチャパターンを導入する提案をする際は、必ず理由と代替案を添える。
- 画面を実装する前に、Figmaの現在のノードを確認する。補完の範囲と記録方法は「UI実装とFigmaの関係」に従う。決定記録の版が複数ある場合は日付・版番号が最新のものを正とする。
- `docs/決定事項/` 配下と実装が食い違っている場合は、黙って合わせるのではなく食い違いを指摘すること。
