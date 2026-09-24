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
    public DbSet<Occurrence> Occurrences => Set<Occurrence>();
    public DbSet<OcDay> OcDays => Set<OcDay>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<CategoryListState> CategoryListStates => Set<CategoryListState>();
    public DbSet<ReferenceRevision> ReferenceRevisions => Set<ReferenceRevision>();
    public DbSet<Spot> Spots => Set<Spot>();
    public DbSet<SpotNameAlias> SpotNameAliases => Set<SpotNameAlias>();
    public DbSet<EventHead> EventHeads => Set<EventHead>();
    public DbSet<EventRevision> EventRevisions => Set<EventRevision>();
    public DbSet<Release> Releases => Set<Release>();
    public DbSet<ReleaseEntry> ReleaseEntries => Set<ReleaseEntry>();
    public DbSet<Publication> Publications => Set<Publication>();
    public DbSet<ValidationRun> ValidationRuns => Set<ValidationRun>();
    public DbSet<OperationLog> OperationLogs => Set<OperationLog>();

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

        ConfigureReferenceData(modelBuilder);
        ConfigureEvents(modelBuilder);
        ConfigurePublishing(modelBuilder);
    }

    private static void ConfigureReferenceData(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Occurrence>(entity =>
        {
            entity.ToTable("occurrences");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
            entity.Property(e => e.SourceNote).HasColumnName("source_note").HasMaxLength(1000);
            entity.HasMany(e => e.Days).WithOne().HasForeignKey(d => d.OccurrenceId).OnDelete(DeleteBehavior.Restrict);
            ConfigureEditable(entity);
        });

        modelBuilder.Entity<OcDay>(entity =>
        {
            // 一般公開時間の片方だけの入力・前後の逆転は下書きとして保存できる（公開前の確認で止める。08 OV-01）。
            entity.ToTable("oc_days", table => table.HasCheckConstraint("ck_oc_days_status", "status IN ('normal', 'cancelled')"));
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.OccurrenceId).HasColumnName("occurrence_id");
            entity.Property(e => e.Date).HasColumnName("date");
            entity.Property(e => e.PublicStart).HasColumnName("public_start");
            entity.Property(e => e.PublicEnd).HasColumnName("public_end");
            entity.Property(e => e.Status).HasColumnName("status").IsRequired();
            entity.Property(e => e.CancelNote).HasColumnName("cancel_note");
            // 同じ日付でも開催回が違えば別の開催日（既存 oc_days.date のグローバルUNIQUEは踏襲しない。15 v01 §4.3）。
            entity.HasIndex(e => new { e.OccurrenceId, e.Date }).IsUnique().HasDatabaseName("ix_oc_days_occurrence_id_date");
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.ToTable("categories");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
            entity.Property(e => e.SortOrder).HasColumnName("sort_order");
            entity.Property(e => e.Selectable).HasColumnName("selectable");
        });

        modelBuilder.Entity<CategoryListState>(entity =>
        {
            entity.ToTable("category_list_state", table => table.HasCheckConstraint("ck_category_list_state_singleton", "id = 1"));
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").ValueGeneratedNever();
            ConfigureEditable(entity);
            // 一覧全体の版を1行で持つ。マイグレーションで作成し、起動時には書き込まない。
            entity.HasData(new CategoryListState { Id = CategoryListState.SingletonId, RowVersion = 1 });
        });

        modelBuilder.Entity<Spot>(entity =>
        {
            entity.ToTable("spots", table =>
                table.HasCheckConstraint("ck_spots_utilization", "utilization IN ('available', 'noNewSelection', 'withdrawn')"));
            entity.HasKey(e => e.CanonicalId);
            // PostgreSQLの既定照合順序で比較するため、大文字小文字が違うIDは別のSpotになる。
            entity.Property(e => e.CanonicalId).HasColumnName("canonical_id").HasMaxLength(128);
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
            entity.Property(e => e.BuildingName).HasColumnName("building_name").HasMaxLength(100);
            entity.Property(e => e.FloorName).HasColumnName("floor_name").HasMaxLength(100);
            entity.Property(e => e.Utilization).HasColumnName("utilization").IsRequired();
            entity.HasMany(e => e.NameAliases).WithOne().HasForeignKey(a => a.CanonicalId).OnDelete(DeleteBehavior.Cascade);
            ConfigureEditable(entity);
        });

        modelBuilder.Entity<SpotNameAlias>(entity =>
        {
            entity.ToTable("spot_name_aliases");
            entity.HasKey(e => new { e.CanonicalId, e.Alias });
            entity.Property(e => e.CanonicalId).HasColumnName("canonical_id").HasMaxLength(128);
            entity.Property(e => e.Alias).HasColumnName("alias").HasMaxLength(200);
        });

        modelBuilder.Entity<ReferenceRevision>(entity =>
        {
            entity.ToTable("reference_revisions", table =>
            {
                table.HasCheckConstraint("ck_reference_revisions_kind", "kind IN ('occurrence', 'categories', 'spot')");
                table.HasCheckConstraint("ck_reference_revisions_source", "source IN ('editor', 'import', 'restore')");
            });
            entity.HasKey(e => e.RevisionId);
            entity.Property(e => e.RevisionId).HasColumnName("revision_id");
            entity.Property(e => e.Kind).HasColumnName("kind").IsRequired();
            entity.Property(e => e.TargetId).HasColumnName("target_id").HasMaxLength(128).IsRequired();
            entity.Property(e => e.Payload).HasColumnName("payload").HasColumnType("jsonb").IsRequired();
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.Source).HasColumnName("source").IsRequired();
            entity.Property(e => e.OperationId).HasColumnName("operation_id");
            entity.HasIndex(e => e.OperationId).IsUnique().HasFilter("operation_id IS NOT NULL").HasDatabaseName("ix_reference_revisions_operation_id");
            entity.HasIndex(e => new { e.Kind, e.TargetId, e.CreatedAt }).HasDatabaseName("ix_reference_revisions_target");
            entity.HasOne<StudioAdmin>().WithMany().HasForeignKey(e => e.CreatedBy).OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureEditable<T>(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<T> entity)
        where T : class, IEditableReference
    {
        entity.Property(e => e.RowVersion).HasColumnName("row_version").HasDefaultValue(1L).IsConcurrencyToken();
        entity.Property(e => e.CurrentRevisionId).HasColumnName("current_revision_id");
        entity.Property(e => e.UpdatedAt).HasColumnName("updated_at");
        entity.Property(e => e.UpdatedBy).HasColumnName("updated_by");
        entity.HasOne<StudioAdmin>().WithMany().HasForeignKey(e => e.UpdatedBy).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureEvents(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<EventHead>(entity =>
        {
            entity.ToTable("event_heads", table => table.HasCheckConstraint("ck_event_heads_row_version", "row_version > 0"));
            entity.HasKey(e => e.EventId);
            entity.Property(e => e.EventId).HasColumnName("event_id");
            // current_revision_id は Revision を指すが、Revision → head の外部キーと循環するため制約は片方向だけに置く。
            entity.Property(e => e.CurrentRevisionId).HasColumnName("current_revision_id");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.UpdatedAt).HasColumnName("updated_at");
            entity.Property(e => e.UpdatedBy).HasColumnName("updated_by");
            entity.Property(e => e.RowVersion).HasColumnName("row_version").IsConcurrencyToken();
            entity.HasOne<StudioAdmin>().WithMany().HasForeignKey(e => e.CreatedBy).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<StudioAdmin>().WithMany().HasForeignKey(e => e.UpdatedBy).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<EventRevision>(entity =>
        {
            entity.ToTable("event_revisions");
            entity.HasKey(e => e.RevisionId);
            entity.Property(e => e.RevisionId).HasColumnName("revision_id");
            entity.Property(e => e.EventId).HasColumnName("event_id");
            entity.Property(e => e.Payload).HasColumnName("payload").HasColumnType("jsonb").IsRequired();
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.BaseRevisionId).HasColumnName("base_revision_id");
            entity.Property(e => e.OperationId).HasColumnName("operation_id");
            entity.HasIndex(e => e.OperationId).IsUnique().HasDatabaseName("ix_event_revisions_operation_id");
            entity.HasIndex(e => new { e.EventId, e.CreatedAt }).HasDatabaseName("ix_event_revisions_event_id_created_at");
            entity.HasOne<EventHead>().WithMany().HasForeignKey(e => e.EventId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<StudioAdmin>().WithMany().HasForeignKey(e => e.CreatedBy).OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigurePublishing(ModelBuilder modelBuilder)
    {
        const string targetKinds = "'event', 'occurrence', 'categories', 'spot'";

        modelBuilder.Entity<Release>(entity =>
        {
            entity.ToTable("releases", table => table.HasCheckConstraint("ck_releases_source", "source IN ('studio', 'import')"));
            entity.HasKey(e => e.ReleaseId);
            entity.Property(e => e.ReleaseId).HasColumnName("release_id");
            entity.Property(e => e.Sequence).HasColumnName("sequence");
            entity.HasIndex(e => e.Sequence).IsUnique().HasDatabaseName("ix_releases_sequence");
            entity.Property(e => e.OperationId).HasColumnName("operation_id");
            // 同じ操作IDの再送で2つ目の Release を作らない（11 RA-05）。
            entity.HasIndex(e => e.OperationId).IsUnique().HasFilter("operation_id IS NOT NULL").HasDatabaseName("ix_releases_operation_id");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.Source).HasColumnName("source").IsRequired();
            entity.Property(e => e.Message).HasColumnName("message").HasMaxLength(500);
            entity.Property(e => e.ValidationRunId).HasColumnName("validation_run_id");
            entity.HasMany(e => e.Entries).WithOne().HasForeignKey(e => e.ReleaseId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<StudioAdmin>().WithMany().HasForeignKey(e => e.CreatedBy).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<ValidationRun>().WithMany().HasForeignKey(e => e.ValidationRunId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ReleaseEntry>(entity =>
        {
            entity.ToTable("release_entries", table =>
            {
                table.HasCheckConstraint("ck_release_entries_target_kind", $"target_kind IN ({targetKinds})");
                table.HasCheckConstraint("ck_release_entries_action", "action IN ('publish', 'withdraw', 'restore')");
            });
            entity.HasKey(e => new { e.ReleaseId, e.TargetKind, e.TargetId });
            entity.Property(e => e.ReleaseId).HasColumnName("release_id");
            entity.Property(e => e.TargetKind).HasColumnName("target_kind");
            entity.Property(e => e.TargetId).HasColumnName("target_id").HasMaxLength(128);
            entity.Property(e => e.Action).HasColumnName("action").IsRequired();
            entity.Property(e => e.RevisionId).HasColumnName("revision_id");
            entity.Property(e => e.PreviousRevisionId).HasColumnName("previous_revision_id");
            entity.Property(e => e.Label).HasColumnName("label").HasMaxLength(500).IsRequired();
            entity.Property(e => e.RestoredFromRevisionId).HasColumnName("restored_from_revision_id");
            entity.Property(e => e.StashedRevisionId).HasColumnName("stashed_revision_id");
            entity.HasIndex(e => new { e.TargetKind, e.TargetId }).HasDatabaseName("ix_release_entries_target");
        });

        modelBuilder.Entity<Publication>(entity =>
        {
            entity.ToTable("publications", table =>
            {
                table.HasCheckConstraint("ck_publications_target_kind", $"target_kind IN ({targetKinds})");
                table.HasCheckConstraint("ck_publications_state", "state IN ('published', 'withdrawn')");
            });
            entity.HasKey(e => new { e.TargetKind, e.TargetId });
            entity.Property(e => e.TargetKind).HasColumnName("target_kind");
            entity.Property(e => e.TargetId).HasColumnName("target_id").HasMaxLength(128);
            entity.Property(e => e.State).HasColumnName("state").IsRequired();
            entity.Property(e => e.RevisionId).HasColumnName("revision_id");
            entity.Property(e => e.ReleaseId).HasColumnName("release_id");
            entity.Property(e => e.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne<Release>().WithMany().HasForeignKey(e => e.ReleaseId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ValidationRun>(entity =>
        {
            entity.ToTable("validation_runs", table => table.HasCheckConstraint("ck_validation_runs_status", "status IN ('ok', 'failed')"));
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.Entries).HasColumnName("entries").HasColumnType("jsonb").IsRequired();
            entity.Property(e => e.Fingerprint).HasColumnName("fingerprint").IsRequired();
            entity.Property(e => e.Status).HasColumnName("status").IsRequired();
            entity.Property(e => e.Findings).HasColumnName("findings").HasColumnType("jsonb").IsRequired();
            entity.HasOne<StudioAdmin>().WithMany().HasForeignKey(e => e.CreatedBy).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OperationLog>(entity =>
        {
            entity.ToTable("operation_logs", table =>
            {
                table.HasCheckConstraint("ck_operation_logs_action", "action IN ('save', 'import', 'publish', 'signIn', 'signInFailed', 'signOut')");
                table.HasCheckConstraint("ck_operation_logs_status", "status IN ('processing', 'succeeded', 'failed')");
            });
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.OperationId).HasColumnName("operation_id");
            entity.HasIndex(e => e.OperationId).IsUnique().HasFilter("operation_id IS NOT NULL").HasDatabaseName("ix_operation_logs_operation_id");
            entity.Property(e => e.StartedAt).HasColumnName("started_at");
            entity.Property(e => e.StartedAtMs).HasColumnName("started_at_ms");
            entity.HasIndex(e => e.StartedAtMs).HasDatabaseName("ix_operation_logs_started_at_ms");
            entity.Property(e => e.FinishedAt).HasColumnName("finished_at");
            entity.Property(e => e.ActorId).HasColumnName("actor_id");
            entity.Property(e => e.Action).HasColumnName("action").IsRequired();
            entity.Property(e => e.TargetKind).HasColumnName("target_kind");
            entity.Property(e => e.TargetId).HasColumnName("target_id").HasMaxLength(128);
            entity.Property(e => e.TargetLabel).HasColumnName("target_label").HasMaxLength(500);
            entity.Property(e => e.Status).HasColumnName("status").IsRequired();
            entity.Property(e => e.ReleaseId).HasColumnName("release_id");
            entity.Property(e => e.RevisionId).HasColumnName("revision_id");
            entity.Property(e => e.Detail).HasColumnName("detail").HasMaxLength(2000);
            entity.HasOne<StudioAdmin>().WithMany().HasForeignKey(e => e.ActorId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
