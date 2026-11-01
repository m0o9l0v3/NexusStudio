using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class AddParticipantBundles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "delivery");

            migrationBuilder.CreateTable(
                name: "participant_bundles",
                schema: "delivery",
                columns: table => new
                {
                    bundle_version = table.Column<long>(type: "bigint", nullable: false),
                    release_id = table.Column<Guid>(type: "uuid", nullable: false),
                    schema_version = table.Column<string>(type: "text", nullable: false),
                    payload = table.Column<byte[]>(type: "bytea", nullable: false),
                    sha256 = table.Column<string>(type: "character(64)", nullable: false),
                    byte_length = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_participant_bundles", x => x.bundle_version);
                });

            migrationBuilder.CreateTable(
                name: "current_bundle",
                schema: "delivery",
                columns: table => new
                {
                    singleton = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    bundle_version = table.Column<long>(type: "bigint", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_current_bundle", x => x.singleton);
                    table.CheckConstraint("ck_current_bundle_singleton", "singleton");
                    table.ForeignKey(
                        name: "FK_current_bundle_participant_bundles_bundle_version",
                        column: x => x.bundle_version,
                        principalSchema: "delivery",
                        principalTable: "participant_bundles",
                        principalColumn: "bundle_version",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_current_bundle_bundle_version",
                schema: "delivery",
                table: "current_bundle",
                column: "bundle_version");

            migrationBuilder.CreateIndex(
                name: "IX_participant_bundles_release_id",
                schema: "delivery",
                table: "participant_bundles",
                column: "release_id",
                unique: true);

            if (ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL")
            {
                // 配信する版を減らす更新を拒否する（E2-5 §3.2）。NexusInfra の 03-grant-delivery.sql は、
                // この名前のトリガーと関数（移行用 role の所有）があることを確かめてから権限を付ける。
                migrationBuilder.Sql("""
                    CREATE FUNCTION delivery.reject_bundle_version_decrease() RETURNS trigger
                    LANGUAGE plpgsql AS $$
                    BEGIN
                      IF NEW.bundle_version < OLD.bundle_version THEN
                        RAISE EXCEPTION 'delivery.current_bundle.bundle_version must not decrease (% -> %)', OLD.bundle_version, NEW.bundle_version;
                      END IF;
                      RETURN NEW;
                    END
                    $$;
                    CREATE TRIGGER current_bundle_monotonic BEFORE UPDATE ON delivery.current_bundle
                    FOR EACH ROW EXECUTE FUNCTION delivery.reject_bundle_version_decrease();
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            if (ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL")
            {
                migrationBuilder.Sql("DROP TRIGGER current_bundle_monotonic ON delivery.current_bundle; DROP FUNCTION delivery.reject_bundle_version_decrease();");
            }

            migrationBuilder.DropTable(
                name: "current_bundle",
                schema: "delivery");

            migrationBuilder.DropTable(
                name: "participant_bundles",
                schema: "delivery");
        }
    }
}
