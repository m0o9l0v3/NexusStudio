using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class AddRestoreAndLogOrdering : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_release_entries_action",
                schema: "studio",
                table: "release_entries");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reference_revisions_source",
                schema: "studio",
                table: "reference_revisions");

            migrationBuilder.DropIndex(
                name: "ix_operation_logs_started_at",
                schema: "studio",
                table: "operation_logs");

            migrationBuilder.AddColumn<Guid>(
                name: "restored_from_revision_id",
                schema: "studio",
                table: "release_entries",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "stashed_revision_id",
                schema: "studio",
                table: "release_entries",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "started_at_ms",
                schema: "studio",
                table: "operation_logs",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            if (ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL")
            {
                // 既存の操作ログの並べ替え用の時刻を埋める。
                migrationBuilder.Sql("UPDATE studio.operation_logs SET started_at_ms = (extract(epoch FROM started_at) * 1000)::bigint;");
            }

            migrationBuilder.AddCheckConstraint(
                name: "ck_release_entries_action",
                schema: "studio",
                table: "release_entries",
                sql: "action IN ('publish', 'withdraw', 'restore')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reference_revisions_source",
                schema: "studio",
                table: "reference_revisions",
                sql: "source IN ('editor', 'import', 'restore')");

            migrationBuilder.CreateIndex(
                name: "ix_operation_logs_started_at_ms",
                schema: "studio",
                table: "operation_logs",
                column: "started_at_ms");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_release_entries_action",
                schema: "studio",
                table: "release_entries");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reference_revisions_source",
                schema: "studio",
                table: "reference_revisions");

            migrationBuilder.DropIndex(
                name: "ix_operation_logs_started_at_ms",
                schema: "studio",
                table: "operation_logs");

            migrationBuilder.DropColumn(
                name: "restored_from_revision_id",
                schema: "studio",
                table: "release_entries");

            migrationBuilder.DropColumn(
                name: "stashed_revision_id",
                schema: "studio",
                table: "release_entries");

            migrationBuilder.DropColumn(
                name: "started_at_ms",
                schema: "studio",
                table: "operation_logs");

            migrationBuilder.AddCheckConstraint(
                name: "ck_release_entries_action",
                schema: "studio",
                table: "release_entries",
                sql: "action IN ('publish', 'withdraw')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reference_revisions_source",
                schema: "studio",
                table: "reference_revisions",
                sql: "source IN ('editor', 'import')");

            migrationBuilder.CreateIndex(
                name: "ix_operation_logs_started_at",
                schema: "studio",
                table: "operation_logs",
                column: "started_at");
        }
    }
}
