# CLAUDE.md

このファイルは Claude Code が Nexus Studio リポジトリで作業する際に毎セッション自動的に読み込む前提知識です。ここに書かれていることは常に守ってください。

## プロジェクト概要

Nexus Studio は、Nexus（`gitlab.com/11h27m/nexus-mobile`）の管理ポータル（旧 `apps/admin-web`）を置き換える別プロダクトです。開催回・カテゴリ・Spot・地図（MapDataset）の編集と公開を担当します。参加者向けの配信エンドポイントは持ちません（`nexus-mobile` の `apps/public-api` が担当）。

この分離の経緯・責務境界は `nexus-mobile/docs/decisions/E0-7-studio-scope-split.md` に、実装順序・データ契約は本リポジトリ `docs/決定事項/15_NexusStudio_実装開始判断・初期実装計画_2026-09-22_v02.md`（および同日v01）に記録されている。**実装前に必ずこれらを確認すること。**

## 現在の実装状態（重要）

**Step 0（基盤整備）のみ完了。Step 1（認証＋App Shell）・Step 2（イベント編集）以降は未着手。**

- Step 0 完了内容: `studio-api`/`studio-web` のソリューション骨格、`studio` schema の EF Core マイグレーション、MapDataset validator の移植（テスト全件成功）。
- Step 1・2 は、Figma画面棚卸し（`docs/決定事項/21`のプロンプトで依頼されたが `22`〜`24` の成果物が未作成）を済ませてから着手する。**Figmaの現在のノード構造を確認せずに App Shell・Events編集画面を実装しない。**
- 地図公開機構の二重開発を避ける整理案（15 v02 §9.1、A/B/C案）は利用者判断待ち。

## リポジトリ構成

```
nexusstudio/
├── apps/
│   ├── studio-web/       # Vite + React 18 + TypeScript + Tailwind v4（App Shell未実装）
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
| Studio Web | React 18 + TypeScript + Vite、Tailwind CSS v4。将来 Step 1 で React Router・TanStack Query・Radix（shadcn系）を追加予定。**MUIは持ち込まない** |
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
npm run dev
npm run typecheck
npm run build

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
| `docs/決定事項/26_...canonical_ID対応表.md` | 部屋canonical IDの対応表 |
| `docs/決定事項/27_...別セッション移行プロンプト.md` | このリポジトリとnexus-mobileの並行作業の引き継ぎ記録 |
| `nexus-mobile/docs/decisions/E0-7-studio-scope-split.md` | nexus-mobile側からみたStudio分離の決定記録 |

## 作業時の基本姿勢

- 技術的意思決定者は1名（このリポジトリのオーナー）。変更は小さく、レビューしやすい単位に分割する。
- 新しいライブラリやアーキテクチャパターンを導入する提案をする際は、必ず理由と代替案を添える。
- Figmaが未確認のまま画面を実装しない。決定記録の版が複数ある場合は日付・版番号が最新のものを正とする。
- `docs/決定事項/` 配下と実装が食い違っている場合は、黙って合わせるのではなく食い違いを指摘すること。
