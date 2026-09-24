# CLAUDE.md

このファイルは Claude Code が Nexus Studio リポジトリで作業する際に毎セッション自動的に読み込む前提知識です。ここに書かれていることは常に守ってください。

## プロジェクト概要

Nexus Studio は、Nexus（`gitlab.com/11h27m/nexus-mobile`）の管理ポータル（旧 `apps/admin-web`）を置き換える別プロダクトです。開催回・カテゴリ・Spot・地図（MapDataset）の編集と公開を担当します。参加者向けの配信エンドポイントは持ちません（`nexus-mobile` の `apps/public-api` が担当）。

この分離の経緯・責務境界は `nexus-mobile/docs/decisions/E0-7-studio-scope-split.md` に、実装順序・データ契約は本リポジトリ `docs/決定事項/15_NexusStudio_実装開始判断・初期実装計画_2026-09-22_v02.md`（および同日v01）に記録されている。**実装前に必ずこれらを確認すること。**

## 現在の実装状態（重要）

**Step 0〜3 完了（Step 3 の Spots は一覧・Inspectorの属性編集まで）。Step 4 は3つのMRに分けて進行中で、1つ目（公開の基盤と公開の流れ）と2つ目（Releases・Logs の画面と復旧）を実装した。Validation の画面は未着手。**

- Step 0 完了内容: `studio-api`/`studio-web` のソリューション骨格、`studio` schema の EF Core マイグレーション、MapDataset validator の移植（テスト全件成功）。
- Step 1 完了内容: Identity＋Cookie認証（`/api/auth/*`、CSRF検証、未認証は既定で拒否）、運用者用の管理者コマンド（`dotnet run -- admin ...`）、ログイン画面（L01〜L04・L06）、App Shell（Sidebar・Toolbar・管理者メニュー・再ログインダイアログL05）。各領域の本文は準備中表示。
- Figmaモックアップは Phase 1（Login・Events編集・保存/競合/期限切れ・一覧状態）まで作成済み（2026-09-23確認）。Phase 2（Open Campus・カテゴリ管理・Map Data・Validation・Releases履歴・Logs・中止/取り下げ）は未作成。
- Step 2 完了内容: `studio.event_heads`/`event_revisions`（rowVersion・operationId）、`/api/events`、参照表（開催回・開催日・カテゴリ・Spot。読み取り専用）と取り込みコマンド（`dotnet run -- reference import --file ...`）、Events一覧と1画面に統合した編集画面（2026-09-24 利用者判断）、OpenAPI文書と生成型（`apps/studio-web/openapi/`・`src/api/schema.d.ts`）。
- Step 3 完了内容: 開催回（開催日を含む）・カテゴリ一覧・Spotの下書き編集（現在の下書き＋rowVersion と不変の `studio.reference_revisions`）。Open Campus 一覧・編集、Events内のカテゴリ管理、開催枠の中止（開催日の中止とは別に保持）、Spots の一覧・Inspector。Open Campus とカテゴリ管理の画面は Figma に無く、2026-09-24 に利用者が承認した構成案で作った。
- Spots の地図表示と位置の変更（Figma SP02〜SP04）は、Map Data の技術検証の後に実装する。
- **Step 4 着手前の判断（2026-09-24）は `docs/決定事項/28` に記録済み。** 地図の公開・復旧は Studio に完全一本化（nexus-mobile の #20・#55〜#61・#63〜#66 はクローズ済み）。Spot は名称・別名・説明・利用状態を Spot 単独で、位置・建物・階・経路の接続を地図と一緒に公開する（Spot 画面の建物・階は読み取り専用に変える）。終日枠は参照だけを公開し配信時に解決、開催回・カテゴリも Step 4 で公開対象、復旧は下書きの退避まで、Figma に無い画面は構成案の承認後に実装。
- Step 4-1 実装内容: `studio.releases`／`release_entries`（不変）・`publications`（現在の公開版）・`validation_runs`・`operation_logs`。`/api/releases/preview`（公開候補の組み立てと検証）、`/api/releases`（公開・取り下げ。operationId・confirmedValidationId）、`/api/operations/{operationId}`（結果の照会）。公開状態は Publication と現在の版から算出する（`Publishing/PublicationIndex.cs`）。公開確認（R01）と公開結果（R02〜R05）はイベント・開催回・カテゴリ一覧・Spotで共通（`src/publishing/`）。保存・公開・取り込み・ログインを操作ログに記録する。追加の判断は `docs/決定事項/28` v02。
- Step 4-2 実装内容: 過去に公開した版からの復旧（`action: restore`。未公開の下書きは退避し `release_entries.stashed_revision_id` に残す。下書きへ戻す操作と保持期間は未実装）。`/api/releases`（一覧）・`/api/releases/{id}`（当時の参照データを含む差分）・`/api/logs`。Releases・Logs の画面（一覧＋詳細）。
- 参照データは取り込みコマンドでも登録できる（版を進めて Revision を残す）。開発用の設計用サンプルは `docs/samples/reference-sample.json`。
- 画面の保存処理は `apps/studio-web/src/editing/useDraftEditor.ts`（Open Campus・カテゴリ・Spot）と Events 編集画面で共通の考え方（operationId の再利用、409で上書きしない、［最新の内容を読み込む］）。
- Figma画面棚卸しの成果物（`docs/決定事項/22`〜`24`、Issue #1）は未作成。

