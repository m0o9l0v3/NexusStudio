# 地図の公開判定に使う承認済み設定

NexusStudio #11。Studio は地図（MapDataset）を公開する前に、nexus-mobile から移植した `MapDatasetValidator` で公開判定を行う。判定には地図の GeoJSON だけでは決まらない値が要り、検証器はそれを**呼び出し側が与える信頼できる値**として受け取る（nexus-mobile `docs/implementation/issue-18-map-dataset-validator.md`「公開判定に必要なcontext」）。値を推測・補完せず、無ければ `missing_validation_context` で公開を止める。

値は2種類に分ける（決定事項31）。

| 種類 | 置き場所 | 変わる時 |
|---|---|---|
| A. キャンパス全体の承認済み設定 | 本ディレクトリの `approved-settings.json`（Git でレビュー） | キャンパスや許容値の方針を見直した時だけ |
| B. 地図の版ごとの根拠 | 地図の取り込みコマンドで、GeoJSON と一緒に渡す（次の PR で実装） | 地図の版ごと |

## A. `approved-settings.json`

**現在は `status: draft` で、値はすべて未記入（null）。** このままでは地図を公開できない（Spot も、決定事項31 D2 により地図が無いと公開できない）。オーナーが値を記入し、`status` を `approved` にして `approvedBy`・`approvedAt` を書き、PR でレビューしてから使う。開発チームは値を作らない。

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

ファイルの SHA-256 を公開の確認と結び付け、確認後に設定が変わったら再確認を求める（地図の公開対象の PR で実装）。

## B. 地図の版ごとの根拠（取り込み時に渡す）

| 項目 | 内容 | 上限 |
|---|---|---|
| `expectedPathSeconds` | 各 `walking_path` の ID → 元データの所要時間（秒）。GeoJSON の `estimated_seconds` と一致しなければ `path_seconds_mismatch` | — |
| `floorTransforms` | 各フロアの ID → 座標変換の検証結果（`roundTripMaxMetres`・`fitRmsMetres`・`fitMaxMetres`・`checkMaxMetres`・`roundingMaxMetres`、m） | E1-5：0.05・2・3・3・0.10 |

いずれも地図を作った変換工程（nexus-mobile の map-dataset CLI など）の出力から得る値で、Studio は値を作らない。形式は取り込みコマンドの PR で定める。
