# nexus-mobile 意思決定 棚卸し・再編成案

- 作成日：2026-09-22（日本時間）。版：v01。
- 依頼：利用者より「nexus-mobileとNexus Studioで意思決定のズレや衝突が生じている。一度nexus-mobileの意思決定のすり合わせと再編成を行いたい」との判断を受け、**全面の棚卸し**を実施した。
- 対象：`/Users/m09/Desktop/アプリ開発/nexus-mobile`（ブランチ `codex/19-map-dataset-draft-api`、HEAD `ecbb377`、変更0件）の決定記録・スコープ文書・API契約・CI・実装、および決定の保管場所となっている外部資料。
- 関連：[14 既存システム調査結果](14_NexusStudio_既存システム調査結果_2026-09-22_v01.md)、[15 v02 実装開始判断・初期実装計画](15_NexusStudio_実装開始判断・初期実装計画_2026-09-22_v02.md)。
- 状態：**棚卸しの事実（§1〜§5）と、再編成の提案（§6〜§8）**。提案は未承認であり、nexus-mobile のファイルは本作業で一切変更していない。
- 番号：文書21がFigma調査用に **22〜24 を予約済み**のため、衝突を避けて25とした。

---

## 0. 結論

ズレの正体は、個々の決定の食い違いではなく **「決定の保管場所が5つに分散し、どれが正本かが定義されていない」** ことである。矛盾はその症状として現れている。

調査で確認できた事実：

- **決定の保管場所が5つある**（§1）。そのうち**実装を最も強く駆動しているのは、リポジトリ外のObsidianとExcel台帳**である。
- **7件の決定衝突**が現存する（§2）。うち3件（タブ構成・部屋ID・iOSクライアント）は**実装が既に片方の説に従って進んでいる**。
- **6件の決定と実装の乖離**（§3）、**7件の契約不整合**（§4）、**4件のビルド／CIの穴**（§5）。
- 自称「全体正本」の `docs/v1.0-scope.md` と `README.md` はいずれも **2026-08-31** が最終更新で、その後3週間の主要作業（E1-5・E1-6・#17〜#19・iOSネイティブ移行計画・nexus-ios実装）を**一切反映していない**。

再編成は **決定の正本と昇格経路を先に定める**（§6）→ **衝突を決定記録として解消する**（§7）→ **Issueを再編成する**（§8）の順で行うことを提案する。

---

## 1. 決定の保管場所が5つに分散している

| # | 保管場所 | 位置 | 性格 | 実装への影響力 |
|---|---|---|---|---|
| 1 | `nexus-mobile/docs/` | リポジトリ内 | `v1.0-scope.md` が自身を**「全体正本」**と宣言。`docs/decisions/` に E0-5・E1-1〜E1-5 | 中（参照はされるが、最終更新が古い） |
| 2 | **Obsidian Vault/Nexus** | **リポジトリ外**（`~/Documents/Obsidian Vault/Nexus`） | frontmatter に `status: confirmed` を持つ25ファイル | **高**。タブ構成は実装がこちらに一致（§2-1） |
| 3 | **ID台帳 Excel** | **リポジトリ外**（`~/Desktop/アプリ開発/マップ詳細情報/実地調査/`） | `Naming_Rules`・`Conflicts`・`ID_Registry` | **高**。E1-1が自ら「作業者手元の実地調査ドラフト、**未リポジトリ化**」と記載し、根拠として引用 |
| 4 | Nexus Studio決定事項収納フォルダ | リポジトリ外 | D-01〜D-13、詳細案06〜12、承認記録16〜20 | 高（Studio側） |
| 5 | GitLab Work items | 外部サービス | `v1.0-scope.md` の変更ルールが**スコープ変更の記録先に指定**。#7・#81 等が決定の根拠として参照されている | 中（本セッションからは参照不能） |

### 1.1 これが問題である理由

`docs/v1.0-scope.md` は「情報が食い違う場合は、次の役割分担で判断します」という表を持ち、自身を v1.0 の包含・除外の正本と定めている。しかし**この表に Obsidian と ID台帳が載っていない**。結果として、次が起きている。

