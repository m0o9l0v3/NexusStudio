# Studio DBロールとschemaの適用契約（現行PostgreSQL 17）

NexusInfra #8。Studioを第1段階の現行PG17で動かすための手順。PG18用の[`../setup-studio-roles.sh`](../README.md)はPG18以外を拒否するガードを含めて変えず、PG17には本ディレクトリの別スクリプトを使う。判断の記録は[30](../../../docs/決定事項/30_NexusStudio_PG17対応DB・認証の判断記録_2026-11-01_v01.md)。

**本番への適用は、本書のSQL全文・対象・影響・ロック・rollback境界のレビューと別承認の後に限る。** 隔離環境での成功を本番適用済みとは扱わない。

## 1. 対象の固定

| 項目 | 値 |
|---|---|
| クラスタ | 現行PG17（17.x）。承認時に読み取り専用で取得した`system_identifier`を`NEXUS_STUDIO_EXPECTED_SYSTEM_ID`に渡す |
| DB | `nexus`（public-apiと同じDB。`delivery`をReleaseと同じトランザクションで書くため。NexusInfra `docs/pg17-baseline.md` §3.1） |
| 実行者 | クラスタのsuperuser `nexus`（現行の唯一のrole） |
| 作るrole | `nexus_studio_migrator`（LOGIN、DDL用、`studio`と`delivery`の所有者）、`nexus_studio_app`（LOGIN、実行時。APIは本番でこの名前を強制） |
| 作るschema | `studio`（所有者migrator、`PUBLIC`から剥奪、appにUSAGE） |
| 前提 | NexusInfraのPG17 baseline（`sql/pg17-baseline/01-roles.sql`）適用済み：`nexus_owner`・`nexus_public`があり、DBの所有者が`nexus_owner`、DBの`PUBLIC`権限が無い。`password_encryption = scram-sha-256` |

`setup-studio-roles.sh`はDDLの前に読み取り専用の1問い合わせでDB名・実行者・superuser・17.x・識別子を確かめ、SQL側でも同じ接続の中で再確認する。前提の不足、既存のStudio role・`studio`/`delivery` schemaのいずれかがあれば、何も作らずに失敗する。`production`では`ALLOW_PRODUCTION_STUDIO_PG17_ROLE_SETUP=1`も要る（PG18用の`ALLOW_PRODUCTION_STUDIO_ROLE_SETUP`では通らない）。これは承認を代替しない。パスワードは私有ファイルから環境変数で`psql`プロセスにだけ渡し、引数・ログ・Gitに残さない。接続パスワードは私有の`PGPASSFILE`等で渡す。

## 2. 適用順（Studio導入時の1回）

| # | 実行者 | 内容 | 担当repo |
|---|---|---|---|
| 1 | superuser | `sql/pg17-baseline/01-roles.sql`、public-apiの移行、`grant-runtime.sql`（既に適用済みなら飛ばす） | NexusInfra §6 |
| 2 | superuser | `deploy/database/pg17/setup-studio-roles.sh`（本書） | NexusStudio |
| 3 | superuser | `sql/pg17-baseline/02-delivery-schema.sql -v studio_migrator=nexus_studio_migrator -v studio_app=nexus_studio_app` | NexusInfra |
| 4 | `nexus_studio_migrator` | CIの`studio-migration-script`で作り、SHA-256を記録したレビュー済みSQL（`studio`と`delivery`の表） | NexusStudio |
| 5 | superuser | `deploy/database/grant-studio-runtime.sql`（`studio`の表だけ） | NexusStudio |
| 6 | superuser | `sql/pg17-baseline/03-grant-delivery.sql`（同じ`-v`） | NexusInfra |
| 7 | 運用者 | `dotnet StudioApi.dll admin add --email … --name …`（初期管理者。パスワードは対話入力） | NexusStudio |

以後のStudio移行では4→5→（`delivery`を変える移行なら）6を繰り返す。4の後に5を忘れると、新しい表はruntimeから読めない（安全側に失敗する）。

## 3. 既存データへの影響とロック

- 2は新しいrole2つ、DB `nexus`へのCONNECT付与、空の`studio` schemaの作成だけ。`public`の表・`nexus_public`の権限・既存のroleは変えない（SQLの最後で`nexus_public`が`studio`を使えないことを確かめる）。
- ロック：`pg_authid`・`pg_database`・`pg_namespace`の行の更新だけで、既存の表のロックは取らない。public-apiの読み書きは止まらない。
- 4〜6は`studio`と`delivery`の中の新しい表・トリガー・権限だけ。既存の`public`の表には触れない。
- 7は`studio`のIdentity表への1行の追加。

## 4. rollback境界

- 2〜6のどこかで失敗した場合：各スクリプトは1トランザクションで、失敗したものは何も残さない。そこで止め、原因を直してから再レビューする。
- Studioが`delivery`へ最初のbundleを書く前なら、作ったものを取り除ける（下のSQL。レビューと承認の後にsuperuserで1回だけ。public-apiは`delivery`が無いと`/api/v2/bundle`で配信できないだけで、`public`の表は影響を受けない）。

  ```sql
  BEGIN;
  DROP SCHEMA IF EXISTS delivery CASCADE;
  DROP SCHEMA studio CASCADE;
  REVOKE ALL ON DATABASE nexus FROM nexus_studio_migrator, nexus_studio_app;
  DROP ROLE nexus_studio_app;
  DROP ROLE nexus_studio_migrator;
  COMMIT;
  ```

- 最初のbundleを公開した後は、参加者向け配信が依存するため上のSQLは使わない。戻す場合は適用前のバックアップからの別volume復元を判断する（NexusInfra §6の5と同じ）。そのため、2の直前にPG17のバックアップとVPS外コピー・別volume復元が成功していることを条件にする。

## 5. 検証

- CI `studio-db-role-pg17-check`：採用PG17（17.11、NexusInfra #7のdigest）を本番と同じ形（DB `nexus`、superuser `nexus`）で作り、baseline前の拒否、誤った識別子・承認フラグなしの`production`の拒否、2回目の拒否、全移行の適用と再適用、所有者、`grant-studio-runtime.sql`、runtimeの許可・拒否、`nexus_public`から`studio`が読めないことを確かめる。
- CI `studio-role-target-preflight`：`tests/test_setup_studio_roles_pg17.py`で、18.x・16.x・別DB・別ユーザー・非superuser・別識別子・承認フラグ違いをDDLの前に拒否することを確かめる。
- 実際のNexusInfra baseline（01〜03）との結合はNexusInfraの`scripts/pg17-baseline.py`で行う（`delivery`の表はNexusStudio #11の移行で作る）。
