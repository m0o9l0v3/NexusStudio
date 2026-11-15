# Studio本番イメージ

CIの`studio-api-image`と`studio-web-image`は同一repoのMRまたは既定ブランチからGitLab Registryへcommit SHAタグでpushし、`image-digests/*.txt`に不変digestを記録する。infra側はdigestを照合して採用する。APIイメージは`/health`をlocalhostで確認する。WebイメージはViteでビルドした静的ファイルをCaddyで8080番に配信し、SPAの直接URLを`index.html`へ戻す。`/api/*`は外側のCaddyがStudio APIへ中継し、Vite開発サーバーを使わない。

ProductionのStudio APIには`ReverseProxy__TrustedNetwork`で、CaddyとStudio APIが共有するedge networkのプライベートIPv4 /24～/28を必ず渡す。APIはその限定ネットワークからの`X-Forwarded-Proto`だけを受け入れ、HTTPS終端後のCookie/CSRF処理へ元のschemeを伝える。infra Composeの`NEXUS_EDGE_SUBNET`と同じ値にし、未設定・不正ならAPI起動を拒否する。Caddy経由の`/api/auth/csrf`で200応答とSecure Cookieを確認する。

ProductionのStudio APIには`DataProtection__KeysDirectory=/var/lib/nexus-studio/dataprotection-keys`を渡し、そこへ専用のnamed volumeを載せる（NexusInfra #8、2026-11-01利用者判断）。認証Cookie・CSRFトークンを保護する鍵がここに残り、再起動でログインが切れない。ディレクトリは絶対パス・既存・グループと他者に権限なし（0700）でなければAPIは起動を拒否する。イメージはこのディレクトリを実行UID所有の0700で作るため、新しいnamed volumeはそれを引き継ぐ。鍵は平文のXMLなので、volumeを他のコンテナと共有せず、バックアップに含める場合も暗号化する。鍵を失っても全員の再ログインが必要になるだけで、データは失われない。`admin`・`reference`コマンドはこの設定を要求しない。

地図を公開するには、Studio APIに`MapValidation__ApprovedSettingsFile`で、オーナーが承認した`deploy/map-validation/approved-settings.json`（`status: approved`）のコンテナ内のパスを渡し、読み取り専用で載せる（決定事項31 D3）。既定のパスは無く、未設定や`status: draft`では地図の公開判定が`missing_validation_context`で止まり、地図が無いためSpotも公開できない。ファイルを差し替えたら、確認済みの地図の公開は再確認になる。秘密値ではない。

本番の接続文字列は`ConnectionStrings__StudioDatabaseFile=/run/secrets/studio_connection`から読む。接続先は`nexus-mobile`のPostgreSQLインスタンス内で、第1段階（現行PG17）は`nexus` DB、PG18移行後は`nexus_admin` DB。どちらもStudio専用の`studio` schemaを使う。Studio専用ロールと権限、DBメジャー版、既存volumeは人間が照合する。APIは起動時にmigration・seed・管理者作成を行わない。EF移行SQLと適用前バックアップ、Macコピーから別volumeへの復元をレビューした後、人間が別のメンテナンス手順で適用する。


## 最初の参加者bundleの公開（Studioの常設前）

Studioを常設する前（NexusInfra #9の前）に最初のbundleを公開するときは、VPS上でloopbackだけに待ち受ける一時Studioを公開のあいだだけ起動する。手順・承認・確認・切り戻しの正本はNexusInfraの[`docs/first-bundle-publish.md`](https://github.com/m0o9l0v3/NexusInfra/blob/main/docs/first-bundle-publish.md)（[PR #27](https://github.com/m0o9l0v3/NexusInfra/pull/27)）。2026-11-15に使い捨てのPG17.11で、このrepoの`165d468`のイメージを使って通しで確認した（本番未適用）。

- イメージは採用commitの`git archive`からVPSでネイティブ（`linux/amd64`）にビルドし、`org.opencontainers.image.revision`で照合する。
- 管理者は`admin add`で登録し、公開は画面の「公開確認」→「公開」で行う。bundleの版は戻せないため、訂正は新しい版の公開で行う。
- イベントは会場（公開済みSpot）が必要で、Spotは公開済みの地図が必要なため、地図なしで公開できるのはカテゴリ一覧と開催回だけ。

## Studio専用のDB権限

[DB role契約](database/README.md)に従う。新規PostgreSQL 18の隔離環境で、migration用`nexus_studio_migrator`と通常API用`nexus_studio_app`を別に作り、`studio` schemaの所有者をmigratorとする。本番の`studio_connection`は`nexus_studio_app`を使う。通常起動でmigration/seedを行わず、現行PostgreSQL 17には18用のSQLを適用せず、[PG17用の手順](database/pg17/README.md)を使う。