- **Obsidianで `status: confirmed` になった決定が、リポジトリの正本を経由せずに実装へ反映される**（§2-1 タブ構成）。
- **リポジトリ内の決定記録（E1-1）が、バージョン管理されていないExcelを根拠として引用する**。原本が差し替わっても検知できない。
- Studio側の決定（D-11〜D-13）が nexus-mobile の正本と衝突しても、反映経路が定義されていない。

**根治策は §6 に示す。**

---

## 2. 決定同士の衝突（7件）

### 衝突1：iOSのタブ構成が4説ある — **実装は正本と違う説に従っている**

| 出典 | 更新日 | 定義 | 状態 |
|---|---|---|---|
| `docs/v1.0-scope.md` E6 ／ Issue #45 | 2026-08-31 | **Home / Map / Info（3タブ）** | 「正本」 |
| `docs/ios-native-migration-plan.md` | 2026-09-11 | **Home / Map / 時間割 / 情報（4タブ）** | **未承認草案**と明記 |
| Obsidian `20_機能/4タブ全体像.md` | 2026-09-10 | **Home / Map / 案内 / 探す（4タブ）** | `status: confirmed` |
| `apps/nexus-ios/Nexus/Application/AppTab.swift:3-8` | 実装 | **home / map / guide（案内）/ search（探す）** | **Obsidianに一致** |

実装は、リポジトリ外のObsidianノートに一致し、リポジトリの正本と一致しない。`apps/nexus-ios/Nexus/Features/` の構成（Guidance・Home・Map・Route・Search）もこれを裏付ける。

**影響**：v1.0-scope の E6 記述と Issue #45 が実態と合わない。E6配下の Info コンテンツ系 Issue（#49・#51〜#54）は「Info」タブ前提で書かれている。

### 衝突2：フロアIDの表記が2説ある

| 出典 | 形式 | 例 |
|---|---|---|
| `docs/decisions/E1-2-hierarchical-ids.md`（**採用済み**） | `{building}_{floor_code}`、`floor_code` は `{n}f` / `b{n}f` | **`mb_1f`**、`ptb_b1f` |
| ID台帳 `Naming_Rules` R-003 / R-004 | `{building}_{floor}_rm_{code}` / `_cor_{seq}`、floor は `f{n}` | **`mb_f2`**_rm_2a、`mb_f2_cor_001` |

**E1-2 は R-003・R-004 に一切言及していない。** 本文を検索しても `Naming_Rules` / R-00x / 部屋 / 廊下 のいずれも現れない（唯一の関連記述は Phase 1 モック `room-a` を却下する一文）。両者は別の名前空間として併存しているが、**部屋IDの内部に埋め込まれたフロアトークンが `floor_id` と一致しない**状態になる。

**影響**：部屋IDを決める段階（衝突3）で必ず衝突する。Studioの会場参照はここに依存する。

### 衝突3：部屋 canonical ID の規則が存在しない — **意図的な先送りが3か月放置されている**

| 出典 | 記述 |
|---|---|
| `docs/decisions/E1-2` | スコープは建物・フロア・ノード・入口のみ。部屋は対象外 |
| `docs/decisions/E1-4` §本Issueのスコープ外 | **「部屋、駐車場、道路、ランドマーク等の追加 Feature 種別」**を明示的に除外し「後続 Issue で扱う」 |
| `docs/decisions/E1-3` | 「建物、正式入口、**今後定義される**部屋・施設・ランドマークなどを目的地にできる」 |
| ID台帳 `ID_Registry` | **部屋IDが72件実在**。判定は `keep` 75 / `rename_now` 24 / `phase2_review` 17 / `deprecate` 3 が混在 |
| ID台帳 `Conflicts` | **C-004（High、未解決）**：`mb_f2_cr_2b〜2g` で教室(classroom)と廊下(corridor)が `cr` を共用。**C-014（Medium、後回し）**：`ctc2_*` / `dvh_*` の大文字混在がR-001違反 |
| `map-dataset-geojson-v1.schema.json` | 部屋Featureが**存在しない**（building / formal_entrance / walking_path / indoor_node / outdoor_node の5種のみ） |

**後続の決定記録は作られていない。** その間に、Obsidian `40_データ/canonical ID.md`（`status: confirmed`）が `mb_f2_cr_2a` を「代表canonical ID」として記載し、Studioの決定文書16・17・20とFigmaがこれを引き継いだ。**この値は台帳 R-003 が「悪い例」として挙げているもので、正しくは `mb_f2_rm_2a` である。**

