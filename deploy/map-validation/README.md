# 地図の公開判定に使う承認済み設定

NexusStudio #11。Studio は地図（MapDataset）を公開する前に、nexus-mobile から移植した `MapDatasetValidator` で公開判定を行う。判定には地図の GeoJSON だけでは決まらない値が要り、検証器はそれを**呼び出し側が与える信頼できる値**として受け取る（nexus-mobile `docs/implementation/issue-18-map-dataset-validator.md`「公開判定に必要なcontext」）。値を推測・補完せず、無ければ `missing_validation_context` で公開を止める。

値は2種類に分ける（決定事項31）。

| 種類 | 置き場所 | 変わる時 |
|---|---|---|
| A. キャンパス全体の承認済み設定 | 本ディレクトリの `approved-settings.json`（Git でレビュー） | キャンパスや許容値の方針を見直した時だけ |
| B. 地図の版ごとの根拠 | 地図の取り込みコマンド（`map import`）で、GeoJSON と一緒に渡す | 地図の版ごと |

## A. `approved-settings.json`

**2026-11-01 にオーナー（m0o9l0v3）が承認した（`status: approved`）。ただし `startNodeIds` は未記入（null）。** 出発ノードは経路データ（nexus-mobile #16・#39）が未作成でノード ID が存在しないため、まだ決められない。`approved` でも null の項目は `missing_validation_context` のままなので、`startNodeIds` を記入して承認し直すまで地図は公開できない（Spot も、決定事項31 D2 により地図が無いと公開できない）。値の変更は、オーナーが記入・承認し、PR でレビューしてから使う。開発チームは値を作らない。

| 項目 | 承認した値 | 根拠・経緯 |
|---|---|---|
| `campusBoundary` | 6頂点の Polygon（ファイルのとおり） | オーナーが作図して提供。2点目の経度・緯度の順の入れ替えと、時計回りだった並びの反転（形は同じ）は、オーナーの了承を得て直した。nexus-mobile `map-data/normalized/entrances.csv` の入口12か所と ENU 原点がすべて内側にあることを確認した |
| `enuOrigin` | 経度 141.622712、緯度 42.783592 | 入口12か所（同 CSV）の外接矩形の中心を小数6桁に丸めた点。オーナーが採用を判断 |
| `entranceMaxGapMetres` | 5 | オーナーの判断。入口写真の GPS 精度は 3.4〜14.2 m |
| `pathDistanceToleranceMetres` | 2 | オーナーの判断 |
| `startNodeIds` | null | 経路データ未作成のため保留 |

| 項目 | 型・単位 | 内容 | 決める人・出典 |
|---|---|---|---|
| `status` | `draft` / `approved` | `approved` のときだけ値を検証器へ渡す。`draft` の値は記入済みでも使わない | オーナー |
| `approvedBy` | 文字列 | 承認した人（GitHub のユーザー名など） | オーナー |
| `approvedAt` | `YYYY-MM-DD` | 承認した日 | オーナー |
| `campusBoundary` | GeoJSON Polygon（CRS84、[経度, 緯度]、外環は反時計回り） | キャンパスの許容範囲。地図のすべての Feature がこの中に入らなければ公開を止める（`outside_campus`） | キャンパスの敷地。多少の余裕を含めるかを決める |
| `enuOrigin` | `{ "longitude": 数, "latitude": 数 }`（度） | 距離をメートルで比べるときの基準点（局所平面の原点）。キャンパスの中央付近の1点 | E1-5 の座標の扱いに合わせる |
| `entranceMaxGapMetres` | 数（m、0以上） | 正式入口（`formal_entrance`）の位置と、つながる内外のノードとの距離の上限。超えると `entrance_connection_gap` | 実測・作図の精度から決める |
| `pathDistanceToleranceMetres` | 数（m、0以上） | 経路（`walking_path`）の形から求めた長さと `distance_m` の差の上限。超えると `path_distance_mismatch` | 原データの距離の求め方から決める |
| `startNodeIds` | ノードの canonical ID の配列（1件以上） | 到達性を調べる出発ノード。ここから全ノードに行けなければ `unreachable_node`。先頭のノードや全入口を自動で出発点にしない | 来場者が入る場所（正門など）に対応するノード |

