using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StudioApi.Migrations
{
    /// <inheritdoc />
    public partial class HardenBundleMonotonicTrigger : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            if (ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL")
            {
                // 版を戻す更新の拒否を check_violation（23514）で返し、関数の search_path を固定する。
                // NexusInfra の隔離検証（sql/pg17-baseline/verification/delivery-reference-ddl.sql）と同じ定義。
                migrationBuilder.Sql("""
                    CREATE OR REPLACE FUNCTION delivery.reject_bundle_version_decrease() RETURNS trigger
                    LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                    BEGIN
                      IF NEW.bundle_version < OLD.bundle_version THEN
                        RAISE EXCEPTION 'delivery.current_bundle.bundle_version must not decrease (% -> %)',
                          OLD.bundle_version, NEW.bundle_version USING ERRCODE = 'check_violation';
                      END IF;
                      RETURN NEW;
                    END
                    $$;
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            if (ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL")
            {
                migrationBuilder.Sql("""
                    CREATE OR REPLACE FUNCTION delivery.reject_bundle_version_decrease() RETURNS trigger
                    LANGUAGE plpgsql AS $$
                    BEGIN
                      IF NEW.bundle_version < OLD.bundle_version THEN
                        RAISE EXCEPTION 'delivery.current_bundle.bundle_version must not decrease (% -> %)', OLD.bundle_version, NEW.bundle_version;
                      END IF;
                      RETURN NEW;
                    END
                    $$;
                    """);
            }
        }
    }
}