**影響**：Studio の本番公開を止める最大要因（15 v02 §1）。E5（屋内）・E4（経路）の目的地定義にも波及する。

### 衝突4：iOSクライアントの正本が決まっていない

| 出典 | 更新日 | 前提 |
|---|---|---|
| `docs/v1.0-scope.md` | 2026-08-31 | 「参加者向けアプリ機能を正式提供するクライアントは iOS アプリだけ」。**どちらのアプリか明記なし** |
| `docs/implementation/parallel-issue-selection.md` | 2026-09-05 | アーキテクチャ節で `apps/mobile-ios`（Expo SDK54 / RN 0.81）を記載。**`apps/nexus-ios` への言及なし** |
| `docs/ios-native-migration-plan.md` | 2026-09-11 | **未承認草案**。SwiftUIへ移行し、Expo/RNを完全撤去。**Home-onlyでv1.0-scopeと競合すると自ら明記** |
| Issue #24〜#54（E3〜E6、**31件**） | — | `[E3-1] react-native-maps / MapKit を導入する` 等、**Expo前提で記述** |
| 実装 `apps/nexus-ios` | Xcodeproj作成 2026-09-19 | **80 Swiftファイル**。Home / Map / Search / Guidance / Route を実装。テスト10本 |

移行計画 §13 は「**本番用 SwiftUI target: 現在なし**」を基準としているが、その9日後に `Nexus.xcodeproj` が作られている。**計画の基準が既に古く、しかも実装は計画の「Home-onlyで他はComingSoon」を超えて Map・Search・Guidance まで作られている。**

さらに `apps/nexus-ios` は **`Nexus.sln` にも `.gitlab-ci.yml` にも `.github/workflows/ci.yml` にも含まれていない**（§5）。

**影響**：E3〜E6の31 Issueが、採用されないかもしれないクライアント向けに書かれている。棚卸しの中で最も大きい影響範囲。

### 衝突5：admin-web の処遇（E0-5 ↔ D-11）

| 出典 | 判断日 | 内容 |
|---|---|---|
| `docs/decisions/E0-5-unconnected-components.md` | 2026-08-30 | **「対象コンポーネントは『接続』を採用し、削除は採用しない」**。`EventsPage.tsx` / `EventQrIssuesPage.tsx` が未接続であることを表に明記したうえで、接続を決定 |
| Issue #60 `[E7-3]` | — | **「`EventsPage.tsx` をルーティングに接続する」** |
| **D-11**（15 v02 §1） | 2026-09-22 | **admin-web を完全に捨て去る** |

正面衝突である。E0-5 には既に「**後続決定による更新**」という callout で #7 の決定を反映した前例があり（Web資産の扱い）、同じ方式で D-11 を反映できる（§6.3）。

### 衝突6：E7 の担当（v1.0-scope ↔ D-11）

`docs/v1.0-scope.md` は E7 を「管理ポータルの認証とトークン保管、スポット・開催日・イベント・MapDataset の管理、Dashboard・Logs の実 API 接続、validation・publish・rollback 操作」と定義し、「`admin-web` と `admin-api` は…を担当します」と記載している。D-11 により担当は Nexus Studio へ移る。

**E7配下の12 Issue が全て admin-web 前提**である。

| Issue | 内容 | D-11後の扱い（提案） |
|---|---|---|
| #55 | ログイン画面と認証ガード | **Studioへ移管**（Identity＋Cookieで再設計） |
| #56 | トークン保管方式を見直す | **廃止**（Cookie方式で前提が消滅） |
| #57 | スポット CRUD 画面 | **Studioへ移管** |
| #58 | 開催日（oc-days）管理画面 | **Studioへ移管** |
| #59 | Dashboard を実 API へ接続 | **Studioへ移管**（Overviewとして再定義） |
| #60 | `EventsPage.tsx` をルーティングに接続 | **廃止**（衝突5） |
| #61 | Logs を実 API へ接続 | **Studioへ移管**。ただし「参加者ログ」と「管理操作ログ」の別を明確化（14 §4） |
| #62 | QR 発行ウィザードを実 API へ接続 | **admin-apiに残置**（hidden beta） |
| #63 | MapDataset draft 一覧・編集画面 | **Studioへ移管** |
| #64 | validation 結果の表示 | **Studioへ移管** |
| #65 | publish / rollback 操作 | **Studioへ移管** |
| #66 | `/settings` の処遇を決める | **廃止**（admin-web消滅で自明） |

