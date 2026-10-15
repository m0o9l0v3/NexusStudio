# Nexus Studio Figma理解・画面状態棚卸し

- 作成・確認日：2026-10-08（JST）、v01。調査の整理時点：11:55 JST。
- 対象：[NexusStudio Issue #1](https://github.com/m0o9l0v3/NexusStudio/issues/1)／[Nexus Studio Figma](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio)。
- 状態：現在のFigmaを読み取った調査成果物。製品実装・Figma変更・公開の完了報告ではない。
- 次に読む文書：[23 不足分析](23_NexusStudio_Figma不足分析・追加提案_2026-10-08_v01.md)／[24 実装移行計画](24_NexusStudio_ClaudeCode実装移行計画_2026-10-08_v01.md)。

## 1. 結論と確認範囲

見た目の基準として維持するのは、Sidebar＋Workspace＋必要時のInspector、Loginの中央カード、Eventsの入力部品・開催枠・会場選択・近似Preview、Overviewの状態別表示、Spotsの一覧／抽象地図／Inspector、R01〜R05の公開確認・結果表示である。完成した表現を全体再設計する理由はない。

現在のファイルには1ページ（Page 1、`0:1`）、画面Frame 83件、再利用部品のルート16件（Component Set 14件・単独Component 2件）、プロトタイプ開始点14件がある。Sectionは Phase 1 / Events `64:2`、Phase 1 / Login `64:3`、Phase 1 / Components `64:4`。ページ直下とSection内を両方探索した。83件は状態・幅比較を含むFrame数であり、83種類の機能という意味ではない。

| 確認手段 | 実際に確認したこと | 限界 |
|---|---|---|
| GitHub connector | Issue本文・closed/completed・コメント0件、リポジトリ既定develop | Issueのcloseを成果物・製品の完成証拠にしない |
| Figma Plugin APIの読み取り | 全画面のID・寸法・親構造、部品・Variants、Variables・Text Styles、開始点、代表フローのreactions | 静的な接続確認。ブラウザでの手動クリックは未実施 |
| Figma screenshot | L01、O01、E08、E12、SP01、R01、E30、L05、R04の9画面 | 他の74画面は構造・名前を確認。全状態の見た目を画像で確認したとはしない |
| ローカルの静的読解 | `CLAUDE.md`、`AGENTS.md`、文書21・15最新版・28 v02・00・07〜12・UI補完記録、router・CSS・認証／Events／参照／公開API | API・DB・ブラウザは起動していない。保存／公開／実機挙動は未実行 |

使用チェックアウト：`Nexus Ecosystems/nexus-studio`、ブランチ `develop`、HEAD `63efadccb4488d4f675a59e850a47e806fcefc4d`。調査開始時の変更・未追跡ファイルなし。remoteは `m0o9l0v3/NexusStudio`。旧資料にある `nexus-studio/nexusstudio` とはパスが異なるため、現在のGitルートで調査した。保存先は本IssueとこのフォルダのREADME（D-20）を適用し、リポジトリ内に統一した。

巨大な取得はツールの出力上限に達したため、画面一覧、接続、トークン、画像に分割して再取得した。上限で失敗した出力を確認済みの証拠には使っていない。

## 2. 主要画面・状態・操作の対応

以下の「維持」は確認できた表現を保持するという意味であり、その機能の実動作が完成したという意味ではない。入力値・日付・件数・Release ID・canonical ID・抽象地図は設計用サンプル。

| 領域／代表Node | 目的・入力 | 主要操作・遷移 | 状態・使用部品 | 判定と現実装 |
|---|---|---|---|---|
| Login L01 `54:2`、L02 `55:2`、L03 `55:31`、L04 `55:58`、L06 `93:1763` | 登録済み管理者のメール・パスワード | ログイン→L03、パスワードを忘れた場合→L06 | 通常／認証失敗／処理中／接続失敗／運用者による再発行。Login Button | カードと文言を維持。L03からの完了反応は未接続。コードはLoginPageとIdentityあり |
| 認証切れ L05 `93:1562`、L07 `105:3074` | 編集中／公開結果照会中の再認証 | 戻る／再ログイン、公開中は結果確認へ戻る | Dialog Session、入力保持、自動保存・公開をしない説明 | 表現を維持。L05背景の保存ボタンにも成功遷移があるため、製品では背面操作を遮断する |
| Shell O01内Sidebar `27:3`／Workspace `27:27` | 8領域の移動、対象・環境・管理者表示 | Overview／Events／Spots／Open Campus／Map Data／Validation／Releases／Logs | Nav Item、Account Menu、Toolbar | 配置を維持。代表画面Sidebarの項目自体には遷移がなく、Prototypeは全体ナビを完成させていない |
| Events一覧 E01 `11:2`／E06 `11:178` | 一覧・検索・開催回／公開状態・並べ替え | 新規→E20、対象行→E02、保存後一覧→E07 | E33〜E37は読込／正式0件／検索0件／取得失敗／長い一覧 | Event List Rowを維持。検索・絞り込みの実データ挙動はPrototypeでは証明できない |
| Events編集 E02 `10:2`、E04 `2:2`、E08 `73:243`、E23 `89:1097`、E62 `123:3656` | 共通情報＋複数日／枠、枠ごとの時間方式・参加案内・複数会場・補足 | 枠追加・複製・削除・会場追加／解除／順序変更・下書き保存 | Field、Time Mode、Participation Radio、Venue Row、Slot Summary、Status Badge | 入力部品を維持。画面構成は2026-09-24の利用者判断により実装で1画面へ統合済み。古い分割画面へ戻さない |
| 会場選択 E12 `80:438`〜E17、E53〜E55 | 名称／別名／ID検索、建物・階、同名候補識別 | 候補選択→E04、閉じる→E08。Enter/Escape反応あり | Venue Picker Dialogの6状態、Available／Added／Stopped／Unpublished | 既存表現を維持。実際のfocus trap・復帰・スクロールは未操作 |
| 時間 E09 `76:285`、E51 `101:3392`、E56〜E60 | 開催日・fixed/allDay・atStart/anytime | 終日切替、開催日候補、入力不足修正 | 終日参照／時間指定随時参加／時刻不足／終了不正／公開時間外警告 | 不完全でも下書き保存し、公開阻止と警告を分ける。終日から随時参加を推測しない |
| 保存 S01〜S03、E28〜E30 | 不足・失敗・競合・未保存離脱 | E28→E05（1.2秒後）、S03で保存／破棄／編集継続、E29↔E30比較 | Notice Banner、保存状態、比較Inspector | 見た目を維持。最新版読込による競合解消はFigma不足、ConflictPanelで補完済み |
| 公開 R01 `19:2`〜R05 `19:514` | 保存済み候補と公開中との差分、候補の検証と関連影響 | R01→R02、R02→R03/R04、R04再照会→R03、R05→R01 | 処理中／成功／結果確認中／未反映失敗 | 左差分・右検証を維持。結果照会はサーバー結果依存。R03からRelease詳細、R05への実エラー分岐等は接続不足 |
| Overview O01 `27:2`〜O07 | 公開版・公開開催・Data Health・未公開変更・最近の操作 | Eventsの未公開変更→E01、O04再試行→O01 | 読込／正式0件／取得失敗／保存情報／複数開催回／開催日中止 | 各状態の表現を維持。実コードのOverviewは準備中。集計APIの契約が必要 |
| Spots SP01 `42:2`〜SP04 `45:2` | 名称・ID・建物／階・確認状態・位置・出典・経路・関連イベント | 位置変更→SP02→確定SP03→保存SP04、取消→SP01 | 選択行、抽象地図、Inspector、未確認の強調 | 見た目の基準あり。実装は属性編集まで、位置は保留。Spot単独／地図の公開単位は文書28が優先 |
| Preview E04/E08等の右列 | 編集中／近似表示のイベント詳細、全枠・会場 | 実コンテンツの確認補助 | Generic iPhone Frame、393×852の注記、画像なし | 独立したPreview画面はない。Web近似表示でありiOS動作・経路の証明ではない |
| カテゴリ／Open Campus | 名称・順序・利用状態、開催日・公開時間・中止・参照影響 | 実装に一覧・編集・公開あり | Figmaで独立画面未作成 | UI補完記録に2026-09-24承認構成案あり。再承認を一律に求めず、Figmaへの記録反映を提案 |
| Map Data | 2D/3D・Layers・既存形状編集・Undo/Redo・Dataset公開 | Figma独立画面なし | SP01の抽象地図はMap Editorの完成証拠にならない | 未作成、コードも準備中。設計とデータ保持の技術検証を先行 |
| Validation／Releases履歴／Logs | 全下書き診断・公開履歴と復旧・操作履歴 | 修正／版詳細／復旧／関連記録 | Figma独立画面なし（R01〜R05は公開フロー） | コードと承認構成案あり。R画面の存在だけで履歴領域完成とは扱わない |

## 3. プロトタイプの静的フロー

開始点は Events主要フロー `11:2`、Events公開フロー `10:386`、Overview `27:2`、Spots `42:2`、Login `54:2`、Phase 1の開催枠編集 `73:243`・会場選択 `80:438`・新規 `88:1001`・保存競合 `89:2004`・編集中再ログイン `93:1562`・一覧状態 `95:1804`・長い一覧 `96:1842`・公開中期限切れ `105:3074`・枠折りたたみ `123:3656` の14件。

| 調査フロー | 確認できた接続 | 完成と扱わない部分 |
|---|---|---|
| 1件編集→複製→複数会場→終日→保存→一覧→再表示 | E01→E02、E08「この枠を複製」→E03、E03のデモ複数会場操作→E12、E12の2B選択→E04、E04終日枠→E09、E09保存→E05→E06→E07 | 静的サンプル間の移動。複製でのID発行・順序・DB再取得は未検証。E02の青いPrototype専用アクションは製品UIへ移さない |
| 未公開変更→差分／検証→公開→結果 | E07→R01→R02、結果確認→R03、通信切断デモ→R04→R03、R05→R01 | R04の成功遷移はデモ。R05への実失敗分岐、候補変更後の再確認、検証失敗は独立したAPI状態で補う |
| Overview→必要な作業→戻る | O01/O05のEvents操作→E01、O04再試行→O01 | Map Data修正・Spots診断・Logs詳細等への接続は今回の代表O01内反応では見つからず、Sidebarを含む戻り導線も限定的 |
| Spots選択→位置変更→確定／取消→保存 | SP01→SP02、確定→SP03→SP04、取消→SP01 | ドラッグ反応・正式座標・出典保存・経路整合・ID維持を証明しない |
| 未保存離脱／保存失敗／競合／認証切れ | E02戻る→S03、S03編集／破棄／保存、S02再保存→E05、E29比較→E30、L05再ログイン→編集、L07再ログイン→結果確認 | S03保存成功後の一覧離脱は追加動作が必要。競合比較だけでは最新版に基づく再保存にならない。L03からOverview／失敗への反応は画面自身・子とも見つからない |

操作の正本は07〜12・15・28、見た目の正本は現在のFigmaとする（CLAUDE.md）。Prototype接続は理解と不備の検出に用い、製品の保存・公開条件へ転用しない。手動操作・ネットワーク切断・ブラウザ履歴・キーボード実行は今回未実施。

## 4. 再利用部品・トークン・レイアウト

| [Button](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=6-8) | `6:8` | variant=Primary / variant=Secondary / variant=Danger |
| [Status Badge](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=6-19) | `6:19` | tone=Neutral / tone=Info / tone=Success / tone=Warning / tone=Danger |
| [Login Button](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=68-487) | `68:487` | State=Default / State=Processing |
| [Field](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=69-248) | `69:248` | Kind=Text, State=Default / Kind=Select, State=Default / Kind=Time, State=Default / Kind=Select, State=Disabled |
| [Time Mode](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=70-236) | `70:236` | State=Selected / State=Unselected |
| [Participation Radio](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=70-243) | `70:243` | State=Selected / State=Unselected |
| [Notice Banner](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=70-253) | `70:253` | Tone=Info / Tone=Warning / Tone=Blocking |
| [Dialog](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=71-254) | `71:254` | Kind=Confirm / Kind=Destructive / Kind=Session |
| [Venue Row](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=72-260) | `72:260` | State=Available / State=Added / State=Stopped / State=Unpublished |
| [Nav Item](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=72-267) | `72:267` | State=Default / State=Selected |
| [Event List Row](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=72-298) | `72:298` | Publication=Changes / Publication=Published / Publication=Unpublished |
| [Venue Picker Dialog](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=79-519) | `79:519` | State=Results / State=Loading / State=OfficialEmpty / State=SearchEmpty / State=Failed / State=Stopped |
| [Select Option Row](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=89-1253) | `89:1253` | State=Enabled / State=Disabled |
| [Account Menu](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=94-1644) | `94:1644` | 単独Component |
| [Event List Loading Row](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=95-1798) | `95:1798` | 単独Component |
| [Slot Summary](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=122-3671) | `122:3671` | State=Normal / State=Warning / State=Cancelled |

実装先は `apps/studio-web/src/ui/`（Button、Badge、Field、ChoiceGroup、NoticeBanner、Dialog等）、`shell/`、EventsのSlotCard／VenuePickerDialog／PreviewPanel。FigmaのSelect Option Rowは現在の実装では標準selectへ、時刻は標準time入力へ置換されている（UI補完記録）。これを未記録の差として再設計しない。

Variables：`Nexus Studio / Light`、1 mode（Mode 1）、20変数。Color 12個（Canvas、Surface、Surface/Subtle、Text/Primary、Text/Secondary、Border、Brand、Brand/Subtle、Success、Warning、Danger、Overlay）、Space 4/8/12/16/24/32、Radius 6/10。主要色は実装CSSへ対応済み。**Color/Overlayは現在Figmaで変数化済み**だが、`src/index.css`には未変数化だった旨の古い注記が残る。古い資料から「変数なし」と断定しない。

Text Styles：Noto Sans JP、Title 24/34 Bold、Heading 18/28 Bold、Body 14/22 Regular、Body Strong 14/22 Medium、Caption 12/18 Regular（文字サイズ／行高px）。Light以外のmodeは確認されない。Paint／Effect Stylesの網羅調査と全ノードの変数束縛率は未実施。

代表Shellは1440×1024、Sidebar 216×1024、Workspace 1224×1024。W01/W02/W03は1920×1080。E08の入力カードや部品はAuto Layoutを使用するが、Loginの画面ルートはNONE。全画面ルートのoverflowはNONE・clipありで、内部スクロールを別に設ける例がある。

- E09 `76:319`、E29 `89:2038`、E30 `90:1531`、L05 `93:1596`：Event Editor 824×960、VERTICAL。
- E37 `96:1871`：Workspace Body 1224×960、VERTICAL。
- 代表E08内では非NONEのスクロールFrameが取得されなかった。長い枠・会場の組合せは実ブラウザで確認する。
- E30画像では左の長いフォームが下端へ続く。右の比較Inspectorに「最新版を読み込む」は無く、ループ／編集へ戻るだけ。
- E12にキーボード説明とEnter/Escape反応はある。実DOMのtab順・focus復帰・読み上げ・200%拡大は別検証。
- 状態は文字と色を併用する。一部小さいCaption、薄い無効表示、Warning色のコントラストの数値監査は未実施。合格とは宣言しない。

## 5. 仕様・データ・APIへの追跡

| 仕様の出典 | 現在のFigma | 実装に必要な情報／現在の静的対応 |
|---|---|---|
| 12 UI-01〜04・UA-01/03 | L01〜L07 | Identity・Cookie・CSRF、GET csrf/me、POST login/logout、401時入力保持。公開signupなし |
| 12 UI-05〜10・18承認 | O01〜O07・Shell | 現行Release、公開開催、領域別下書き数、検証時点、Logs集計。Overview専用APIは今回確認したルートにない |
| 07 EV-31〜43・AC02〜08/21〜26 | E03/E04/E08/E09/E12/E41〜45/E51/E56/E59/E60/E62 | EventDraft `studio.event/1`、安定slotId、ocDayId、fixed/allDay、atStart/anytime、canonicalSpotId・noteの順序 |
| 07 EV-19・AC20、12 UI-11〜14/23 | S02/S03/E28〜30/L05 | operationId再送・rowVersion・409最新版、保存済みと未保存の別管理、同一管理者の再認証と別管理者への切替 |
| 07 EV-07、08 CAT、07 AC09 | E17/E24/E25/E52/E61 | 新規選択停止と既存参照を区別。参照取得・公開済みSpot判定。カテゴリ管理画面そのものはなし |
| 07 EV-09/37、08 OC | E38（説明）、O07 | 枠中止と開催日中止は別保存。実装SlotCard／OccurrenceEditorPage、Figmaは入力・解除・影響表示が不足 |
| 09 SP-01〜24、28 S4-2/7 | SP01〜04 | 属性と位置の公開単位を分離。SpotDraftはName/Aliases/Utilizationのみ、説明は現在DTOにない。位置／出典／接続は推定不可 |
| 10 ME-01以降 | Map Data独立画面なし | 編集Revisionの原本保持、配信用Schemaとの分離、2D/3D・Layers・Undo/Redo・地図公開の技術検証 |
| 11 RA-01/04〜07・17、28 | R01〜05/L07 | previewで候補固定・検証、confirmedValidationId、operationId照会。全下書き診断の結果を公開許可へ流用しない |
| 11 RA-09〜12、12 UI-18〜19 | 履歴／Logs／Validation独立画面なし | コードはReleaseHistory／DraftDiagnosis／LogEndpointsと各画面あり。PG障害試験・iOS確認の完了を推測しない |
| 12 UI-20〜21、07 EV-08/20 | 編集内Preview、画像管理の独立状態なし | 現EventDraftに画像参照なし。画像任意の初期到達点と画像を含む完成条件を分ける |

## 6. 全83画面のNode索引

この表の全件を構造確認した。画像確認の9画面は§1に限定している。画面名の番号飛びから欠落を推測せず、目的ごとの不足を23で判断する。

| 現在の画面名／Figmaリンク | Node ID | サイズ | ルートLayout | 確認 |
|---|---|---|---|---|
| [E04 Events — 複数枠・二会場・終日](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=2-2) | `2:2` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E02 Events — 午前枠を編集](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=10-2) | `10:2` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E03 Events — 午後・別日へ複製](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=10-130) | `10:130` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E05 Events — 下書き保存済み](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=10-258) | `10:258` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E07 Events — 再度開いて保存内容を確認](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=10-386) | `10:386` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E01 Events — 一覧](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=11-2) | `11:2` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E06 Events — 保存後の一覧](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=11-178) | `11:178` | 1440×1024 | HORIZONTAL | 構造確認 |
| [S01 State — 会場未選択](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=12-2) | `12:2` | 1440×1024 | HORIZONTAL | 構造確認 |
| [S02 State — 保存失敗](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=12-102) | `12:102` | 1440×1024 | HORIZONTAL | 構造確認 |
| [S03 State — 未保存離脱](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=12-232) | `12:232` | 1440×1024 | HORIZONTAL | 構造確認 |
| [W01 Events — 1920×1080比較](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=14-2) | `14:2` | 1920×1080 | HORIZONTAL | 構造確認 |
| [R01 Publish — 差分・検証・影響](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=19-2) | `19:2` | 1440×1024 | HORIZONTAL | 構造確認 |
| [R02 Publish — 公開処理中](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=19-130) | `19:130` | 1440×1024 | HORIZONTAL | 構造確認 |
| [R03 Publish — 公開成功](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=19-258) | `19:258` | 1440×1024 | HORIZONTAL | 構造確認 |
| [R04 Publish — 結果確認中](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=19-386) | `19:386` | 1440×1024 | HORIZONTAL | 構造確認 |
| [R05 Publish — 未反映の失敗](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=19-514) | `19:514` | 1440×1024 | HORIZONTAL | 構造確認 |
| [O01 Overview — 通常](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=27-2) | `27:2` | 1440×1024 | HORIZONTAL | 構造確認 |
| [O02 Overview — 読み込み中](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=34-2) | `34:2` | 1440×1024 | HORIZONTAL | 構造確認 |
| [O03 Overview — 正式0件](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=34-130) | `34:130` | 1440×1024 | HORIZONTAL | 構造確認 |
| [O04 Overview — 取得失敗](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=34-258) | `34:258` | 1440×1024 | HORIZONTAL | 構造確認 |
| [O05 Overview — 保存情報を表示](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=34-386) | `34:386` | 1440×1024 | HORIZONTAL | 構造確認 |
| [O06 Overview — 複数開催回](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=34-514) | `34:514` | 1440×1024 | HORIZONTAL | 構造確認 |
| [O07 Overview — 開催日中止](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=34-642) | `34:642` | 1440×1024 | HORIZONTAL | 構造確認 |
| [SP01 Spots — 選択・Inspector](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=42-2) | `42:2` | 1440×1024 | HORIZONTAL | 構造確認 |
| [SP02 Spots — 位置変更モード](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=44-2) | `44:2` | 1440×1024 | HORIZONTAL | 構造確認 |
| [SP03 Spots — 位置変更確定・未保存](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=44-135) | `44:135` | 1440×1024 | HORIZONTAL | 構造確認 |
| [SP04 Spots — 下書き保存済み](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=45-2) | `45:2` | 1440×1024 | HORIZONTAL | 構造確認 |
| [L01 Login — 通常](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=54-2) | `54:2` | 1440×1024 | NONE | 構造確認 |
| [L02 Login — 認証失敗](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=55-2) | `55:2` | 1440×1024 | NONE | 構造確認 |
| [L03 Login — 処理中](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=55-31) | `55:31` | 1440×1024 | NONE | 構造確認 |
| [L04 Login — 接続エラー](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=55-58) | `55:58` | 1440×1024 | NONE | 構造確認 |
| [E08 Events — 開催枠を編集](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=73-243) | `73:243` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E09 Events — 終日・参照時間](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=76-285) | `76:285` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E12 Events — 会場を選択](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=80-438) | `80:438` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E13 Events — 会場候補を読み込み中](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=81-519) | `81:519` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E14 Events — 会場候補が正式0件](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=81-664) | `81:664` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E15 Events — 会場検索0件](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=81-809) | `81:809` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E16 Events — 会場取得失敗](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=81-954) | `81:954` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E17 Events — 新規選択停止](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=81-1099) | `81:1099` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E10 Events — 公開阻止を修正](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=82-876) | `82:876` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E11 Events — 枠の削除確認](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=87-909) | `87:909` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E18 Events — 公開時間外の要確認](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=87-1048) | `87:1048` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E20 Events — 新規イベント](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=88-1001) | `88:1001` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E21 Events — 無題の下書き保存済み](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=88-1156) | `88:1156` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E22 Events — 無題のイベント一覧](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=88-1252) | `88:1252` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E23 Events — 共通情報を編集](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=89-1097) | `89:1097` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E24 Events — カテゴリを選択](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=89-1254) | `89:1254` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E25 Events — カテゴリ取得失敗](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=89-1412) | `89:1412` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E26 Events — 開催回の変更確認](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=89-1565) | `89:1565` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E27 Events — 開催日を再選択](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=89-1722) | `89:1722` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E28 Events — 下書き保存中](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=89-1873) | `89:1873` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E29 Events — 保存の競合](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=89-2004) | `89:2004` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E30 Events — 最新の保存内容と比較](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=90-1497) | `90:1497` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E31 Events — 管理者メニュー](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=94-1648) | `94:1648` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E32 Events — 未保存ログアウト確認](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=94-1782) | `94:1782` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E33 Events — 一覧読み込み中](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=95-1804) | `95:1804` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E34 Events — 正式0件](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=95-1878) | `95:1878` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E35 Events — 検索結果0件](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=95-1952) | `95:1952` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E36 Events — 一覧取得失敗](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=95-2026) | `95:2026` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E37 Events — 長い一覧・多数会場](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=96-1842) | `96:1842` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E19 Events — 枠削除済み・未保存](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=97-2044) | `97:2044` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E42 Events — 二会場を編集](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=98-2056) | `98:2056` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E43 Events — 二会場の順序変更](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=98-2207) | `98:2207` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E41 Events — 会場解除・未保存](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=98-2357) | `98:2357` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E38 Events — 枠中止の説明](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=98-2487) | `98:2487` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E44 Events — 2B会場を解除](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=98-2634) | `98:2634` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E45 Events — 2A会場を解除](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=98-2745) | `98:2745` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E53 Events — 同名の別会場を選択](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=101-2441) | `101:2441` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E52 Events — 未公開Spotを会場に選択](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=101-2571) | `101:2571` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E54 Events — 会場候補にキーボード焦点](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=101-2900) | `101:2900` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E55 Events — 次の会場候補に焦点](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=101-2990) | `101:2990` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E56 Events — 開催日候補を選択](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=101-3252) | `101:3252` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E51 Events — 時間指定・随時参加](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=101-3392) | `101:3392` | 1440×1024 | HORIZONTAL | 構造確認 |
| [W02 Events — 開催枠編集 1920幅](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=104-2791) | `104:2791` | 1920×1080 | HORIZONTAL | 構造確認 |
| [W03 Events — 長い一覧 1920幅](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=104-2879) | `104:2879` | 1920×1080 | HORIZONTAL | 構造確認 |
| [E58 Events — 編集対象を読み込み中](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=107-3095) | `107:3095` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E59 Events — 日付・時刻不足](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=117-3099) | `117:3099` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E60 Events — 終了時刻の不正](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=117-3199) | `117:3199` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E61 Events — 既存カテゴリ参照を維持](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=117-3372) | `117:3372` | 1440×1024 | HORIZONTAL | 構造確認 |
| [E62 Events — 開催枠を閉じて確認](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=123-3656) | `123:3656` | 1440×1024 | HORIZONTAL | 構造確認 |
| [L05 Login — 編集中に期限切れ](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=93-1562) | `93:1562` | 1440×1024 | HORIZONTAL | 構造確認 |
| [L06 Login — アカウント再発行の案内](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=93-1763) | `93:1763` | 1440×1024 | NONE | 構造確認 |
| [L07 Login — 公開中の期限切れ](https://www.figma.com/design/q6LGxRaRKI7OrOxKbgI8Fe/Nexus-Studio?node-id=105-3074) | `105:3074` | 1440×1024 | HORIZONTAL | 構造確認 |

## 7. 根拠と未確認事項

根拠は本日取得したFigma実ファイル、[Issue #1](https://github.com/m0o9l0v3/NexusStudio/issues/1)、このフォルダの21・07〜12・15（2026-09-22 v02）・18〜20・28 v02、[UI補完記録](../UI補完記録.md)、[CLAUDE.md](../../CLAUDE.md)、[router](../../apps/studio-web/src/router.tsx)、[CSS](../../apps/studio-web/src/index.css)、[EventDraft](../../apps/studio-api/Events/EventDraft.cs)、[SpotEndpoints](../../apps/studio-api/Reference/SpotEndpoints.cs)である。過去の「Phase 2未作成」は本日の全画面一覧と突合して用いた。

nexus-mobile側の旧参照 `docs/decisions/E0-7-studio-scope-split.md` は現在の隣接チェックアウトに存在しなかった。本調査ではそのファイルを現行正本として確認できたとはしない。Studio側の15・28で責務境界を確認した。正式な地図原本・本番・秘密値は未閲覧。ブラウザ比較・実保存・実公開・iOS接続・PG17動作・プロセス停止試験は未実施であり、24の検証計画へ残す。
