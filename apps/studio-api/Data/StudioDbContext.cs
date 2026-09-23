using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using StudioApi.Models;

namespace StudioApi.Data;

// ロールは持たない（登録済み管理者は全員が全権限。00 D-03）ため IdentityUserContext を使う。
public sealed class StudioDbContext(DbContextOptions<StudioDbContext> options)
    : IdentityUserContext<StudioAdmin, Guid>(options)
{
    public DbSet<MapDataset> MapDatasets => Set<MapDataset>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
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

        modelBuilder.Entity<StudioAdmin>(entity =>
        {
            entity.ToTable("admins");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.UserName).HasColumnName("user_name");
            entity.Property(e => e.NormalizedUserName).HasColumnName("normalized_user_name");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.NormalizedEmail).HasColumnName("normalized_email");
            entity.Property(e => e.EmailConfirmed).HasColumnName("email_confirmed");
            entity.Property(e => e.PasswordHash).HasColumnName("password_hash");
            entity.Property(e => e.SecurityStamp).HasColumnName("security_stamp");
            entity.Property(e => e.ConcurrencyStamp).HasColumnName("concurrency_stamp");
            entity.Property(e => e.PhoneNumber).HasColumnName("phone_number");
            entity.Property(e => e.PhoneNumberConfirmed).HasColumnName("phone_number_confirmed");
            entity.Property(e => e.TwoFactorEnabled).HasColumnName("two_factor_enabled");
            entity.Property(e => e.LockoutEnd).HasColumnName("lockout_end");
            entity.Property(e => e.LockoutEnabled).HasColumnName("lockout_enabled");
            entity.Property(e => e.AccessFailedCount).HasColumnName("access_failed_count");
            entity.Property(e => e.DisplayName).HasColumnName("display_name").HasMaxLength(100).IsRequired();
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").IsRequired();
            entity.Property(e => e.DisabledAt).HasColumnName("disabled_at");
            entity.HasIndex(e => e.NormalizedUserName).IsUnique().HasDatabaseName("ix_admins_normalized_user_name");
            entity.HasIndex(e => e.NormalizedEmail).IsUnique().HasDatabaseName("ix_admins_normalized_email");
        });

        modelBuilder.Entity<IdentityUserClaim<Guid>>(entity =>
        {
            entity.ToTable("admin_claims");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.UserId).HasColumnName("admin_id");
            entity.Property(e => e.ClaimType).HasColumnName("claim_type");
            entity.Property(e => e.ClaimValue).HasColumnName("claim_value");
        });

        modelBuilder.Entity<IdentityUserLogin<Guid>>(entity =>
        {
            entity.ToTable("admin_logins");
            entity.Property(e => e.LoginProvider).HasColumnName("login_provider");
            entity.Property(e => e.ProviderKey).HasColumnName("provider_key");
            entity.Property(e => e.ProviderDisplayName).HasColumnName("provider_display_name");
            entity.Property(e => e.UserId).HasColumnName("admin_id");
        });

        modelBuilder.Entity<IdentityUserToken<Guid>>(entity =>
        {
            entity.ToTable("admin_tokens");
            entity.Property(e => e.UserId).HasColumnName("admin_id");
            entity.Property(e => e.LoginProvider).HasColumnName("login_provider");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.Value).HasColumnName("value");
        });
    }
}