### 衝突7：E2 の分割（v1.0-scope ↔ 本日の合意）

`v1.0-scope.md` は E2 を「MapDataset の draft、validation、publish、rollback、公開配信と、iOS 側の取得・キャッシュ・版更新を実装する」と一体で定義している。本日、地図の publish/rollback を Studio 側へ移す案（15 v02 §9.1 A案）を承認いただいた。

| Issue | 状態 | 再編成後 |
|---|---|---|
| #17 `[E2-1]` MapDataset エンティティ | **完了** | nexus-mobile（成果はStudioへ移植） |
| #18 `[E2-2]` validator | **完了** | nexus-mobile（成果はStudioへ移植） |
| #19 `[E2-3]` draft 作成・更新・検証 | **完了**（本日 `ecbb377`） | nexus-mobile（成果はStudioへ移植） |
| #20 `[E2-4]` **publish / rollback** | 未着手 | **Studioへ移管**（A案） |
| #23 `[E2-5]` published 配信エンドポイント | 未着手、#20依存 | nexus-mobile。**依存先を #20 から Studio の公開基盤へ付け替える** |
| #21 `[E2-6]` NavigationDataStore を配信へ置換 | 未着手、#23依存 | nexus-mobile（変更なし） |
| #22 `[E2-7]` iOS の取得・キャッシュ・版更新 | 未着手、#23依存 | nexus-mobile（変更なし） |

---

## 3. 決定と実装の乖離（6件）

いずれも「決定記録は存在するが、実装が従っていない」もの。

| # | 決定 | 実装の現状 | 根拠 |
|---|---|---|---|
| 3-1 | E1-3：「現行の `NavigationController` が使用する `OrdinalIgnoreCase` は**移行対象**であり、canonical ID の比較規則には採用しない」 | `public-api/Controllers/NavigationController.cs:27,46-47` に**残存** | E1-3 §IDの規則 |
| 3-2 | 製品方針：「表示名・GUID・別のSpotへ置換しません」「近くの建物や道路へ自動吸着して正式位置としない」 | `public-api/Controllers/EventsController.cs:66-100` の `ResolveSpotCode` が、①`LocationText`（自由入力）を大文字小文字無視で Spot.Code に突き合わせ、②失敗時は**30 m以内の最寄り公開Spotを採用** | 14 §4.1 |
| 3-3 | E1-2 §既存実装との関係：Phase 1 モックID（`1f`/`2f`、`entrance`、`room-a`、表示値 `1F`/`2F`）は canonical data ではなく「後続の作業で本規則へ移行」 | `public-api/Data/phase1-navigation.json`（spots 7・floors 2・routes 3）、`mobile-ios/src/components/map/mockData.ts`、公開DTOに**残存**。同ファイル内で floors[0].id=`1f` と spot.floor=`1F` が不一致 | E1-2 §137、14 §7.2 |
| 3-4 | 06 §公開方針「下書き保存だけでは、本番の公開内容を変更しない」 | `admin-api/Program.cs:139-143` が**起動時に無条件で `DbSeeder.SeedAsync()` を実行**。非SQLiteでは `MigrateAsync()`（本番DBへの自動マイグレーション）＋サンプル行投入 | 14 §3.2 |
| 3-5 | 12 §2「共有アカウントを前提にせず、個人を識別できる管理者IDで履歴を残す」 | `admin-api/Controllers/AuthController.cs:30-34` が**設定ファイル上の単一固定ユーザー名・パスワードを平文比較**。ユーザーテーブルなし | 14 §3.3 |
| 3-6 | `docs/api-foundation.md` §2「admin-api は…公開参加者向けの読み取り専用 API を兼ねてはいけません」、§3 public-api に「QR token lookup」を入れてはいけない | `admin-api/Controllers/PublicQrController.cs:12,24` が **`[AllowAnonymous]` で `/q/{token}` を公開し、参加者向けHTMLを返す**。方針はpublic-api側だけを禁じており、**admin-apiに置く逃げ道が塞がれていない** | 本調査 |

---

## 4. 契約の不整合（7件）

