using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class AddDraftDiagnosis : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "kind",
                schema: "studio",
                table: "validation_runs",
                type: "text",
                nullable: false,
                defaultValue: "candidate");

            migrationBuilder.CreateIndex(
                name: "ix_validation_runs_kind_id",
                schema: "studio",
                table: "validation_runs",
                columns: new[] { "kind", "id" });

            migrationBuilder.AddCheckConstraint(
                name: "ck_validation_runs_kind",
                schema: "studio",
                table: "validation_runs",
                sql: "kind IN ('candidate', 'draft')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_validation_runs_kind_id",
                schema: "studio",
                table: "validation_runs");

            migrationBuilder.DropCheckConstraint(
                name: "ck_validation_runs_kind",
                schema: "studio",
                table: "validation_runs");

            migrationBuilder.DropColumn(
                name: "kind",
                schema: "studio",
                table: "validation_runs");
        }
    }
}
