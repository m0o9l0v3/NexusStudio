using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class AddMapPublishTarget : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_release_entries_target_kind",
                schema: "studio",
                table: "release_entries");

            migrationBuilder.DropCheckConstraint(
                name: "ck_publications_target_kind",
                schema: "studio",
                table: "publications");

            migrationBuilder.AddCheckConstraint(
                name: "ck_release_entries_target_kind",
                schema: "studio",
                table: "release_entries",
                sql: "target_kind IN ('event', 'occurrence', 'categories', 'spot', 'map')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_publications_target_kind",
                schema: "studio",
                table: "publications",
                sql: "target_kind IN ('event', 'occurrence', 'categories', 'spot', 'map')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_release_entries_target_kind",
                schema: "studio",
                table: "release_entries");

            migrationBuilder.DropCheckConstraint(
                name: "ck_publications_target_kind",
                schema: "studio",
                table: "publications");

            migrationBuilder.AddCheckConstraint(
                name: "ck_release_entries_target_kind",
                schema: "studio",
                table: "release_entries",
                sql: "target_kind IN ('event', 'occurrence', 'categories', 'spot')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_publications_target_kind",
                schema: "studio",
                table: "publications",
                sql: "target_kind IN ('event', 'occurrence', 'categories', 'spot')");
        }
    }
}
