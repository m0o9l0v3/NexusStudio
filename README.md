# Nexus Studio

Nexus（[`nexus-mobile`](https://gitlab.com/11h27m/nexus-mobile)）の管理ポータル（旧 `apps/admin-web`）を置き換える別プロダクトです。開催回・カテゴリ・Spot・地図（MapDataset）の編集と公開を担当します。参加者向けの配信エンドポイントは持ちません。

分離の経緯は [`nexus-mobile` の E0-7 決定記録](https://gitlab.com/11h27m/nexus-mobile/-/blob/develop/docs/decisions/E0-7-studio-scope-split.md)、実装順序・データ契約は [`docs/決定事項/15`](docs/決定事項/15_NexusStudio_実装開始判断・初期実装計画_2026-09-22_v02.md) を参照してください。

## 現在の実装状態

**Step 0（基盤整備）のみ完了。Step 1（認証＋App Shell）・Step 2（イベント編集）以降は未着手です。**

| Step | 内容 | 状態 |
|---|---|---|
| Step 0 | リポジトリ骨格、`studio` schema、MapDataset validatorの移植 | ✅ 完了 |
| Step 1 | ASP.NET Core Identity認証、App Shell（Sidebar/Workspace/Inspector） | 未着手（Figma画面棚卸しが前提） |
| Step 2 | イベント編集（Revision/head/楽観的排他制御） | 未着手 |

詳細は [`CLAUDE.md`](CLAUDE.md) を参照してください。

## リポジトリ構成

```
nexusstudio/
├── apps/
│   ├── studio-web/          # Vite + React 18 + TypeScript + Tailwind v4（プレースホルダーのみ、App Shell未実装）
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

ConnectionStrings__StudioDatabase="Host=localhost;Port=5433;Database=nexus_studio;Username=studio;Password=<.envと同じ値>" \
  dotnet run
```

### Studio Web

```bash
cd apps/studio-web
npm install
npm run dev         # http://localhost:5173
npm run typecheck
npm run build
```

### テスト

```bash
dotnet build NexusStudio.slnx
dotnet test apps/studio-api-tests/StudioApi.Tests.csproj
```

MapDataset validatorの移植テスト（`MapDatasetValidatorTests`・`MapDatasetTests`）と、Schema同一性の`PinnedSchemaHashTests`を含みます。

## MapDataset Schema の同一性

`docs/schemas/map-dataset-geojson-v1.schema.json` は `nexus-mobile/docs/schemas/map-dataset-geojson-v1.schema.json` からpinしたコピーです。Studio側で契約を緩めていないことを `apps/studio-api-tests/PinnedSchemaHashTests.cs` のSHA-256確認で担保しています。nexus-mobile側でSchemaが更新された場合は、このコピーとhash値の両方を意図的に更新してください。

## ドキュメント

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | 毎セッション読み込む前提知識（プロジェクト概要・現在の実装状態・設計判断） |
| `AGENTS.md` | リポジトリ作業ルール |
| `docs/決定事項/` | 意思決定記録。日付・版が新しいものを正とする |
