using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class AddSpotKindAndDescription : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "description",
                schema: "studio",
                table: "spots",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "kind",
                schema: "studio",
                table: "spots",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_spots_kind",
                schema: "studio",
                table: "spots",
                sql: "kind IS NULL OR kind IN ('classroom', 'facility', 'service')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_spots_kind",
                schema: "studio",
                table: "spots");

            migrationBuilder.DropColumn(
                name: "description",
                schema: "studio",
                table: "spots");

            migrationBuilder.DropColumn(
                name: "kind",
                schema: "studio",
                table: "spots");
        }
    }
}
