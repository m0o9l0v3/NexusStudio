using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class AddRenameRevisionSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_reference_revisions_source",
                schema: "studio",
                table: "reference_revisions");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reference_revisions_source",
                schema: "studio",
                table: "reference_revisions",
                sql: "source IN ('editor', 'import', 'restore', 'rename')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_reference_revisions_source",
                schema: "studio",
                table: "reference_revisions");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reference_revisions_source",
                schema: "studio",
                table: "reference_revisions",
                sql: "source IN ('editor', 'import', 'restore')");
        }
    }
}
