# Nexus Studio

Nexus（[`nexus-mobile`](https://gitlab.com/11h27m/nexus-mobile)）の管理ポータル（旧 `apps/admin-web`）を置き換える別プロダクトです。開催回・カテゴリ・Spot・地図（MapDataset）の編集と公開を担当します。参加者向けの配信エンドポイントは持ちません。

分離の経緯は [`nexus-mobile` の E0-7 決定記録](https://gitlab.com/11h27m/nexus-mobile/-/blob/develop/docs/decisions/E0-7-studio-scope-split.md)、実装順序・データ契約は [`docs/決定事項/15`](docs/決定事項/15_NexusStudio_実装開始判断・初期実装計画_2026-09-22_v02.md) を参照してください。

## 現在の実装状態

**Step 0（基盤整備）・Step 1（認証＋App Shell）・Step 2（イベント1件の編集と下書き保存）が完了。Step 3 以降は未着手です。**

| Step | 内容 | 状態 |
|---|---|---|
| Step 0 | リポジトリ骨格、`studio` schema、MapDataset validatorの移植 | ✅ 完了 |
| Step 1 | ASP.NET Core Identity認証、管理者コマンド、ログイン画面、App Shell（Sidebar/Workspace） | ✅ 完了（各領域の本文は準備中表示） |
| Step 2 | イベント1件の編集と下書き保存（Revision/head、rowVersion・operationId、参照データの取り込み） | ✅ 完了（公開はStep 4） |

詳細は [`CLAUDE.md`](CLAUDE.md) を参照してください。

## リポジトリ構成

```
nexusstudio/
├── apps/
│   ├── studio-web/          # Vite + React 18 + TypeScript + Tailwind v4（ログイン画面・App Shell）
│   ├── studio-api/          # ASP.NET Core Web API（.NET 10 LTS）
│   └── studio-api-tests/    # xUnit
├── docs/
│   ├── schemas/              # nexus-mobileからpinしたMapDataset GeoJSON Schema
│   └── 決定事項/              # 意思決定記録
├── docker-compose.yml        # PostgreSQL検証環境のみ
└── NexusStudio.slnx
```

## ローカル開発

### 前提バージョン

- .NET SDK 10.0+
- Node.js 20+
- Docker（検証用PostgreSQL）

### Studio API

```bash
cd apps/studio-api
dotnet tool restore   # 初回のみ（dotnet-ef）
```

接続文字列はコードに既定値を持たせていません。必ず環境変数で与えてください。

```bash
cp .env.example .env   # STUDIO_DB_PASSWORD等を設定
docker compose up -d postgres   # ホスト側5433番ポート

ConnectionStrings__StudioDatabase="Host=localhost;Port=5433;Database=nexus_studio;Username=studio;Password=<.envと同じ値>" \
  dotnet tool run dotnet-ef database update   # マイグレーション適用（起動時の自動適用はしない）
```

マイグレーション履歴は `studio."__EFMigrationsHistory"` に記録します（public schema には作りません）。
2026-09-24 より前のStudioで一度でもマイグレーションを適用したDBは、上の `database update` の前に一度だけ次を実行してください（新規のDBでは不要。何度実行しても結果は同じです）。

```bash
psql "<接続文字列>" -v ON_ERROR_STOP=1 -f apps/studio-api/Database/move-migrations-history-to-studio.sql
```

APIの起動：

```bash
ConnectionStrings__StudioDatabase="Host=localhost;Port=5433;Database=nexus_studio;Username=studio;Password=<.envと同じ値>" \
  dotnet run   # http://localhost:5001（Studio Webの開発サーバーが /api をここへ中継する）
```

### 管理者アカウント（運用者のみ）

公開サインアップはありません。管理者の登録・無効化・パスワード再設定は、同じ接続文字列を与えて次のコマンドで行います。パスワードは引数では受け取らず、実行後に入力を求めます（標準入力をリダイレクトした場合は1行目を読みます）。

```bash
cd apps/studio-api
export ConnectionStrings__StudioDatabase="Host=localhost;Port=5433;Database=nexus_studio;Username=studio;Password=<.envと同じ値>"
dotnet run -- admin add --email <メールアドレス> --name <表示名>
dotnet run -- admin list
dotnet run -- admin disable --email <メールアドレス>          # 既存のログインも1分以内に失効
dotnet run -- admin enable --email <メールアドレス>
dotnet run -- admin reset-password --email <メールアドレス>
```

### Studio Web

```bash
cd apps/studio-web
npm install
npm run dev         # http://localhost:5173（/api は http://localhost:5001 へ中継）
npm run typecheck
npm run build
```

### 参照データ（開催回・開催日・カテゴリ・Spot）

Step 3 で編集画面を作るまでは、取り込みコマンドで登録します。起動時には取り込みません。IDで突き合わせて追加・更新し、ファイルに無い行は削除しません。1件でも不正な行があれば何も書き込みません。

```bash
cd apps/studio-api
dotnet run -- reference import --file ../../docs/samples/reference-sample.json   # 開発用の設計用サンプル（本番へ取り込まない）
```

### APIの型

Studio Web は `apps/studio-web/openapi/studio-api.json` から生成した型（`src/api/schema.d.ts`）でAPIを呼びます。APIを変えたら次を実行します（食い違いはCIで検出されます）。

```bash
STUDIO_UPDATE_OPENAPI=1 dotnet test apps/studio-api-tests/StudioApi.Tests.csproj
cd apps/studio-web && npm run gen:api
```

### テスト

```bash
dotnet build NexusStudio.slnx
dotnet test apps/studio-api-tests/StudioApi.Tests.csproj
```

MapDataset validatorの移植テスト（`MapDatasetValidatorTests`・`MapDatasetTests`）、Schema同一性の`PinnedSchemaHashTests`、認証・CSRF・管理者コマンドのテスト（`AuthEndpointsTests`・`AdminAccountTests`。DBはSQLiteのメモリDBに差し替え）を含みます。

## MapDataset Schema の同一性

`docs/schemas/map-dataset-geojson-v1.schema.json` は `nexus-mobile/docs/schemas/map-dataset-geojson-v1.schema.json` からpinしたコピーです。Studio側で契約を緩めていないことを `apps/studio-api-tests/PinnedSchemaHashTests.cs` のSHA-256確認で担保しています。nexus-mobile側でSchemaが更新された場合は、このコピーとhash値の両方を意図的に更新してください。

## ドキュメント

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | 毎セッション読み込む前提知識（プロジェクト概要・現在の実装状態・設計判断） |
| `AGENTS.md` | リポジトリ作業ルール |
| `docs/決定事項/` | 意思決定記録。日付・版が新しいものを正とする |
| `docs/UI補完記録.md` | Figmaに描かれていない部分を実装で補った記録 |
