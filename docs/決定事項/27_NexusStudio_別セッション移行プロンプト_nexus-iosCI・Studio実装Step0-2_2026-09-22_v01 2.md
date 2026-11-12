# 別セッション移行プロンプト：nexus-ios CI整備 / Nexus Studio 実装 Step 0〜2

- 作成日：2026-09-22（日本時間）。版：v01。
- 作成理由：利用者より「Tier 0（正本の更新）はこのセッションで実施し、`nexus-ios`のCI整備とStudioのStep 0〜2は別セッションで進めたい」との判断を受け、引き継ぎ用に作成した。
- 本文書の使い方：**タスクA・タスクBは独立している。** どちらか一方だけを渡しても、両方渡して並行させても構わない。各タスクの節はそれだけで作業を始められるよう、必要な前提をすべて含めている。
- 保管先：本リポジトリ `docs/決定事項/`（D-20）。

---

## 0. 両タスクに共通する前提

### 0.1 対象リポジトリと現在のブランチ状態（2026-09-22時点）

| リポジトリ | パス | 関係するブランチ |
|---|---|---|
| **nexus-mobile** | `/Users/m09/Desktop/アプリ開発/nexus-mobile` | `develop`（既定）、`docs/v1.0-scope-realignment`（今回のTier 0作業、5コミット、develop比 ahead 5 / behind 0、**未push**） |
| **nexus-studio（Nexus Studio）** | `/Users/m09/Desktop/アプリ開発/nexus-studio/nexusstudio` | `develop`（既定）、`docs/decision-records`（決定事項フォルダの移行、2コミット、**未push**） |

作業開始前に、両リポジトリの `git status` と `git branch --show-current` を必ず確認すること。上記のブランチが `develop` へマージされているかどうかで、参照すべきファイルの内容（特に `nexus-mobile/CLAUDE.md` と `docs/v1.0-scope.md`）が変わる。**マージ済みなら `develop` 上に、未マージなら `docs/v1.0-scope-realignment` ブランチ上に最新の記述がある。**

### 0.2 読むべき決定記録（優先順）

1. `nexus-mobile/CLAUDE.md` — 毎セッション自動読み込みされる前提知識。SwiftUI移行・Nexus Studio分割を反映済み（Tier 0作業）
2. `nexus-mobile/docs/v1.0-scope.md` — v1.0の正本
3. `nexus-mobile/docs/decisions/E0-6-ios-client-of-record.md` — iOSクライアントの正本を`apps/nexus-ios`とする決定
4. `nexus-mobile/docs/decisions/E6-1-tab-structure.md` — タブ構成（ホーム/マップ/案内/探す）
5. `nexus-mobile/docs/decisions/E0-7-studio-scope-split.md` — 管理ポータルのNexus Studio移管
6. 本リポジトリ `docs/決定事項/14_NexusStudio_既存システム調査結果_2026-09-22_v01.md` — 既存システムの実装事実の調査結果
7. 本リポジトリ `docs/決定事項/15_NexusStudio_実装開始判断・初期実装計画_2026-09-22_v02.md` — 技術構成・実装順序の計画（タスクBの主要参照先）
8. 本リポジトリ `docs/決定事項/25_NexusStudio_nexus-mobile意思決定棚卸し・再編成案_2026-09-22_v04.md` — GitLab Issueとの整合確認結果（**v04が最新かつ訂正版。v01〜v03の一部記述はv04で撤回されている**）
9. 本リポジトリ `docs/決定事項/26_NexusStudio_部屋canonicalID規則・対応表_2026-09-22_v01.md` — 部屋canonical ID（Studio実装で会場参照に使う）

同名ファイルが複数版ある場合は**日付・版番号が最新のものを正とする**。旧版は経緯として保持されているだけで、内容の正しさは保証しない。

### 0.3 やってはいけないこと（両タスク共通）

