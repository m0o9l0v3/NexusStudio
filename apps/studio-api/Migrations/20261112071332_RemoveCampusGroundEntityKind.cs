using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class RemoveCampusGroundEntityKind : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_id_reservations_entity_kind",
                schema: "studio",
                table: "id_reservations");

            migrationBuilder.AddCheckConstraint(
                name: "ck_id_reservations_entity_kind",
                schema: "studio",
                table: "id_reservations",
                sql: "entity_kind IN ('spot', 'building', 'floor', 'indoor_node', 'outdoor_node', 'walking_path', 'formal_entrance', 'room', 'landmark')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_id_reservations_entity_kind",
                schema: "studio",
                table: "id_reservations");

            migrationBuilder.AddCheckConstraint(
                name: "ck_id_reservations_entity_kind",
                schema: "studio",
                table: "id_reservations",
                sql: "entity_kind IN ('spot', 'building', 'floor', 'indoor_node', 'outdoor_node', 'walking_path', 'formal_entrance', 'room', 'landmark', 'campus_ground')");
        }
    }
}