`docs/v1.0-scope.md` のリリース判定4「OpenAPI、実装、client、テスト、README、関連文書の間に既知の契約不整合がない」に**直接該当する**。

### 4.1 OpenAPI ↔ 実装（機械的に照合した結果）

**`packages/openapi/admin.yaml` に無い実装ルート：5件**

| ルート | 実装 |
|---|---|
| `GET /q/{token}` | `PublicQrController.cs:24`（匿名・HTML応答） |
| `GET /admin/events/{id}/timeslots` | `EventsController.cs:67` |
| `GET /admin/qr-issues` | `QrIssuesController.cs` |
| `POST /admin/qr-issues/{id}/revoke` | `QrIssuesController.cs` |
| `POST /admin/timeslots/{timeslotId}/qr-issues` | `QrIssuesController.cs` |

逆方向（yaml にあり実装に無い）は**0件**。なお #19 の MapDataset draft 3本は **yaml へ同時追加されており、正しく運用されている**。

**`openapi/public.yaml` に無い実装ルート：2件**

| ルート | 備考 |
|---|---|
| `GET /api/navigation/spots/{id}` | `NavigationController.cs:22` |
| `GET /api/spots/by-code/{code}` | **E1-3 が alias resolver の適用先として名指ししている重要な経路** |

（`/health` は `Program.cs:98` の Minimal API で実装されており、yaml との差分は照合スクリプトの取りこぼし。実害なし。）

### 4.2 client / mock の陳腐化

| # | 対象 | 現状 |
|---|---|---|
| 4-3 | `mock-api/routes.json` | **4ルートのみ**（`/api/spots/by-code/:code`、`/api/events/today`、`/api/nearby`、`/api/logs`）。実装は public-api だけで10本 |
| 4-4 | `packages/shared/src/api.ts` | ナビ3本（`/api/navigation/spots`、`/api/floors`、`/api/routes`）のみ |

`docs/api-foundation.md` §6 は API 変更時に mock-api と `packages/shared` を**同時更新する**ことを求めているが、守られていない。

### 4.3 文書 ↔ 実装

| # | 文書 | 記述 | 実態 |
|---|---|---|---|
| 4-5 | `README.md:60,66` | admin-web の「**現行実装の一覧**」として「Events：イベント CRUD・イベント別 QR 発行管理」 | 画面は実在するが**未ルーティングで到達不能**。`/events` は `Placeholder`（14 §3.6） |
| 4-6 | `docs/admin-operations.md`（最終更新 **2026-01-15**、8か月前） | 「Target runtime: Windows Server / Azure」「Admin API: ASP.NET Core (.NET 8)」「Initial account is configured via `AdminAuth`」。OpenAPI書き出し手順が `bin/Debug/net8.0` 固定 | D-13（.NET 10）と、認証の個別化方針に反する |
| 4-7 | `docs/security.md`（最終更新 **2026-01-27**） | 見出しが**文字化け**（`# 繧ｻ繧ｭ繝･繝ｪ繝・ぅ繝｡繝｢` 等）。誤ったエンコードで保存されている | 読めないためレビュー不能 |

---

## 5. ビルド・CIの穴（4件）

| # | 対象 | 状態 | 影響 |
|---|---|---|---|
| 5-1 | **`apps/nexus-ios`** | `Nexus.sln` に**未登録**。`.gitlab-ci.yml`・`.github/workflows/ci.yml` の**いずれにもジョブなし** | 80 Swiftファイル・10テストが**一度も自動検証されていない**。macOS runner が無い |
| 5-2 | **`apps/admin-web`** | CIジョブ**なし**。`package.json` の `lint` は `echo "lint not configured"` | `tsc`・`vite build` が自動で走らない。D-11で廃棄予定のため優先度は低い |
| 5-3 | **`.github/workflows/ci.yml`** | GitLab運用（AGENTS.md・branch-policy・`.gitlab-ci.yml` が正）にもかかわらず**GitHub Actions定義が併存**。`.gitlab-ci.yml`（2026-09-22）に対し最終更新 2026-09-05 で**乖離**：`branch-policy-check`・`map-dataset-check`・`ai-review` が無く、**`public-api.Tests` を実行せず**、`dotnet publish` も無く、`.NET 8.0.x` 固定 | 二重管理。どちらが正か不明。GitHub側を信じると検証が手薄になる |
| 5-4 | **TFM と実行環境の不一致** | 全プロジェクトが `net8.0`。一方ローカルには `dotnet --list-sdks`＝`10.0.400`、`--list-runtimes`＝`Microsoft.NETCore.App 10.0.11` のみで、**.NET 8 runtime が無い**。`issue-19` 文書も `DOTNET_ROLL_FORWARD=Major` を要したと記録 | テスト実行に毎回回避策が要る。**D-13（.NET 10移行）で解消** |

