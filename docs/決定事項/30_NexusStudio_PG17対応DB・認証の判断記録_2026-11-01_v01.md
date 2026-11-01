# Nexus Studio PG17対応DB・認証の判断記録

- 作成日：2026-11-01
- 版：v01
- 状態：**利用者が決定**（2026-11-01、質問への回答）。本番への適用・有効化は含まない（別承認）。
- 関連：m0o9l0v3/NexusInfra#8（本記録の対象）・#17（`delivery`の権限）、m0o9l0v3/NexusStudio#11、NexusInfra `docs/pg17-baseline.md`（契約B §3・§3.1・§6）、[15 v02](15_NexusStudio_実装開始判断・初期実装計画_2026-09-22_v02.md)、[29 v01](29_NexusStudio_M1地点表示の判断記録_2026-10-24_v01.md)

## 1. 背景

StudioのDB手順（`deploy/database/setup-studio-roles.sh`）はPG18への移行後を前提に、PG18以外を拒否する。一方、参加者向け配信（NexusMobile E2-5 案b）は第1段階で現行PG17の`nexus` DBに`delivery`を置き、StudioがReleaseと同じトランザクションで書く。このためStudioを現行PG17で動かす手順が要る。NexusInfra#8は、PG18のガードを削除・回避するだけの変更を禁じ、PG17用の手順・対象固定・隔離検証を求めている。

## 2. 決定事項

### DB

| # | 論点 | 決定 | 補足 |
|---|---|---|---|
| D1 | PG17での手順の置き方 | **PG17専用の別スクリプト**（`deploy/database/pg17/`）。PG18用はガードを含めて変えない | 対象はDB `nexus`・superuser `nexus`・17.x・承認済み識別子・NexusInfra baseline適用済み。本番は専用の承認フラグ`ALLOW_PRODUCTION_STUDIO_PG17_ROLE_SETUP` |
| D2 | role名 | **`nexus_studio_migrator`／`nexus_studio_app`で確定** | APIの本番検査（`nexus_studio_app`の強制）とNexusInfra#17の隔離検証の仮名に一致。NexusInfraの`02`/`03`には`-v`で同じ名前を渡す |
| D3 | 配置 | **現行PG17の`nexus` DB**に`studio`を置く（`delivery`と同じDB） | 契約B §3.1（NexusInfra#17）どおり。PG18移行後は`nexus_admin`（PG18用の手順） |
| D4 | migratorの権限 | DBのCREATEを与えない。作れるのは自分が所有する`studio`と`delivery`の中だけ | `delivery`はNexusInfraの`02`がsuperuserで作って所有を渡す（29 M1-D3の確定） |
| D5 | 適用順 | baseline（01・public-api移行・grant-runtime）→ Studio role/schema → `02` → Studio移行 → `grant-studio-runtime.sql` → `03` → 初期管理者 | `deploy/database/pg17/README.md` §2 |
| D6 | rollback境界 | 最初のbundleを公開する前は、レビュー済みSQLで`delivery`・`studio`・2つのroleを取り除ける。公開後は適用前バックアップからの別volume復元で判断する | 同README §4 |

### 認証（S）

現行実装（Step 1、15 v02 §3）を本番の方式として**承認**した。

| # | 項目 | 決定 |
|---|---|---|
| S1 | 方式・セッション | ASP.NET Core Identityの個別管理者アカウント。HttpOnly・SameSite=Strict・Secure（本番は常時）のCookie。期限8時間・スライド延長 |
| S2 | CSRF | Antiforgeryトークン（`/api/auth/csrf`）をJSON APIの状態変更要求で検証する。SameSite=Strictだけに依存しない |
| S3 | パスワード・ロック | 12文字以上（文字種の強制なし）。5回失敗で15分ロック |
| S4 | 無効化・再設定 | 既存セッションの次の要求で即時に反映（セキュリティスタンプの確認間隔0。2026-10-09の判断を維持） |
| S5 | 初期管理者 | 公開サインアップを作らない。運用者がホスト上で`admin add`を実行し、パスワードは対話入力で渡す（引数に渡さない） |
| S6 | 鍵の保存 | **DataProtectionの鍵を専用の私有volumeに永続化する**（`DataProtection__KeysDirectory`）。再起動でログイン・CSRFが切れない。本番のWebサーバーは未設定・相対パス・存在しない・グループ/他者に権限のあるディレクトリで起動を拒否する。鍵を失っても再ログインが要るだけ |

### 公開対象の機能（F）

| # | 論点 | 決定 |
|---|---|---|
| F1 | 本番で最初に有効化する機能 | **Step 0〜4の全機能**（編集・公開・取り下げ・復旧・Releases・Logs・Validation） |
| F2 | 参加者向け配信 | NexusStudio#11（射影）とNexusInfra#17（`delivery`の権限・実移行での再確認）が揃ってから |
| F3 | 有効化の時期 | NexusInfra#8の完了まで本番でStudioのサイト・サービスを有効化しない。有効化はこの記録とは別に承認する（API公開のIssueとも分ける） |

## 3. 未決・後続

- Studioをedge（Caddy）に載せる前の信頼範囲の再判断（NexusInfra `pg17-edge-decisions.md` DEC-1案A：edgeの実参加コンテナはCaddyとpublic-apiだけ）。Studioのホスト名・TLS・`ReverseProxy__TrustedNetwork`もそこで決める。
- `delivery`の表・トリガーを作るStudioの移行はNexusStudio#11で追加する。追加後、NexusInfraの`scripts/pg17-baseline.py`で実移行と実role名による隔離再確認を行う（契約B §4.1の注記の解消）。
- 本番PG17での適用（SQL全文・対象・影響・ロック・rollback境界のレビューと別承認）。
