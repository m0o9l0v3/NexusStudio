using Microsoft.EntityFrameworkCore;
using StudioApi.Models;

namespace StudioApi.Data;

public sealed class StudioDbContext(DbContextOptions<StudioDbContext> options) : DbContext(options)
{
    public DbSet<MapDataset> MapDatasets => Set<MapDataset>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("studio");

        modelBuilder.Entity<MapDataset>(entity =>
        {
            entity.ToTable("map_datasets", table =>
            {
                table.HasCheckConstraint("ck_map_datasets_version", "version > 0");
                table.HasCheckConstraint("ck_map_datasets_status", "status IN ('draft', 'published', 'archived')");
                table.HasCheckConstraint("ck_map_datasets_checksum", "length(checksum) = 64");
            });
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Version).HasColumnName("version").IsRequired();
            entity.HasIndex(e => e.Version).IsUnique();
            entity.Property(e => e.Status).HasColumnName("status").IsRequired();
            // text keeps exactly the bytes used for the checksum on both providers.
            entity.Property(e => e.Payload).HasColumnName("payload").HasColumnType("text").IsRequired();
            entity.Property(e => e.Checksum).HasColumnName("checksum").IsRequired();
            entity.Property(e => e.PublishedAt).HasColumnName("published_at");
        });
    }
}