### 5.1 既知の未処理問題（`parallel-issue-selection.md` が自ら記載）

> 「#17の追加DDLは既存DB初期化の修復を意味しない。**既存SQLiteシーダーの削除再作成、過去マイグレーションの識別属性欠落**は別の既存問題として提示する。」

この2件は Issue 化されているか不明。棚卸しの対象として拾い上げる。

---

## 6. 再編成案（1）決定の正本と昇格経路を定める

**これが根治策である。** 以下は提案であり、採否は利用者の判断による。

### 6.1 正本の定義

| 決定の種類 | 正本 | 理由 |
|---|---|---|
| v1.0 の包含・除外、リリース条件 | `nexus-mobile/docs/v1.0-scope.md` | 現行の宣言を維持。ただし**必ず最新に保つ**ことを条件にする |
| 技術・データ契約の決定記録 | `nexus-mobile/docs/decisions/` | E0-5・E1-1〜E1-5 の形式を継承 |
| API のルート・DTO・検証 | `packages/openapi/admin.yaml`、`openapi/public.yaml` | 現行の宣言を維持 |
| **Nexus Studio 固有の決定** | Nexus Studio決定事項収納フォルダ | D-01〜D-13。**nexus-mobile に影響する決定は `docs/decisions/` へ反映する** |
| スコープ変更の経緯 | GitLab Work item | `v1.0-scope.md` の変更ルールを維持 |

### 6.2 Obsidian と ID台帳の位置づけを明文化する

現在どちらも正本表に載っていないが、実装を駆動している。次を提案する。

| 資料 | 提案する位置づけ | 必要な措置 |
|---|---|---|
| **Obsidian Vault/Nexus** | **検討・設計の作業場**。`status: confirmed` は「利用者の中で固まった」の意であり、**実装契約ではない** | confirmed になった決定は `docs/decisions/` へ**昇格**させ、以後はそちらを正とする。昇格時にObsidian側へ「→ docs/decisions/XX へ昇格」のリンクを残す |
| **ID台帳 Excel** | **ID の一次資料**。ただし未バージョン管理 | ①台帳を**リポジトリへ取り込む**（推奨）、または②決定記録に**ファイル名＋SHA-256＋確認日**を固定して引用する。E1-6 の変換CLIが既に原本のSHA-256をレポートへ記録する方式を持っており、同じ方式を流用できる |

**昇格経路の例（タブ構成）**：Obsidian `4タブ全体像`（confirmed）→ `docs/decisions/E6-1-tab-structure.md` を新設 → `v1.0-scope.md` E6 を更新 → Issue #45 を閉じる。

### 6.3 既存の「後続決定による更新」方式を使う

`docs/decisions/E0-5` は冒頭に次の callout を持つ。

