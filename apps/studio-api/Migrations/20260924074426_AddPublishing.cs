using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class AddPublishing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "current_revision_id",
                schema: "studio",
                table: "spots",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "current_revision_id",
                schema: "studio",
                table: "occurrences",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "current_revision_id",
                schema: "studio",
                table: "category_list_state",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "operation_logs",
                schema: "studio",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    operation_id = table.Column<Guid>(type: "uuid", nullable: true),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    finished_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    actor_id = table.Column<Guid>(type: "uuid", nullable: true),
                    action = table.Column<string>(type: "text", nullable: false),
                    target_kind = table.Column<string>(type: "text", nullable: true),
                    target_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    target_label = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    release_id = table.Column<Guid>(type: "uuid", nullable: true),
                    revision_id = table.Column<Guid>(type: "uuid", nullable: true),
                    detail = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_operation_logs", x => x.id);
                    table.CheckConstraint("ck_operation_logs_action", "action IN ('save', 'import', 'publish', 'signIn', 'signInFailed', 'signOut')");
                    table.CheckConstraint("ck_operation_logs_status", "status IN ('processing', 'succeeded', 'failed')");
                    table.ForeignKey(
                        name: "FK_operation_logs_admins_actor_id",
                        column: x => x.actor_id,
                        principalSchema: "studio",
                        principalTable: "admins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "validation_runs",
                schema: "studio",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: false),
                    entries = table.Column<string>(type: "jsonb", nullable: false),
                    fingerprint = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    findings = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_validation_runs", x => x.id);
                    table.CheckConstraint("ck_validation_runs_status", "status IN ('ok', 'failed')");
                    table.ForeignKey(
                        name: "FK_validation_runs_admins_created_by",
                        column: x => x.created_by,
                        principalSchema: "studio",
                        principalTable: "admins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "releases",
                schema: "studio",
                columns: table => new
                {
                    release_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence = table.Column<long>(type: "bigint", nullable: false),
                    operation_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    source = table.Column<string>(type: "text", nullable: false),
                    message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    validation_run_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_releases", x => x.release_id);
                    table.CheckConstraint("ck_releases_source", "source IN ('studio', 'import')");
                    table.ForeignKey(
                        name: "FK_releases_admins_created_by",
                        column: x => x.created_by,
                        principalSchema: "studio",
                        principalTable: "admins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_releases_validation_runs_validation_run_id",
                        column: x => x.validation_run_id,
                        principalSchema: "studio",
                        principalTable: "validation_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "publications",
                schema: "studio",
                columns: table => new
                {
                    target_kind = table.Column<string>(type: "text", nullable: false),
                    target_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    state = table.Column<string>(type: "text", nullable: false),
                    revision_id = table.Column<Guid>(type: "uuid", nullable: false),
                    release_id = table.Column<Guid>(type: "uuid", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_publications", x => new { x.target_kind, x.target_id });
                    table.CheckConstraint("ck_publications_state", "state IN ('published', 'withdrawn')");
                    table.CheckConstraint("ck_publications_target_kind", "target_kind IN ('event', 'occurrence', 'categories', 'spot')");
                    table.ForeignKey(
                        name: "FK_publications_releases_release_id",
                        column: x => x.release_id,
                        principalSchema: "studio",
                        principalTable: "releases",
                        principalColumn: "release_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "release_entries",
                schema: "studio",
                columns: table => new
                {
                    release_id = table.Column<Guid>(type: "uuid", nullable: false),
                    target_kind = table.Column<string>(type: "text", nullable: false),
                    target_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    action = table.Column<string>(type: "text", nullable: false),
                    revision_id = table.Column<Guid>(type: "uuid", nullable: false),
                    previous_revision_id = table.Column<Guid>(type: "uuid", nullable: true),
                    label = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_release_entries", x => new { x.release_id, x.target_kind, x.target_id });
                    table.CheckConstraint("ck_release_entries_action", "action IN ('publish', 'withdraw')");
                    table.CheckConstraint("ck_release_entries_target_kind", "target_kind IN ('event', 'occurrence', 'categories', 'spot')");
                    table.ForeignKey(
                        name: "FK_release_entries_releases_release_id",
                        column: x => x.release_id,
                        principalSchema: "studio",
                        principalTable: "releases",
                        principalColumn: "release_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.UpdateData(
                schema: "studio",
                table: "category_list_state",
                keyColumn: "id",
                keyValue: 1,
                column: "current_revision_id",
                value: null);

            migrationBuilder.CreateIndex(
                name: "IX_operation_logs_actor_id",
                schema: "studio",
                table: "operation_logs",
                column: "actor_id");

            migrationBuilder.CreateIndex(
                name: "ix_operation_logs_operation_id",
                schema: "studio",
                table: "operation_logs",
                column: "operation_id",
                unique: true,
                filter: "operation_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_operation_logs_started_at",
                schema: "studio",
                table: "operation_logs",
                column: "started_at");

            migrationBuilder.CreateIndex(
                name: "IX_publications_release_id",
                schema: "studio",
                table: "publications",
                column: "release_id");

            migrationBuilder.CreateIndex(
                name: "ix_release_entries_target",
                schema: "studio",
                table: "release_entries",
                columns: new[] { "target_kind", "target_id" });

            migrationBuilder.CreateIndex(
                name: "IX_releases_created_by",
                schema: "studio",
                table: "releases",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "ix_releases_operation_id",
                schema: "studio",
                table: "releases",
                column: "operation_id",
                unique: true,
                filter: "operation_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_releases_sequence",
                schema: "studio",
                table: "releases",
                column: "sequence",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_releases_validation_run_id",
                schema: "studio",
                table: "releases",
                column: "validation_run_id");

            migrationBuilder.CreateIndex(
                name: "IX_validation_runs_created_by",
                schema: "studio",
                table: "validation_runs",
                column: "created_by");

            if (ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL")
            {
                // 既存の参照データの「現在の下書きの版」を、各対象の最新の Revision で埋める。
                migrationBuilder.Sql("""
                    UPDATE studio.occurrences AS t SET current_revision_id = (
                        SELECT r.revision_id FROM studio.reference_revisions AS r
                        WHERE r.kind = 'occurrence' AND r.target_id = t.id::text
                        ORDER BY r.created_at DESC, r.revision_id DESC LIMIT 1);
                    UPDATE studio.spots AS t SET current_revision_id = (
                        SELECT r.revision_id FROM studio.reference_revisions AS r
                        WHERE r.kind = 'spot' AND r.target_id = t.canonical_id
                        ORDER BY r.created_at DESC, r.revision_id DESC LIMIT 1);
                    UPDATE studio.category_list_state AS t SET current_revision_id = (
                        SELECT r.revision_id FROM studio.reference_revisions AS r
                        WHERE r.kind = 'categories'
                        ORDER BY r.created_at DESC, r.revision_id DESC LIMIT 1);
                    """);

                // Step 3 までの spots.is_published（取り込みで設定した移行元の公開状態）を、取り込み元の Release へ移す。
                migrationBuilder.Sql("""
                    DO $$
                    DECLARE rid uuid := gen_random_uuid();
                    BEGIN
                      IF EXISTS (SELECT 1 FROM studio.spots WHERE is_published AND current_revision_id IS NOT NULL) THEN
                        INSERT INTO studio.releases (release_id, sequence, operation_id, created_at, created_by, source, message, validation_run_id)
                        VALUES (rid, 1, NULL, now(), NULL, 'import', '移行：取り込み済みSpotの公開状態（spots.is_published）', NULL);
                        INSERT INTO studio.release_entries (release_id, target_kind, target_id, action, revision_id, previous_revision_id, label)
                        SELECT rid, 'spot', canonical_id, 'publish', current_revision_id, NULL, left(name, 500)
                        FROM studio.spots WHERE is_published AND current_revision_id IS NOT NULL;
                        INSERT INTO studio.publications (target_kind, target_id, state, revision_id, release_id, updated_at)
                        SELECT 'spot', canonical_id, 'published', current_revision_id, rid, now()
                        FROM studio.spots WHERE is_published AND current_revision_id IS NOT NULL;
                      END IF;
                    END $$;
                    """);
            }

            migrationBuilder.DropColumn(
                name: "is_published",
                schema: "studio",
                table: "spots");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "operation_logs",
                schema: "studio");

            migrationBuilder.DropTable(
                name: "publications",
                schema: "studio");

            migrationBuilder.DropTable(
                name: "release_entries",
                schema: "studio");

            migrationBuilder.DropTable(
                name: "releases",
                schema: "studio");

            migrationBuilder.DropTable(
                name: "validation_runs",
                schema: "studio");

            migrationBuilder.DropColumn(
                name: "current_revision_id",
                schema: "studio",
                table: "spots");

            migrationBuilder.DropColumn(
                name: "current_revision_id",
                schema: "studio",
                table: "occurrences");

            migrationBuilder.DropColumn(
                name: "current_revision_id",
                schema: "studio",
                table: "category_list_state");

            migrationBuilder.AddColumn<bool>(
                name: "is_published",
                schema: "studio",
                table: "spots",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
    }
}
