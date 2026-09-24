# Studio DBロールとschemaの適用契約

`nexus-mobile`のPostgreSQL 18派生イメージは`nexus_admin` DBとMobile用roleを作る。Studio用roleは作らない。本repoの`setup-studio-roles.sql`は、**新規の隔離DBで検証し、人間がSQLとsecret注入方法を承認した後に一度だけ**適用する。既存roleまたは`studio` schemaがあれば失敗させ、現行VPSへ自動適用しない。

## 順序

1. 18系の新規空DBと、Mobile側の初期roleを構築。17からの復元がある場合は、その内容・所有者・role衝突を先に調べる。未知の既存schemaには適用しない。
2. PostgreSQL管理者が、秘密ファイルから一時的に読み込んだ`NEXUS_STUDIO_MIGRATOR_PASSWORD`と`NEXUS_STUDIO_APP_PASSWORD`を`psql`プロセスへ渡し、`deploy/database/setup-studio-roles.sh`を実行。秘密値をコマンドライン引数、ログ、Gitへ記録しない。
3. `nexus_studio_migrator`を使い、対象commitから生成したStudioの**レビュー済みSQL**を適用。`studio.__EFMigrationsHistory`と全テーブルの所有者がmigratorであることを確認する。通常のAPI起動やCI deployから実行しない。
4. 管理者が`psql -X -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -f deploy/database/grant-studio-runtime.sql`を適用。**各migration後に再実行**し、アプリテーブルとシーケンスだけにruntime権限を付ける。`studio.__EFMigrationsHistory`は除外する。
5. runtime用の`nexus_studio_app`で必要な読み書きができ、`public` schemaへのアクセス、DDL、role作成、DB作成は拒否されることを隔離DBで確認する。本番接続ファイルはこのroleを使う。APIはProductionモードで異なるユーザー名やパスワード欠落を拒否する。

DBの権限は暗号化バックアップ、Macコピーからの別volume復元、17→18の論理移行と一体で検証する。実VPSでのmigration・role作成はこのMRでは行わない。

Studioの移行SQLはCIの`studio-migration-script`でDB接続なしに生成し、SHA-256とともに成果物へ保存する。`STUDIO_MIGRATION_CONNECTION`は設計時factoryの必須値で、CIでは実DBへ接続しないダミー値を使う。本番適用時は別途、人間がレビューしたSQLを専用migratorで実行する。SQL成果物の期限は30日なので、採用時にはcommit/digest/ハッシュと一緒に保護されたリリース記録へ保存する。