> **後続決定による更新:** 本文は E0-5 判断時点の技術調査と開発順序を記録したものである。…[Work item #7] により…方針が確定した。

**過去の決定記録を書き換えず、callout を足して上書き関係を明示する**この方式は既に機能している。D-11〜D-13 の反映も同じ方式で行うことを提案する。記録の履歴が壊れず、いつ何が覆ったかを追える。

---

## 7. 再編成案（2）衝突の解消順序

Tier は「Studio実装への影響」と「他の決定への波及」で並べた。

### Tier 1 — 先に決める（他の決定が依存する）

| # | 対象 | 決めること | 提案 | 生成する記録 |
|---|---|---|---|---|
| 1-1 | **iOSクライアントの正本**（衝突4） | `mobile-ios` と `nexus-ios` のどちらが v1.0 の提供物か。移行計画を承認するか、別の形に改めるか | 実装実体（80ファイル・4タブ・状態区別・CanonicalSpotID型）が `nexus-ios` に集中しており、Obsidianの確定タブ構成とも一致する。**`nexus-ios` を正本とし、移行計画を「Home-only」から実態に合わせて改訂する**ことを推奨。ただし v1.0-scope の E3〜E6 必須成果との整合を同時に取る | `docs/decisions/` に新規。`ios-native-migration-plan.md` の「未承認草案」状態を解消 |
| 1-2 | **部屋 canonical ID**（衝突3・衝突2） | 部屋・廊下の ID 規則。台帳 R-003/R-004 を採用するか、E1-2 のフロア表記に合わせるか | 台帳に72件の実IDがあり、Studioの会場参照が依存する。**台帳の `{building}_{floor}_rm_{code}` を採用しつつ、フロアトークンを E1-2 の `{n}f` 形式へ揃える**案（例：`mb_2f_rm_2a`）を軸に検討。ただし台帳の既存72件の改名コストと、C-004/C-014 の解消を同時に評価する必要がある | `docs/decisions/E1-7-room-canonical-ids.md`（仮）＋ `map-dataset-geojson-v1.schema.json` v1.1 |
| 1-3 | **E7 の担当と admin-web の処遇**（衝突5・6） | D-11 を正本へ反映する | §2 衝突6 の12 Issue 振り分け表のとおり | `v1.0-scope.md` 更新＋`docs/decisions/E0-5` へ callout 追記＋新規決定記録 |
| 1-4 | **E2 の分割**（衝突7） | publish/rollback の担当と、#23 の依存先 | 15 v02 §9.1 A案（本日承認済み） | `v1.0-scope.md` 更新＋新規決定記録 |

### Tier 2 — 実装と並行して解消できる

| # | 対象 | 提案 |
|---|---|---|
| 2-1 | タブ構成（衝突1） | Obsidian の4タブを `docs/decisions/` へ昇格させ、`v1.0-scope.md` E6 と Issue #45 を更新。Info系 Issue（#49・#51〜#54）を「案内」タブ前提に読み替え |
| 2-2 | `OrdinalIgnoreCase` の移行（3-1） | E1-3 が既に移行対象と決定済み。**新たな決定は不要、実装するだけ**。`NavigationController` の3箇所を序数完全一致へ |
| 2-3 | 30m近傍による会場推測の廃止（3-2） | Studio の明示的な会場参照が入るまでの暫定措置として、**近傍フォールバックを削除**し `LocationText` 一致も序数比較にする。新データには適用しない（15 v02 §4.2） |
| 2-4 | Phase 1 モックID の撤去（3-3） | E1-2 が既に移行方針を決定済み。Issue #30 `[E3-8] 旧 MapCanvas と mockData.ts を撤去する` が該当。`phase1-navigation.json` の扱いは #21 `[E2-6]` と束ねる |
| 2-5 | 起動時シードの分離（3-4） | 15 v02 Step 0-b。環境変数で無効化し、既定を本番非実行にする |
| 2-6 | `PublicQrController` の置き場所（3-6） | `api-foundation.md` に「**admin-api も参加者向けの匿名エンドポイントを持たない**」を明文化し、`/q/{token}` の移設先（public-api か LP か）を決める。QRはhidden betaのため優先度は中 |

### Tier 3 — 契約・文書・CIの掃除（リリース判定4）

| # | 対象 | 措置 |
|---|---|---|
| 3-1 | admin.yaml 欠落5本（4.1） | 追記。とくに `/q/{token}` は §2-6 の決定後に |
| 3-2 | public.yaml 欠落2本（4.1） | 追記。`/api/spots/by-code/{code}` は E1-3 の resolver 仕様と併せて記述 |
| 3-3 | `mock-api` / `packages/shared` の同期（4.2） | `api-foundation.md` §6 の同時更新規約を CI で検出できる形にすることも検討 |
| 3-4 | README の admin-web 記述（4-5） | D-11 の反映と同時に書き換え |
| 3-5 | `admin-operations.md`（4-6） | .NET 10・認証方式・運用環境を現状へ。8か月分の陳腐化 |
| 3-6 | `security.md` の文字化け（4-7） | UTF-8 で保存し直し、内容を再確認 |
| 3-7 | `.github/workflows/ci.yml`（5-3） | **GitLab を正とするなら削除**。残すなら `.gitlab-ci.yml` と同内容へ揃える |
| 3-8 | `nexus-ios` の検証（5-1） | Tier 1-1 で正本と決まった場合、`Nexus.sln` への登録可否とCI（macOS runner）の要否を判断 |
| 3-9 | TFM 統一（5-4） | D-13。全プロジェクトを .NET 10 LTS へ |
| 3-10 | 既知の未処理問題（5.1） | SQLiteシーダーの削除再作成、過去マイグレーションの識別属性欠落を Issue 化 |
| 3-11 | 古い文書の要否判定 | `phase0/`（2026-05-04）、`phase1/`（2026-05-25）、`mobile-sensor-integration-plan.md`（2026-05-04）、`expo-sdk-54-migration.md`（2026-06-18）を「保全」「更新」「削除」に分類 |

---

## 8. 再編成案（3）Issue の再編成

Tier 1 の決定後、GitLab 側で次の整理が必要になる。**本セッションから GitLab へはアクセスできないため、記録と実行は利用者にお願いする。**

| 区分 | 件数 | Issue | 措置 |
|---|---|---|---|
| **Studioへ移管** | 9 | #55, #57, #58, #59, #61, #63, #64, #65（E7）＋ #20（E2-4） | Nexus Studio 側のバックログへ。E7の受入条件はStudioのUI方針（16〜20承認済み）に合わせて書き直す |
| **廃止** | 3 | #56（トークン保管）、#60（EventsPage接続）、#66（/settings） | D-11 により前提が消滅 |
| **依存先の付け替え** | 1 | #23（E2-5 配信） | 依存を #20 から Studio の公開基盤へ |
| **残置** | 1 | #62（QR発行ウィザード） | admin-api の hidden beta として維持 |
| **Tier 1-1 の結果待ち** | 31 | #24〜#54（E3〜E6） | `nexus-ios` を正本とする場合、react-native-maps 前提の記述を全面的に見直す。**最大の影響範囲** |
| **重複の疑い** | 1 | #77（E9-3 validator のユニットテスト、#18依存） | #18 が `MapDatasetValidatorTests.cs` を伴って完了済み。重複でなければ追加範囲を明記 |
| **新規** | 3〜5 | — | 部屋canonical ID（Tier 1-2）、Schema v1.1、既知の未処理問題2件（5.1） |

---

## 9. この棚卸しで確認していないこと

| 項目 | 理由 |
|---|---|
| GitLab Issue / Work item の実際の状態 | **アクセス手段がない**。本書の Issue 番号・依存関係は `docs/implementation/parallel-issue-selection.md`（2026-09-05時点の記録）に基づく。同文書自身が「最新進捗の正本はGitLab」と明記しており、**3週間分のずれがあり得る** |
| Work item #7・#81 の内容 | 同上。決定の根拠として複数の文書から参照されている |
| `docs/audit/v1.0-api-foundation-audit.md`（63KB、2026-07-02） | 本棚卸しでは見出しレベルの確認に留めた。既知の不整合一覧が含まれる可能性があり、§4 と重複・補完する |
| `web/` の実装詳細 | overview.md で #81 の棚卸し対象とされており、本書の範囲外 |
| 各アプリのビルド・テスト実行結果 | 起動時副作用（3-4）と依存導入を避けるため、静的確認のみ |
| Obsidian 25ファイルの全文 | タブ構成・canonical ID・データ方針・経路案内とオフラインの4件を確認。残りは未読 |

---

## 10. 進め方の提案

1. **Tier 1 の4件（§7）を決める。** ここだけが他の決定の前提になっている。とくに **1-1（iOSクライアントの正本）は31 Issueに波及する**ため最優先。
2. 決定が出たら、**§6.3 の callout 方式**で既存の決定記録を上書きせずに更新し、`v1.0-scope.md` を同じ変更単位で更新する。
3. `docs/decisions/` への新規記録と `v1.0-scope.md` の更新は、**利用者のご承認をいただいてから** nexus-mobile へ書き込む。本書はその草案の材料である。
4. Tier 2・Tier 3 は Studio の実装（15 v02 Step 0〜2）と並行して消化できる。**Studio の着手を待たせる必要はない。**

本書は nexus-mobile のファイルを一切変更していない。既存の決定案（06〜12、16〜20）も書き換えていない。
