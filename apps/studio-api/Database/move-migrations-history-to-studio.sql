-- マイグレーション履歴を public schema から studio schema へ移す（1回だけ実行する手順）。
--
-- 対象：この修正より前のStudio（Step 0〜2）で `dotnet ef database update` を実行したことがあるDB。
--       以前は履歴が public."__EFMigrationsHistory" に記録されていた。
--       一度も適用していないDB（新規）では不要。実行しても何も変わらない。
--
-- 実行：新しいStudioで `dotnet ef database update` を実行する「前に」、同じDBへ次のように流す。
--       psql "<接続文字列>" -v ON_ERROR_STOP=1 -f move-migrations-history-to-studio.sql
--       実行前にバックアップを取ること。
--
-- この手順を飛ばして新しいStudioで database update を実行すると、studio 側に履歴が無いため
-- InitialCreate から再適用しようとして「既に存在する」エラーで止まる（データは変更されない）。
--
-- 注意：public."__EFMigrationsHistory" は nexus-mobile も使う可能性があるため、表そのものは削除しない。
--       Studioの3件の行だけを移し、public 側からはその3件だけを消す。何度実行しても結果は同じ。

BEGIN;

CREATE SCHEMA IF NOT EXISTS studio;

CREATE TABLE IF NOT EXISTS studio."__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

DO $$
BEGIN
    IF to_regclass('public."__EFMigrationsHistory"') IS NOT NULL THEN
        INSERT INTO studio."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
        SELECT "MigrationId", "ProductVersion"
        FROM public."__EFMigrationsHistory"
        WHERE "MigrationId" IN (
            '20260922142853_InitialCreate',
            '20260923125620_AddStudioAdmins',
            '20260924052526_AddEventsAndReferenceData')
        ON CONFLICT ("MigrationId") DO NOTHING;

        DELETE FROM public."__EFMigrationsHistory"
        WHERE "MigrationId" IN (
            '20260922142853_InitialCreate',
            '20260923125620_AddStudioAdmins',
            '20260924052526_AddEventsAndReferenceData');
    END IF;
END $$;

COMMIT;
