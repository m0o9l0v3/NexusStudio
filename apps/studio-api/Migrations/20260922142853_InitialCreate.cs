using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "studio");

            migrationBuilder.CreateTable(
                name: "map_datasets",
                schema: "studio",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    version = table.Column<long>(type: "bigint", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    payload = table.Column<string>(type: "text", nullable: false),
                    checksum = table.Column<string>(type: "text", nullable: false),
                    published_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_map_datasets", x => x.id);
                    table.CheckConstraint("ck_map_datasets_checksum", "length(checksum) = 64");
                    table.CheckConstraint("ck_map_datasets_status", "status IN ('draft', 'published', 'archived')");
                    table.CheckConstraint("ck_map_datasets_version", "version > 0");
                });

            migrationBuilder.CreateIndex(
                name: "IX_map_datasets_version",
                schema: "studio",
                table: "map_datasets",
                column: "version",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "map_datasets",
                schema: "studio");
        }
    }
}