- **`develop`への直接コミットを避ける。** 作業ブランチを切ること（nexus-mobileは`codex/*`か`docs/*`か機能を表す名前、Studioは任意の慣例に従う）。
- **リモートへの`push`、GitLabのMR/Issue作成・編集は、明示的な承認なしに行わない。** 本セッション（このプロンプトの作成元）でも実施していない。
- **nexus-mobileの本番DB・既存決定案（`docs/decisions/`の既存ファイル）を上書きしない。** 過去の決定記録を訂正する場合は、`E0-5`で使われている「後続決定による更新」callout方式に倣うこと。
- **GitLab接続について**：`glab` CLIが認証済みで、`nexus-mobile`・`nexusstudio`両プロジェクトへの**Issue読み取り専用**トークンが設定されている（`glab auth status`で確認可）。**書き込み権限は無い**（403になることを実地確認済み）。Issue更新が必要になった場合は利用者に依頼すること。

---

## タスクA：`apps/nexus-ios` のビルド・CI統合

### A.1 背景

`docs/decisions/E0-6-ios-client-of-record.md`（本日採用）により、参加者向けiOSクライアントの正本は`apps/nexus-ios`（SwiftUI）と確定した。しかし静的確認の結果、次が判明している。

- `apps/nexus-ios`はSwift 80ファイル、テスト10本（`NexusTests/`）を持つ
- **`Nexus.sln`（Visual Studioソリューション）に未登録**
- **`.gitlab-ci.yml`にビルド・テストジョブが無い**
- **`.github/workflows/ci.yml`にもジョブが無い**（このファイル自体が`.gitlab-ci.yml`と乖離しており、別途整理が必要という指摘が25 v03/v04にある）
- 結果として、**このコードは一度も自動検証を通っていない**

一方、旧クライアント`apps/mobile-ios`（撤去対象）は`mobile-check`ジョブでCI検証され続けている。**正本が検証されず、撤去対象が検証され続けているという逆転状態**を解消するのが本タスクの目的。

### A.2 現状のCI構成（参考）

`.gitlab-ci.yml`の既存`mobile-check`ジョブ（`apps/mobile-ios`向け、参考パターンとして構造は似せてよいが対象と中身は異なる）：

```yaml
mobile-check:
  stage: verify
  image: node:20
  script:
    - cd apps/mobile-ios
    - node --version
    - npm --version
    - npm ci
    - npm run typecheck
    - npm run lint --if-present
    - npm run test:ci
```

`.gitlab-ci.yml`の`stages`は`verify`→`ai-review`の2段階（`.gitlab-ci.yml`冒頭を参照）。

### A.3 未解決の技術的前提（最初に調べること）

**macOS runnerの有無が未確認である。** `.gitlab-ci.yml`に`tags:`やmacOS runnerを示す記述は見当たらない。GitLab.comの共有runnerでmacOS/Xcodeビルドが利用可能かどうか（有料プランの制約、`saas-macos-*`タグの要否等）を、着手前に公式ドキュメントで確認すること。

選択肢の例（優先順位は付けない。状況に応じて判断）：

1. GitLab.com共有のmacOS runner（`saas-macos-medium-m1`等のタグ）を使う
2. 自前でmacOS runnerをホストする（個人運営の負荷を考慮）
3. GitHub ActionsのmacOS runnerを使い、`.github/workflows/ci.yml`側でXcodeビルドを行う（ただし`.gitlab-ci.yml`との二重管理問題を悪化させないよう、どちらを正とするかを合わせて整理する）
4. 当面は自動化を諦め、ローカルでのビルド・テスト手順を`README.md`に明文化するだけに留める

**個人運営（技術的意思決定者1名）であることを踏まえ、運用負荷が過大にならない案を選ぶこと。** `CLAUDE.md`の「変更は小さく、レビューしやすい単位に分割する」という方針にも従う。

### A.4 完了条件（提案。着手前に見直してよい）

