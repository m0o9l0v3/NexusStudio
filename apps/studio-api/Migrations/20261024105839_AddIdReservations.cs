using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class AddIdReservations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "id_reservations",
                schema: "studio",
                columns: table => new
                {
                    sequence = table.Column<long>(type: "bigint", nullable: false),
                    id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    entity_kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    state = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    canonical_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    source = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    release_id = table.Column<Guid>(type: "uuid", nullable: true),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_id_reservations", x => x.sequence);
                    table.CheckConstraint("ck_id_reservations_alias_target", "(state = 'alias') = (canonical_id IS NOT NULL)");
                    table.CheckConstraint("ck_id_reservations_entity_kind", "entity_kind IN ('spot', 'building', 'floor', 'indoor_node', 'outdoor_node', 'walking_path', 'formal_entrance', 'room', 'landmark')");
                    table.CheckConstraint("ck_id_reservations_id", "length(id) > 0");
                    table.CheckConstraint("ck_id_reservations_source", "source IN ('release', 'rename', 'import')");
                    table.CheckConstraint("ck_id_reservations_state", "state IN ('active', 'retired', 'alias')");
                    table.ForeignKey(
                        name: "FK_id_reservations_releases_release_id",
                        column: x => x.release_id,
                        principalSchema: "studio",
                        principalTable: "releases",
                        principalColumn: "release_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_id_reservations_id",
                schema: "studio",
                table: "id_reservations",
                column: "id");

            migrationBuilder.CreateIndex(
                name: "IX_id_reservations_release_id",
                schema: "studio",
                table: "id_reservations",
                column: "release_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "id_reservations",
                schema: "studio");
        }
    }
}
