using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using StudioApi.Models;
using StudioApi.Publishing;
using StudioApi.Reference;

namespace StudioApi.Tests;

/// <summary>bundle の不変条件の自己検査（nexus-mobile E2-5 §5.3）。射影した bundle を壊して、検査が見つけることを確かめる。</summary>
public class ParticipantBundleInvariantsTests
{
    private static PublishedSet Published()
    {
        var payload = MapImportTests.FixturePayload;
        var published = new PublishedSet
        {
            Map = (Guid.NewGuid(), new MapDataset
            {
                Version = 1,
                Status = MapDatasetStatus.Published,
                Payload = payload,
                Checksum = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(payload))),
            }),
        };
        // 目的地の4種別と、取り下げ済み（bundle に含めない）の spot。
        foreach (var (id, name) in new[] { ("mb", "教室棟"), ("mb_ent_001", "正面入口"), ("mb_1f_cl_001", "1A教室"), ("campus_lm_001", "記念碑") })
        {
            published.Spots[id] = (Guid.NewGuid(), new SpotDraft(name, [], SpotUtilization.Available, "facility"));
        }

        published.Spots["gone"] = (Guid.NewGuid(), new SpotDraft("取り下げ済み", [], SpotUtilization.Withdrawn));
        return published;
    }

    private static IdReservationSnapshot Reservations(params (string Alias, string Target)[] aliases)
        => IdReservationSnapshot.Of(aliases.Select((a, i) => new IdReservation
        {
            Sequence = i + 1, Id = a.Alias, EntityKind = IdEntityKind.Spot, State = IdReservationState.Alias, CanonicalId = a.Target,
        }).ToList());

    private static JsonObject Bundle(PublishedSet published)
        => JsonNode.Parse(ParticipantBundleProjection.Build(published, Reservations(("old_cl_001", "mb_1f_cl_001")), 7, Guid.NewGuid(), DateTimeOffset.UnixEpoch))!.AsObject();

    private static IReadOnlyList<string> Check(JsonObject bundle, PublishedSet published)
        => ParticipantBundleInvariants.Check(Encoding.UTF8.GetBytes(bundle.ToJsonString()), published);

    private static JsonObject Spot(JsonObject bundle, string id)
        => bundle["spots"]!.AsArray().Single(s => s!["id"]!.GetValue<string>() == id)!.AsObject();

    [Fact]
    public void ProjectedBundle_SatisfiesTheInvariants()
    {
        var published = Published();
        var bytes = ParticipantBundleProjection.Build(published, Reservations(("old_cl_001", "mb_1f_cl_001")), 7, Guid.NewGuid(), DateTimeOffset.UnixEpoch);
        Assert.Empty(ParticipantBundleInvariants.Check(bytes, published));
        ParticipantBundleSchema.AssertValid(bytes);

        // 地図が無ければ placement はすべて null で、それも条件を満たす。
        var withoutMap = Published();
        withoutMap.Map = null;
        Assert.Empty(ParticipantBundleInvariants.Check(ParticipantBundleProjection.Build(withoutMap, Reservations(), 1, Guid.NewGuid(), DateTimeOffset.UnixEpoch), withoutMap));
    }

    public static TheoryData<string, string> Breakages => new()
    {
        { "duplicate_spot", "重複" },
        { "alias_is_floor", "重なって" },
        { "alias_target_missing", "解決先" },
        { "placement_null_with_destination", "null" },
        { "floor_of_other_building", "floor_id" },
        { "building_missing", "building_id" },
        { "landmark_with_building", "建物・階・到達ノード" },
        { "access_node_missing", "access_node_id" },
        { "point_moved", "point" },
        { "map_sha", "dataset_sha256" },
        { "map_dropped", "map の有無" },
        { "unpublished_spot", "公開中ではない" },
        { "missing_spot", "含まれていません" },
    };

    [Theory]
    [MemberData(nameof(Breakages))]
    public void BrokenBundles_AreReported(string breakage, string expected)
    {
        var published = Published();
        var bundle = Bundle(published);
        Assert.Empty(Check(bundle, published));
        var spots = bundle["spots"]!.AsArray();
        var aliases = bundle["id_aliases"]!.AsArray();
        switch (breakage)
        {
            case "duplicate_spot":
                spots.Add(Spot(bundle, "mb").DeepClone());
                break;
            case "alias_is_floor":
                aliases.Add(new JsonObject { ["alias"] = "mb_1f", ["canonical_id"] = "mb_1f_cl_001" });
                break;
            case "alias_target_missing":
                aliases[0]!["canonical_id"] = "gone";
                break;
            case "placement_null_with_destination":
                Spot(bundle, "mb_ent_001")["placement"] = null;
                break;
            case "floor_of_other_building":
                // 階の所属建物（mb）と placement の建物が食い違う。
                Spot(bundle, "mb_1f_cl_001")["placement"]!["building_id"] = "mb_other";
                break;
            case "building_missing":
                Spot(bundle, "mb")["placement"]!["building_id"] = null;
                break;
            case "landmark_with_building":
                Spot(bundle, "campus_lm_001")["placement"]!["building_id"] = "mb";
                break;
            case "access_node_missing":
                Spot(bundle, "campus_lm_001")["placement"]!["access_node_id"] = "campus_n_999";
                break;
            case "point_moved":
                Spot(bundle, "mb_1f_cl_001")["placement"]!["point"]![0] = 141.0;
                break;
            case "map_sha":
                bundle["map"]!["dataset_sha256"] = new string('0', 64);
                break;
            case "map_dropped":
                bundle["map"] = null;
                break;
            case "unpublished_spot":
                var extra = Spot(bundle, "mb").DeepClone().AsObject();
                extra["id"] = "draft_only";
                extra["placement"] = null;
                spots.Add(extra);
                break;
            case "missing_spot":
                spots.Remove(Spot(bundle, "campus_lm_001"));
                break;
        }

        var errors = Check(bundle, published);
        Assert.Contains(errors, e => e.Contains(expected, StringComparison.Ordinal));
    }
}