形式の誤り（未知の項目、数を文字列で書く、`approved` なのに承認者・日付が無い）は読み込み時に失敗する。値の妥当性（Polygon の形、範囲、0以上）は検証器が調べ、`invalid_validation_context` で公開を止める。`approved` にしても一部の値が null なら、その項目は `missing_validation_context` のまま。

API はこのファイルを設定キー `MapValidation:ApprovedSettingsFile`（環境変数 `MapValidation__ApprovedSettingsFile`）のパスから、地図の公開確認・公開のたびに読む。既定のパスは無く、未設定なら値が無いものとして `missing_validation_context` で止まる。読めない・形式が違うファイルは検証の失敗として扱い、合格にしない。

地図を公開・復旧する確認では、ファイルの SHA-256 を確認結果と結び付ける。確認した後にファイルが変われば（値が同じでも）、公開時に再確認を求める。

`campusBoundary` は、地図の GeoJSON 2.1.0 の構内の地面（`campus_ground`、nexus-mobile E1-4 改訂2）とは別のもの。地面は地図のデータに含め、オーナーが敷地の境界として作図する。地面があれば、すべての建物（`building`）がその中に入らなければ公開を止める（`building_outside_campus_ground`）。地面そのものも Feature なので、`campusBoundary` の中に入らなければ `outside_campus` で止まる。

## B. 地図の版ごとの根拠（取り込み時に渡す）

| 項目 | 内容 | 上限 |
|---|---|---|
| `expectedPathSeconds` | 各 `walking_path` の ID → 元データの所要時間（秒）。GeoJSON の `estimated_seconds` と一致しなければ `path_seconds_mismatch` | — |
| `floorTransforms` | 各フロアの ID → 座標変換の検証結果（`roundTripMaxMetres`・`fitRmsMetres`・`fitMaxMetres`・`checkMaxMetres`・`roundingMaxMetres`、m） | E1-5：0.05・2・3・3・0.10 |

いずれも地図を作った変換工程（nexus-mobile の map-dataset CLI など）の出力から得る値で、Studio は値を作らない。

```sh
cd apps/studio-api
dotnet run -- map import --file <GeoJSON> --evidence <根拠の JSON>   # --evidence は任意（無いと公開判定で不足として止まる）
```

根拠のファイルの形式（キーは canonical ID。大文字小文字を区別する）:

```json
{
  "expectedPathSeconds": { "<walking_path の ID>": 秒 },
  "floorTransforms": {
    "<フロアの ID>": { "roundTripMaxMetres": m, "fitRmsMetres": m, "fitMaxMetres": m, "checkMaxMetres": m, "roundingMaxMetres": m }
  }
}
```

2つの項目と、各フロアの5つの値はすべて必須。未知の項目・数を文字列で書いたもの・地図に無い経路やフロアの ID は取り込みで拒否する。値が地図と一致するか・上限内かは公開判定で調べる。

## C. 公開

取り込みは下書きの版を作るだけで、公開しない。取り込みが表示する `公開確認: /map-data/publish?revision=<版のID>` を Studio で開き、公開確認（R01 の形）で検証の結果と版の要約（版・SHA-256・サイズ・フロア数・地図要素の数）を確かめて公開する。公開の記録・取り下げ・過去の版への復旧は Releases で行う（対象の種類 `map`、対象 ID は `map`）。

公開判定は `MapDatasetValidator` の公開モードで、A の承認済み設定・B の根拠に加えて、公開後の Spot（地図の目的地 Feature と同じ ID でなければならない）、Spot の旧 ID（alias）、ID 予約表を渡す。検証器の結果は `map_` を付けたコードの公開阻止になる（例：`map_missing_validation_context`）。

- 公開すると、地図のフロアと Feature の ID を ID 予約表にそれぞれの種別で登録し、版の状態を `published` にする（それまで公開していた版は `archived`）。
- 公開中の Spot が使っている地図は取り下げられない（`map_in_use`）。公開中の Spot の目的地が無い版も公開できない（`map_undefined_navigation_id`）。
- 地図が公開されていないと Spot を公開できない（`spot_map_unpublished`）。Spot の ID は公開中の地図の目的地（`building`・`formal_entrance`・`room`・`landmark`）でなければならない（`undefined_spot_canonical_id`・`spot_not_destination_feature`）。
- 復旧は過去に公開した版をそのまま公開し直す。地図の版は変えないため、新しい版も退避も作らない。
