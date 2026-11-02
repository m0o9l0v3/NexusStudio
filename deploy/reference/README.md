# 実データの Spot の取り込み元

`spots.json` は、本番の Studio に実データの Spot を作るための `reference import` の入力です。

```bash
dotnet StudioApi.dll reference import --file deploy/reference/spots.json
```

本番での実行は Studio の本番有効化（m0o9l0v3/NexusInfra#8 の完了）の後です。

## 内容（2026-11-02、86件）

| 項目 | 出典・規則 |
|---|---|
| 対象 | 決定事項34 の割り当て表で `spot=yes` の行（建物14棟・部屋72件。廊下2件は含めない） |
| `kind` | 決定事項34 の割り当て表の値 |
| `name`（建物） | nexus-mobile E1-1 の表示名。表記揺れは C-012 で決定（2026-11-02、m0o9l0v3）。地図の `building.properties.name` と同じにする（E2-5 O-1c） |
| `name`（部屋） | E1-7 の資料上の名称。全角の英数字だけ半角に揃えた（例：`審査室１` → `審査室1`。E1-7 §5-4） |
| `aliases` | 教室棟2階の教室（`2A教室`〜`2G教室`）に `2A`〜`2G` を付けた。ほかは無し |
| `building`・`floor` | 建物の表示名と `n階` |
| `isPublished` | **すべて `false`**。取り込みで公開すると公開前検証（地図の目的地 Feature の照合など）を通らないため、公開は Studio の画面から行う |
| `utilization` | すべて `available` |
| `description` | 無し（説明文は m0o9l0v3/NexusMobile#49 で供給体制が決まるまで公開しない。E2-5 O-2d） |

## 変えるとき

- Spot の追加・名前の変更は、この JSON を直して PR にする。種別を変えるときは決定事項34 の表も直す（`RealSpotReference_ImportsAsDraftsAndMatchesTheKindAssignment` が両者を照合する）。
- 取り込みは canonical ID ごとの上書きで、繰り返し実行できる（公開中の Spot を取り下げはしない）。取り込んだあとに Studio の画面で直した内容は、再取り込みで上書きされる。