- `apps/nexus-ios`のビルドが自動または明文化された手順で再現できる
- `NexusTests`（10本）が自動または明文化された手順で実行され、結果が確認できる
- CI構成を追加する場合、`.gitlab-ci.yml`と`.github/workflows/ci.yml`のどちらを正とするかが明確になっている（両方に中途半端な定義を残さない）
- 対応した内容を`README.md`のドキュメント表・開発コマンド節、および必要であれば新しい決定記録（`docs/decisions/`）に反映する

### A.5 検証方法

- ビルドが通ること（Xcodeまたは`xcodebuild`コマンドライン）
- `NexusTests`の10本が全て実行され、結果（成功/失敗数）が記録に残ること
- CIジョブを追加した場合、実際にパイプラインが走って結果が出ることを1回確認する

### A.6 スコープ外

- `apps/nexus-ios`自体の機能実装（地図・位置情報・データ取得等）。これはタスクAの範囲外で、E3〜E5の各Issue（`nexus-mobile`のGitLab Issue #24〜#54、25 v04 §1で確認済みのとおり内容自体は既にSwiftUI前提）の担当
- `apps/mobile-ios`の削除・撤去（別途`E0-6`のスコープ外事項として`#87`の範囲で判断）

---

## タスクB：Nexus Studio 実装 Step 0〜2

### B.1 背景

`docs/決定事項/15_NexusStudio_実装開始判断・初期実装計画_2026-09-22_v02.md`（以下「15 v02」）に、推奨構成・データ契約・実装順序が確定している。本タスクはその**Step 0〜2**（15 v02 §8）を実施する。

現在の`nexus-studio/nexusstudio`リポジトリは、`README.md`と`docs/決定事項/`（本日の棚卸し・移行作業）以外に製品コードが存在しない。**Step 0〜2が実質的な実装の最初の着手になる。**

### B.2 実施範囲（15 v02 §8 を要約。詳細は原文を必ず参照すること）

#### Step 0：Studioリポジトリの基盤

- Web（Vite + React 18 + TypeScript）とAPI（**.NET 10 LTS**、D-13決定済み）のソリューション構成
- `studio` schemaのDBモデルとEF Coreマイグレーション（PostgreSQL、`public` schemaは一切変更しない）
- **起動時シードを設計として持ち込まない**（`nexus-mobile`側の`DbSeeder`が起動時に本番DBへマイグレーションを自動適用する問題を、14 §3.2・§12で確認済み。同じ設計ミスを繰り返さない）
- Studio検証環境（Compose）。既存本番DBに接続しない
- **`MapDataset validator`の移植**（`nexus-mobile/apps/admin-api/Services/MapValidation/`一式とそのテスト`MapDatasetValidatorTests.cs`）。**移植の完了条件はテスト全件が通ること**

#### Step 1：認証とApp Shell

- App Shell（Sidebar 216px／Workspace／必要時のInspector）。Figmaで承認済みのUI方針（本リポジトリ`docs/決定事項/16`〜`20`）に沿う
- ASP.NET Core Identityによる個別管理者認証＋ログイン画面。**単一固定資格情報（`nexus-mobile`の現行admin-apiの問題、14 §3.3で確認済み）を繰り返さない**
- 初期管理者の登録・無効化コマンド

#### Step 2：最初の到達点

> **「イベント1件を編集 → 複数枠・複数会場を設定 → 下書き保存 → 一覧へ戻る → 再表示して同じ内容が出る」**

完了条件の中核（15 v02 §8 Step 2より）：

1. 会場0件・カテゴリ未選択・参加案内未選択でも下書き保存できる
2. 再表示で枠順・会場順・会場補足・時間方式・参加案内が1つも欠けない
3. **canonical IDが保存前後で1文字も変わらない（大文字小文字を含む）**
4. 2タブ同時保存で無断上書きされず409と最新内容が出る
5. 通信を落とした保存で失敗が表示され入力が残る

