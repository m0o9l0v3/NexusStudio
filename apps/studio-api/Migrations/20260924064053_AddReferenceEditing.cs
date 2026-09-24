using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class AddReferenceEditing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_oc_days_public_hours",
                schema: "studio",
                table: "oc_days");

            migrationBuilder.AddColumn<long>(
                name: "row_version",
                schema: "studio",
                table: "spots",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                schema: "studio",
                table: "spots",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "updated_by",
                schema: "studio",
                table: "spots",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "row_version",
                schema: "studio",
                table: "occurrences",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.AddColumn<string>(
                name: "source_note",
                schema: "studio",
                table: "occurrences",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                schema: "studio",
                table: "occurrences",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "updated_by",
                schema: "studio",
                table: "occurrences",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "category_list_state",
                schema: "studio",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    row_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_category_list_state", x => x.id);
                    table.CheckConstraint("ck_category_list_state_singleton", "id = 1");
                    table.ForeignKey(
                        name: "FK_category_list_state_admins_updated_by",
                        column: x => x.updated_by,
                        principalSchema: "studio",
                        principalTable: "admins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "reference_revisions",
                schema: "studio",
                columns: table => new
                {
                    revision_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "text", nullable: false),
                    target_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    payload = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    source = table.Column<string>(type: "text", nullable: false),
                    operation_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reference_revisions", x => x.revision_id);
                    table.CheckConstraint("ck_reference_revisions_kind", "kind IN ('occurrence', 'categories', 'spot')");
                    table.CheckConstraint("ck_reference_revisions_source", "source IN ('editor', 'import')");
                    table.ForeignKey(
                        name: "FK_reference_revisions_admins_created_by",
                        column: x => x.created_by,
                        principalSchema: "studio",
                        principalTable: "admins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                schema: "studio",
                table: "category_list_state",
                columns: new[] { "id", "row_version", "updated_at", "updated_by" },
                values: new object[] { 1, 1L, null, null });

            migrationBuilder.CreateIndex(
                name: "IX_spots_updated_by",
                schema: "studio",
                table: "spots",
                column: "updated_by");

            migrationBuilder.CreateIndex(
                name: "IX_occurrences_updated_by",
                schema: "studio",
                table: "occurrences",
                column: "updated_by");

            migrationBuilder.CreateIndex(
                name: "IX_category_list_state_updated_by",
                schema: "studio",
                table: "category_list_state",
                column: "updated_by");

            migrationBuilder.CreateIndex(
                name: "IX_reference_revisions_created_by",
                schema: "studio",
                table: "reference_revisions",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "ix_reference_revisions_operation_id",
                schema: "studio",
                table: "reference_revisions",
                column: "operation_id",
                unique: true,
                filter: "operation_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_reference_revisions_target",
                schema: "studio",
                table: "reference_revisions",
                columns: new[] { "kind", "target_id", "created_at" });

            migrationBuilder.AddForeignKey(
                name: "FK_occurrences_admins_updated_by",
                schema: "studio",
                table: "occurrences",
                column: "updated_by",
                principalSchema: "studio",
                principalTable: "admins",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_spots_admins_updated_by",
                schema: "studio",
                table: "spots",
                column: "updated_by",
                principalSchema: "studio",
                principalTable: "admins",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_occurrences_admins_updated_by",
                schema: "studio",
                table: "occurrences");

            migrationBuilder.DropForeignKey(
                name: "FK_spots_admins_updated_by",
                schema: "studio",
                table: "spots");

            migrationBuilder.DropTable(
                name: "category_list_state",
                schema: "studio");

            migrationBuilder.DropTable(
                name: "reference_revisions",
                schema: "studio");

            migrationBuilder.DropIndex(
                name: "IX_spots_updated_by",
                schema: "studio",
                table: "spots");

            migrationBuilder.DropIndex(
                name: "IX_occurrences_updated_by",
                schema: "studio",
                table: "occurrences");

            migrationBuilder.DropColumn(
                name: "row_version",
                schema: "studio",
                table: "spots");

            migrationBuilder.DropColumn(
                name: "updated_at",
                schema: "studio",
                table: "spots");

            migrationBuilder.DropColumn(
                name: "updated_by",
                schema: "studio",
                table: "spots");

            migrationBuilder.DropColumn(
                name: "row_version",
                schema: "studio",
                table: "occurrences");

            migrationBuilder.DropColumn(
                name: "source_note",
                schema: "studio",
                table: "occurrences");

            migrationBuilder.DropColumn(
                name: "updated_at",
                schema: "studio",
                table: "occurrences");

            migrationBuilder.DropColumn(
                name: "updated_by",
                schema: "studio",
                table: "occurrences");

            migrationBuilder.AddCheckConstraint(
                name: "ck_oc_days_public_hours",
                schema: "studio",
                table: "oc_days",
                sql: "(public_start IS NULL) = (public_end IS NULL) AND (public_start IS NULL OR public_start < public_end)");
        }
    }
}