## リポジトリ構成

```
nexusstudio/
├── apps/
│   ├── studio-web/       # Vite + React 18 + TypeScript + Tailwind v4（ログイン画面・App Shell）
│   ├── studio-api/       # ASP.NET Core Web API（.NET 10 LTS）
│   └── studio-api-tests/ # xUnit
├── docs/
│   ├── schemas/           # nexus-mobileからpinしたMapDataset GeoJSON Schema（SHA-256で同一性確認）
│   └── 決定事項/           # 意思決定記録（00〜28、日付・版が新しいものが正）
├── docker-compose.yml     # PostgreSQL検証環境のみ
└── NexusStudio.slnx
```

## 技術スタック

| Area | Stack |
|---|---|
| Studio Web | React 18 + TypeScript + Vite、Tailwind CSS v4（Figma Variablesを `src/index.css` の `@theme` に定義）、React Router 7（v8はReact 19必須のため）、TanStack Query、Radix（Dialog・DropdownMenu）、openapi-typescript（APIの型生成。TypeScript 6 は `overrides` で指定）。**MUIは持ち込まない** |
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

# 参照データの取り込み（開催回・開催日・カテゴリ・Spot。起動時には取り込まない）
dotnet run -- reference import --file ../../docs/samples/reference-sample.json   # 開発用の設計用サンプル

# APIを変えたら：OpenAPI文書を更新して型を再生成する（CIで食い違いを検出する）
STUDIO_UPDATE_OPENAPI=1 dotnet test ../studio-api-tests/StudioApi.Tests.csproj
cd ../studio-web && npm run gen:api

# 検証用DB
cp .env.example .env   # STUDIO_DB_PASSWORD等を設定
docker compose up -d postgres   # ホスト側は5433番ポート（nexus-mobileの5432と衝突回避）
```

## アーキテクチャ上の重要な設計判断

- **接続文字列に既定値を持たせない**（Step 0-d）。`appsettings.json` に `ConnectionStrings` を書かない。`ConnectionStrings__StudioDatabase` が未設定なら起動時に例外を投げて即座に失敗させる。`nexus-mobile/apps/admin-api` の「動く既定値」問題（本番資格情報と誤用されうる）を再発させない。
- **マイグレーション履歴も `studio` schema に置く**（`StudioDbContextOptions.UseStudioNpgsql`）。public schema に履歴表を作らない。2026-09-24 より前に適用したDBは `apps/studio-api/Database/move-migrations-history-to-studio.sql` を一度だけ実行してから `database update` する。
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
| `docs/決定事項/28_...Step4着手前の判断記録.md`（最新版） | 地図公開のStudio一本化、Spotの公開単位、Step 4 の範囲と構成案・MRの分け方（2026-09-24 利用者決定） |
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
