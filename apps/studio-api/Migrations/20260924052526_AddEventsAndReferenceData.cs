using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class AddEventsAndReferenceData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "categories",
                schema: "studio",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    selectable = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_categories", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "event_heads",
                schema: "studio",
                columns: table => new
                {
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    current_revision_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: false),
                    row_version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_event_heads", x => x.event_id);
                    table.CheckConstraint("ck_event_heads_row_version", "row_version > 0");
                    table.ForeignKey(
                        name: "FK_event_heads_admins_created_by",
                        column: x => x.created_by,
                        principalSchema: "studio",
                        principalTable: "admins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_event_heads_admins_updated_by",
                        column: x => x.updated_by,
                        principalSchema: "studio",
                        principalTable: "admins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "occurrences",
                schema: "studio",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_occurrences", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "spots",
                schema: "studio",
                columns: table => new
                {
                    canonical_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    building_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    floor_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    is_published = table.Column<bool>(type: "boolean", nullable: false),
                    utilization = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_spots", x => x.canonical_id);
                    table.CheckConstraint("ck_spots_utilization", "utilization IN ('available', 'noNewSelection', 'withdrawn')");
                });

            migrationBuilder.CreateTable(
                name: "event_revisions",
                schema: "studio",
                columns: table => new
                {
                    revision_id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    payload = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: false),
                    base_revision_id = table.Column<Guid>(type: "uuid", nullable: true),
                    operation_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_event_revisions", x => x.revision_id);
                    table.ForeignKey(
                        name: "FK_event_revisions_admins_created_by",
                        column: x => x.created_by,
                        principalSchema: "studio",
                        principalTable: "admins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_event_revisions_event_heads_event_id",
                        column: x => x.event_id,
                        principalSchema: "studio",
                        principalTable: "event_heads",
                        principalColumn: "event_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "oc_days",
                schema: "studio",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    occurrence_id = table.Column<Guid>(type: "uuid", nullable: false),
                    date = table.Column<DateOnly>(type: "date", nullable: false),
                    public_start = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    public_end = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    cancel_note = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_oc_days", x => x.id);
                    table.CheckConstraint("ck_oc_days_public_hours", "(public_start IS NULL) = (public_end IS NULL) AND (public_start IS NULL OR public_start < public_end)");
                    table.CheckConstraint("ck_oc_days_status", "status IN ('normal', 'cancelled')");
                    table.ForeignKey(
                        name: "FK_oc_days_occurrences_occurrence_id",
                        column: x => x.occurrence_id,
                        principalSchema: "studio",
                        principalTable: "occurrences",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "spot_name_aliases",
                schema: "studio",
                columns: table => new
                {
                    canonical_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    alias = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_spot_name_aliases", x => new { x.canonical_id, x.alias });
                    table.ForeignKey(
                        name: "FK_spot_name_aliases_spots_canonical_id",
                        column: x => x.canonical_id,
                        principalSchema: "studio",
                        principalTable: "spots",
                        principalColumn: "canonical_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_event_heads_created_by",
                schema: "studio",
                table: "event_heads",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "IX_event_heads_updated_by",
                schema: "studio",
                table: "event_heads",
                column: "updated_by");

            migrationBuilder.CreateIndex(
                name: "IX_event_revisions_created_by",
                schema: "studio",
                table: "event_revisions",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "ix_event_revisions_event_id_created_at",
                schema: "studio",
                table: "event_revisions",
                columns: new[] { "event_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_event_revisions_operation_id",
                schema: "studio",
                table: "event_revisions",
                column: "operation_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_oc_days_occurrence_id_date",
                schema: "studio",
                table: "oc_days",
                columns: new[] { "occurrence_id", "date" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "categories",
                schema: "studio");

            migrationBuilder.DropTable(
                name: "event_revisions",
                schema: "studio");

            migrationBuilder.DropTable(
                name: "oc_days",
                schema: "studio");

            migrationBuilder.DropTable(
                name: "spot_name_aliases",
                schema: "studio");

            migrationBuilder.DropTable(
                name: "event_heads",
                schema: "studio");

            migrationBuilder.DropTable(
                name: "occurrences",
                schema: "studio");

            migrationBuilder.DropTable(
                name: "spots",
                schema: "studio");
        }
    }
}
