# Studio本番イメージ

CIの`studio-api-image`と`studio-web-image`は同一repoのMRまたは既定ブランチからGitLab Registryへcommit SHAタグでpushし、`image-digests/*.txt`に不変digestを記録する。infra側はdigestを照合して採用する。APIイメージは`/health`をlocalhostで確認する。WebイメージはViteでビルドした静的ファイルをCaddyで8080番に配信し、SPAの直接URLを`index.html`へ戻す。`/api/*`は外側のCaddyがStudio APIへ中継し、Vite開発サーバーを使わない。

本番の接続文字列は`ConnectionStrings__StudioDatabaseFile=/run/secrets/studio_connection`から読む。接続先は`nexus-mobile`のPostgreSQLインスタンス内の`nexus_admin` DB、Studio専用の`studio` schemaを想定する。Studio専用ロールと権限、DBメジャー版、既存volumeは人間が照合する。APIは起動時にmigration・seed・管理者作成を行わない。EF移行SQLと適用前バックアップ、Macコピーから別volumeへの復元をレビューした後、人間が別のメンテナンス手順で適用する。