検証は「保存payloadと再取得payloadのJSON正規化バイト比較」を自動テストとして持つこと。画面で「それらしく見える」ことを完了条件にしない。

### B.3 必読の技術契約

| 契約 | 参照元 |
|---|---|
| データ構造（Revision／head／Release、`operationId`のUNIQUE制約、`rowVersion`楽観的排他制御、Event payloadの構造） | 15 v02 §4 |
| 主要APIの契約案（編集・検証・公開・復旧の各エンドポイント） | 15 v02 §5（Step 2の範囲は§5.1のみで足りる） |
| バックエンドから移植するもの・しないもの | 15 v02 §4「バックエンドから導入するもの・しないもの」 |
| 部屋canonical IDの規則（`{building}_{floor}_{type}_{seq:03}`、型は`cl`/`cr`/`wc`/`rm`） | 本リポジトリ`docs/決定事項/26` |
| 決定案の矛盾・修正提案（特に修正提案7・8は確定方針の解釈に触れるため実装前に要確認） | 15 v02 §7 |

### B.4 特に注意すべき既知の落とし穴（過去の調査で判明済み）

- **設計用サンプルIDに`mb_f2_cr_2a`系を使わない。** これは旧ID体系の値で、`26`文書の対応表により`mb_2f_cl_001`が正。Studioのfixture・seed・UIサンプルは`26`文書の対応表に従う
- **canonical IDを生成・正規化・推測するコードを書かない。** 文字列として厳密一致で保持する（大文字小文字を含む）
- **終日枠は実時刻をpayloadに焼き込まない。** 参照として保持し、配信時に同一Release内で解決する（15 v02 §4.2、修正提案2）
- **建物の高さ・階数は保存しない。** MapDataset Schema v1に保存先が無く、Schema v1.1が決まるまでは名称編集のみに留める（15 v02 §7 修正提案7）
- **同じDBを既存`admin-api`と二重に書き込まない。** 既存`admin-api`のEvents/Spots/OcDaysのControllerは移植せず、Studioが新規実装する（15 v02 §4.3）

### B.5 完了条件・検証方法

15 v02 §8 Step 2の「完了条件（Step 2 全体）」と「意味のある検証方法」の表をそのまま適用する。特に次を自動テストとして持つこと。

- 往復の同一性（JSON正規化バイト比較）
- canonical IDの保持（大文字小文字を含む）
- 07番文書のAC01〜AC08、AC21〜AC26のE2Eシナリオ
- 2セッション同時保存での競合検出
- キーボード操作のみでの会場追加・順序変更
- Figmaのノード（`2:2`／`10:2`／`10:130`／`10:258`／`11:178`／`10:386`）とのスクリーンショット比較（1440×1024）

### B.6 スコープ外（Step 2までの範囲では扱わない）

- 公開（Release）・検証・履歴・復旧（Step 4の範囲）
- 開催情報・カテゴリ・Spot単体画面の完成（Step 3の範囲）
- iOSとの接続（Step 5の範囲）
- 地図編集（Terra Draw統合等、15 v02 §9の技術検証は別途独立したタスクとして着手できる。Step 2の完了を待つ必要はない）

---

## 付録：新しいセッションが最初に行うべきこと

1. 本文書（`27_...`）を読む
2. `nexus-mobile`と`nexus-studio/nexusstudio`の両方で`git status`・`git branch --show-current`・`git log -3`を確認し、0.1節の前提が現在も成り立つか検証する（時間が経過して状況が変わっている可能性があるため）
3. タスクA・タスクBのどちらを進めるか（または両方を並行するか）を、利用者に確認するか、依頼内容から判断する
4. 0.2節の決定記録を、着手前に該当タスクの範囲だけでも目を通す
5. 作業ブランチを作成してから着手する（0.3節）

本文書は両リポジトリのファイルを変更していない。
