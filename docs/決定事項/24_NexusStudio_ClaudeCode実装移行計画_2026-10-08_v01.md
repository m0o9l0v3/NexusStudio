# Nexus Studio Claude Code実装移行計画

- 作成日：2026-10-08（JST）、v01。状態：次の作業を選ぶための計画。今回は製品実装を開始しない。
- 根拠：[22 棚卸し](22_NexusStudio_Figma理解・画面状態棚卸し_2026-10-08_v01.md)／[23 不足分析](23_NexusStudio_Figma不足分析・追加提案_2026-10-08_v01.md)、15（2026-09-22 v02と同日v01）、28 v02、CLAUDE.md、UI補完記録。
- 対象：[Issue #1](https://github.com/m0o9l0v3/NexusStudio/issues/1)、[現在のFigma](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio)。
- 調査基準：ローカル `develop`、`63efadccb4488d4f675a59e850a47e806fcefc4d`。実装ファイルの静的確認であり、実行・CI・本番の合格を意味しない。

## 1. 最初に選ぶ範囲

**推奨する最初の作業単位は「既存の認証・Shellを通り、イベント1件を複数日・複数枠・複数会場へ編集し、下書き保存→一覧→再表示できることを確認し、差分だけを補う」である。**

Issue #1はStep 1・2の前提だったが、現在のコードには両StepとStep 3・4の実装がある。初期計画を未着手として再実装せず、承認済みの統合編集と既存APIを用いる。古い分割Figmaへ戻さない。最初の単位では公開API・地図編集・配信・iOSの機能拡張を混ぜない。

| 現在の状態 | 根拠 | 次の扱い |
|---|---|---|
| Step 0 基盤・validator・schema・migrationsあり | studio-api、studio-api-tests、docs/schemas | 必要な契約を再利用。依存を入れ直さない |
| Step 1 Identity・Cookie・CSRF・管理者CLI・Login・Shellあり | AuthEndpoints、RequireAuth、SessionExpiredDialog、shell | Figma・直接API保護・401入力保持の比較検証 |
| Step 2 イベント下書き保存・排他・参照・統合編集あり | EventEndpoints、EventDraft、EventEditorPage等 | 最初の到達点を再現して証拠を残す |
| Step 3 開催回・カテゴリ・Spot属性編集あり | Reference各APIと各page、UI補完記録 | 承認構成案をFigma資料と対応。地図位置は別 |
| Step 4 候補検証・公開・履歴・復旧・Logs・診断あり | Publishing各API、publishing／Releases／Logs／Validation | 実PG・障害試験・配信整合は別検証 |
| Overview／Map Data本文 | routerではPlaceholderPage | 新規に実データ／地図機能を設計する |
| Step 5 配信・iOS接続／Step 6旧管理系縮小 | CLAUDE.md／15／28で後続範囲 | 現チェックアウトだけで完成状態を決めない。別repoの最新状態から確認 |

現在の技術構成はReact 18＋TypeScript＋Vite＋Tailwind v4、React Router、TanStack Query、Radix、生成OpenAPI型、.NET 10／EF Core／Npgsql。新しいUIライブラリへ置き換えず、CSSトークンと既存部品を使う。パッケージの更新・追加は本計画の作成では行わない。

## 2. Step 1：対象Node・Component・データ・API

Nodeリンクは[22の索引](22_NexusStudio_Figma理解・画面状態棚卸し_2026-10-08_v01.md#6-全83画面のnode索引)を参照。部品リンクも22 §4にある。

| 実装単位／対象Node | 保持する見た目／既存Component | 状態・データ | 実API／既存コード | 完了条件 |
|---|---|---|---|---|
| 1-a Login：L01 `54:2`、L02 `55:2`、L03 `55:31`、L04 `55:58`、L06 `93:1763` | 中央カード、メール／パスワード、Login Button `68:487`、既存TextField／Button | 入力不足・認証失敗・処理中・通信失敗。登録済み管理者だけ | GET `/api/auth/csrf`、POST `/api/auth/login`、GET `/api/auth/me`。LoginPage／session／AuthEndpoints | 成功でOverviewへ、失敗は入力保持。認証失敗でアカウント有無を公開しない |
| 1-b Shell：O01 `27:2`、Sidebar `27:3`／Toolbar `27:28`、E31 `94:1648` | Sidebar216px、Workspace、8領域、Nav Item `72:267`、Account Menu `94:1644` | SessionResponseのdisplayName/email/environmentLabel、選択領域 | RequireAuth／AppShell／Sidebar／Toolbar／AccountMenu／router、GET me | 直接URLも認証必須。未実装領域は0件を装わず準備中 |
| 1-c 認証切れ：L05 `93:1562`、L07 `105:3074` | Dialog Session `71:254`、エラーはLoginと同じ表現 | API401・再認証中・同一／別管理者。保存／公開を自動再実行しない | SessionExpiryProvider／SessionExpiredDialog、POST login、GET me | 同管理者は編集入力保持。別管理者で前の状態を破棄。公開中は結果照会へ戻る |
| 1-d Logout／離脱：E32 `94:1782`、S03 `12:232` | 共通確認Dialogと3選択、既存LeaveGuard | dirty、保存中／失敗、遷移先。認証と編集状態を分ける | POST `/api/auth/logout`、UnsavedChangesProvider／LeaveGuard | 変更なしは直接ログアウト、変更ありは明示選択。保存失敗で移動しない |
| 1-e 管理者運用：画面新設なし | 公開signup／Users画面を増やさない | 個別管理者・有効／無効・再発行 | AdminCommand／AdminAccountServiceの運用者CLI | 隔離環境で登録／無効化／再発行と既存sessionへの反映を検証 |

Step 1の未認証APIはログインページへの302でなく401、CSRF不足は拒否、Cookie失効後の保存は成功表示にしない。管理者CLIは検証環境のテストアカウントだけで確認し、本番のアカウントや認証設定を本計画から変更しない。

## 3. Step 2：対象Node・Component・データ・API

| 実装単位／対象Node | 保持する見た目・既存Component | データ・状態 | API／コード | 完了条件 |
|---|---|---|---|---|
| 2-a 一覧 E01 `11:2`、E06 `11:178`、E33〜37 | Event List Row `72:298`、FilterChip、正式0件／検索0件／取得失敗 | EventSummary、公開状態、title、枠／会場要約、updatedAt、filter | GET `/api/events`、EventListPage | 保存した対象を一覧から再表示。失敗を0件扱いしない。長い行の操作が届く |
| 2-b 共通情報 E23 `89:1097`、E20 `88:1001`／E21 | 共通情報カード、Field `69:248`、Notice Banner `70:253` | title、description、categoryId、occurrenceId。未入力の下書きを許可 | GET `/api/events/{id}`、GET `/api/reference`、CommonInfoCard／EventEditorPage | 開催回変更で所属外の日を外して再選択、選択停止カテゴリの既存参照を保持 |
| 2-c 枠 E08 `73:243`、E09 `76:285`、E62 `123:3656` | SlotCard、Slot Summary `122:3671`、Time Mode `70:236`、Participation Radio `70:243` | slotId、ocDayId、timeMode、fixed、participation、status、cancelNote、venues | EventDraft／SlotCard。新規POST `/api/events`、更新PUT `/api/events/{id}` | 複製は新slotId、日時変更はID維持。複製後の中止解除・案内空欄は仕様と突合 |
| 2-d 会場 E12 `80:438`〜E17、E42/43/53〜55 | Venue Picker Dialog `79:519`、Venue Row `72:260`、補足・上へ／下へ／解除 | canonicalSpotId文字列、note、配列順。同名・停止・未公開・既存参照 | GET `/api/spots`、GET `/api/spots/lookup`、VenuePickerDialog | IDを推測・正規化しない。同枠で重複しない。全会場と順序・補足を保存 |
| 2-e 保存 E05 `10:258`、S02 `12:102`、E28 `89:1873` | Toolbar保存Badge、Notice Banner、明示保存 | operationId、rowVersion、Revision、保存snapshotと現在入力 | createEvent／updateEvent、EventEndpoints | 応答が無いとき成功を推測せず入力保持。同一snapshotの再送は同operationId。保存中追加入力を消さない |
| 2-f 競合 E29 `89:2004`／E30 `90:1497` | 左フォーム＋右比較、追加済み［最新の内容を読み込む］ | 409、最新rowVersion、自分の入力、最新保存内容 | ConflictPanel、EventEditorPage | 無断上書きなし。最新読込後に比較を残して手動反映・明示再保存できる |
| 2-g Preview E04 `2:2`／E08 | 右のGeneric iPhone Frame、編集中・近似表示の区別 | 共通情報・全枠／全会場、日別終日時間、参加案内、中止理由、未入力 | PreviewPanel、参照情報 | 欠けた値を推測しない。全会場表示と実iOSの完成を分ける |
| 2-h 公開前ヒント E10 `82:876`／E18/E52/E59/60 | Notice Banner、枠要約の警告 | 会場0・日付不足・時刻不足等は公開阻止ヒント、時間外は要確認 | フロントの入力ヒント。最終検証はStep 4 CandidateValidator | 下書き保存を妨げない。ヒントを公開許可へ流用しない |

### 3.1 保存payloadの最低契約

既存 `Events/EventDraft.cs` と生成OpenAPI型を正とする。新規の架空DTOを導入しない。

- `schemaVersion: studio.event/1`、title、description、categoryId、occurrenceId、slots。
- 枠：slotId、ocDayId、timeMode（fixed/allDay/null）、fixed（fixed時のみStart/End）、participation（atStart/anytime/null）、status（normal/cancelled）、cancelNote、venues。
- 会場：canonicalSpotId、note。venuesの順序は表示順。Spot IDは大文字小文字を含め厳密保持する。
- 保存要求はoperationId、更新時rowVersion、draft。正式0件や未選択は空配列／nullとして扱い、表示サンプルから埋めない。
- 終日の実時刻をpayloadへ焼き込まない。日別の開催時間から表示／公開時の参照を解決する。
- 保存不足とシステムで扱えない入力を分ける。会場0・カテゴリ未選択・参加案内未選択でも下書き保存可能。
- 現EventDraftには画像参照、SpotDraftには説明がない。23 G16の別契約作業に分ける。

### 3.2 Step 2の完了条件

1. 午前枠→午後／別日複製、複数会場、終日と時間指定、随時参加を保存し、再取得で枠ID・順序・会場順・補足・時間方式・参加案内・中止状態が一致する。
2. canonical IDは保存前後で1文字も変わらない。名称・同名候補・建物／階からIDを推測しない。
3. 入力不足の下書きを保存でき、一覧では無題・不足を適切に表示する。
4. 2タブの古いrowVersion保存は409。最新内容と自分の入力を残し、無断上書きしない。
5. 保存通信失敗・401・離脱時保存失敗でも入力が残る。同operationId再送でRevisionを増やさない。
6. 1440×1024と1920×1080で保存・会場追加・順序変更・離脱・再表示を操作できる。全会場を近似Previewに表示する。

見た目だけ・Prototypeだけの達成は「実保存完了」としない。今回この6条件を実行済みとしてはいない。

## 4. 以降の実装・検証順序

| 順序／単位 | 依存・対象Node | Component・データ・API | 完了条件と境界 |
|---|---|---|---|
| A 既存Step 1・2比較検証 | §2〜3、23 G02〜05/G15 | 現UI・API・隔離DB | 最初の到達点と失敗復帰の証拠。差があれば小さな修正単位で扱う |
| B 承認済みPhase 2の記録整理 | 28・UI補完記録。Figma独立Nodeなし | OpenCampusListPage／OccurrenceEditorPage、CategoriesPage、SpotsPage。GET/POST/PUT `/api/occurrences`、GET/PUT `/api/categories`、GET directory/item・PUT itemの `/api/spots` | 構成承認済みを再確認の待ちにせず、実装を基準にFigma反映案を保存。位置編集は保留 |
| C 既存公開の完成検証 | R01〜05、L07、23 G06/07/11 | PublishReviewPage／ValidationPanel／ReleaseHistory、POST preview、POST releases、GET operations | 候補とrelated data変更で再検証・確認。実PG・障害で直前版維持、冪等と照会を確認 |
| D Overview本文と集計API | O01〜07、23 G09 | 既存カード表現を維持、summary取得契約は未実装の提案。既存Reference／Release／DraftDiagnosis／Logsを参照 | 未取得を0件にしない。公開状態と下書き問題を分け、保存情報の取得日時・stale表示、修正・Logs導線 |
| E Map Data技術検証と構成案 | 23 G12/13、SP01〜04、10 ME、15 v01技術検証 | 同一編集データの2D/3D、Layers、Inspector、Undo/Redo、原本保持とprojection、Schema pin | 先に新規構成を確認。MultiPolygon／穴／出典／経路／未編集属性の往復で消失なし。既存DB・正式原本を変更しない |
| F Map Data／Spots位置を製品へ接続 | E合格、SP02〜04、R01流用 | Dataset全体Revision／検証／公開／復旧、SpotPlacementと経路接続 | 属性単独公開と地図全体公開を維持。移動取消・保存競合・経路影響を検証 |
| G 画像／Spot説明の契約追加 | 23 G16の範囲選択 | DTO・OpenAPI型・Revision・差分・履歴・素材保持・配信 | 画像任意、処理失敗と旧素材保持、過去版復旧。新機能として他単位と分ける |
| H 配信とiOS接続（Step 5） | C、地図対象はF、nexus-mobileの最新状態 | public-apiの版付き配信・読み取り権限、manifest/events/map-dataset、iOS取得／保存／版切替 | 同じRelease一式で全枠・全会場・中止・終日を表示。部分失敗は直前版維持。実機証拠 |
| I 旧管理系縮小（Step 6） | H完了と明示された移行範囲 | 二重書込を止める、旧互換経路・文書整合 | 当初計画だけで旧画面／APIを削除しない。最新移行状態と明示指示を適用 |

Cで使う現在のAPI：
- POST `/api/releases/preview`：公開候補・差分・関連影響・検証。
- POST `/api/releases`：operationId・entries・confirmedValidationIdを用いる公開／取り下げ／復旧。
- GET `/api/operations/{operationId}`：実結果の照会。
- GET `/api/releases`／`/{id}`：履歴・版詳細。
- POST `/api/validation/draft`、GET `/api/validation/draft/latest`：全下書き診断。公開確認に流用しない。
- GET `/api/logs`／`/{id}`：操作記録。

Spot独立の現在DTOはName・Aliases・Utilization、建物／階は読取のみ。位置・建物・階・経路は地図と共に公開する。説明を含む当初の仕様と現DTOの差は23 G16へ追跡する。

## 5. 検証と証拠の残し方

### 5.1 見た目とブラウザ操作

Figmaの現在Nodeを実装開始時に再取得し、固定viewportで並べて比較する。サンプル値を用いる場合は隔離した設計用fixtureであることを明記する。

| 検証 | 比較先 | 合格に必要な証拠 |
|---|---|---|
| LoginとShell | L01/L02/L04、O01、Sidebar216px | 1440×1024画像。中央カード、8領域、選択、環境、管理者、focus |
| 統合編集 | E23の共通欄＋E08の枠入力＋E62の要約＋E04のPreview | 2026-09-24統合を比較基準に明示。余白・文字切れ・上下一覧・保存位置、1920幅はW01/W02 |
| 長い一覧／多数会場 | E37/W03、E42/E43 | 長い名称、最大許容範囲の枠／会場で重なりなし。スクロール後も操作可能 |
| 会場Dialog | E12〜17/E53〜55 | 読込／0件／検索0件／失敗／停止、同名識別、Tab/矢印/Enter/Escape、閉じた後のfocus復帰 |
| 保存失敗・競合・離脱 | S02/S03/E29/E30/L05 | 入力保持、最新版読込、保存失敗時移動しない、Dialog背面操作不可 |
| 公開結果 | R01〜05/L07 | 確認後変更、検証失敗、通信不明、結果照会、期限切れ、再認証で自動公開しない |

公開内容の確認に未保存Previewの値を混ぜない。近似Previewに「全会場」の表示があっても実アプリの案内先の確認を別に残す。200%拡大、keyboardのみ、focus visible、Dialog読み上げラベル、色に加えた状態テキスト、実際の配色のコントラスト測定を含める。

### 5.2 自動テストと実DB

既存テストを根拠に不足した検証だけを追加する。同じ実装をなぞるテストを増やさない。

| 検証対象 | 既存の参照先 | 次作業で実行・追加する確認 |
|---|---|---|
| 認証・CSRF・無効管理者 | AuthEndpointsTests／AdminAccountTests | 未認証401、CSRF不足、無効化、Cookie期限切れ。画面の誤成功表示はブラウザでも確認 |
| 下書きの往復・不足・排他・再送 | EventEndpointsTests | SavedDraft_RoundTripsWithoutLosingOrChangingAnything、Update_WithStaleRowVersion_Returns409WithTheLatestAndDoesNotOverwrite、RetriedSave_WithTheSameOperationId_DoesNotDuplicateOrConflictを実行。JSON正規化比較、canonical ID・配列順 |
| 参照・選択停止・開催日 | ReferenceDataTests／ReferenceEditingTests | 既存参照保持、開催回変更、親中止と枠中止の独立、終日時間 |
| 候補検証・公開・復旧 | PublishingTests | 関連版変更、無関係なdraft、未公開Spot、同operationId、退避Revision、新Release |
| OpenAPI・Schema | OpenApiDocumentTests／PinnedSchemaHashTests | DTO更新時は文書／生成型／Schema hashの整合 |

`StudioApiFactory`はSQLiteメモリDBへ差し替えるテストである。そこで合格してもNpgsql/PostgreSQLの排他・トランザクション・プロセス停止の合格とはしない。専用の隔離PostgreSQLで以下を実行し、公開前後のRevision／Publication／Release／operationIdを突合する。

1. 公開処理途中でAPIプロセス停止→再起動→結果照会。
2. 同じoperationIdの再送／連打／同時要求でReleaseの重複がない。
3. 応答前の通信切断で実結果を照会し、新しい公開操作を自動発行しない。
4. 確認後に候補や関連公開データ変更→再検証／再確認。
5. 無関係な地図／イベント下書きエラーが正しい対象の公開を阻止しない。
6. 未公開Spot参照の公開を阻止し、自動公開しない。
7. 検証サービス失敗を合格扱いせず、公開版を維持する。
8. 復旧前の未公開下書きを退避し、現参照で検証して新Releaseを作る。

当該試験の環境・操作・期待結果・実結果・operationId・関連版・画面画像を保存する。既存PG17の停止・削除・接続先変更や本番障害注入は計画に含めない。

### 5.3 完成状態の区別

| 報告できる状態 | 必要な証拠 |
|---|---|
| Figmaを理解した | 22のNode／状態／反応と代表画像 |
| 見た目を再現した | 固定viewportでの実ブラウザ比較 |
| モックで操作できた | fixtureを用いた操作結果。DB保存とは別 |
| 実下書きを保存できた | 隔離DB保存と再取得payload一致、排他・失敗復帰 |
| 実公開／復旧できた | 隔離PGで原子性・冪等・障害・照会・版維持 |
| iOSへ接続できた | 版付き配信と端末の整合切替・全会場・実機確認 |
| 本番完了 | 明示された本番作業と現環境の検証。上記のいずれも代替しない |

## 6. 追加提案の採否で変わる範囲

| 選択 | 変わる範囲 | 推奨 |
|---|---|---|
| 最初にAの既存Step 1・2検証を行う | 既存UIとAPIを利用し、差があれば限定修正。新領域は混ぜない | 最初の作業に採用 |
| 先にOverview Dを行う | 集計API契約、版／診断時点、実データ導線の設計が必要 | Aの保存証拠が得られた後 |
| Map Data E/Fを行う | 新規画面構成の確認、原本保持の技術検証、地図公開契約が必要 | 23 §3.1を具体化してから |
| Phase 2をFigmaへ記録する | 承認済み構成案と実装を対象に書き込みが必要 | 製品差分確認後、別のFigma反映指示で |
| 画像／説明を追加する | 保存DTO・素材・履歴・復旧・配信の契約が増える | Gの別作業にする |

完成済みFigmaの一律再承認、採用済みのSpot公開単位やStudio責務分離の再判断は不要。本書の新規提案だけを必要時に判断する。

## 7. 次の実装者への引き継ぎ

1. 現在のGitルート、HEAD、dirty state、AGENTS.md／CLAUDE.md、対象Issue／PRとFigma Nodeを再確認する。本書のHEADや画面状態が最新とは限らない。
2. 22→23→24、15最新版と28 v02、UI補完記録を読み、見た目・動作・補完の根拠を分ける。
3. §1の最初の単位を選ぶ指示がある場合は既存Step 1・2を検証し、差分だけを扱う。実装を画像貼り付けで代替しない。
4. 本書で列挙した未知の状態をサンプル・推測で埋めない。正式ID／位置／出典／入口／経路・公開結果は証拠から扱う。
5. 実装時の補完はUI補完記録へ1件1行で追跡し、Figma要反映を記録する。
6. 既存コード・Figma・DB・原本・依存・デプロイ・Issueを、この文書作成の指示から変更しない。commit／pushや外部投稿も今回行わない。

三文書の作成により、現在の主要画面・フローを説明し、不足を優先度付き具体案へ落とし、Step 1・2の対象Node／Component／データ／APIと次の作業を選べる状態にした。実行検証の未確認部分は§5に残しており、製品の完成や本番完了へ読み替えない。
