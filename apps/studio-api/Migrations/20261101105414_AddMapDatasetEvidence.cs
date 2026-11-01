using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class AddMapDatasetEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "validation_evidence",
                schema: "studio",
                table: "map_datasets",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "validation_evidence",
                schema: "studio",
                table: "map_datasets");
        }
    }
}
