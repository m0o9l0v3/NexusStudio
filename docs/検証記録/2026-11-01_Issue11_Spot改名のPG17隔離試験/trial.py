"""Spot rename trial on the disposable PG17 (NexusStudio decision record 32). Prints no secrets."""
import http.cookiejar, json, os, subprocess, sys, time, urllib.request, uuid
T = os.path.dirname(os.path.abspath(__file__))
STUDIO = "/Users/m09/Desktop/アプリ開発/Nexus/nexus-studio"
DLL = f"{STUDIO}/apps/studio-api/bin/Release/net10.0/StudioApi.dll"
PG = "nexus-rename-trial-pg"
ADMIN = "trial-admin@example.test"
OLD, NEW = "mb_1f_cl_001", "mb_1f_cl_002"
OCC, DAY, CAT = "0199a000-0000-7000-8000-000000000001", "0199a000-0000-7000-8000-000000000101", "0199a000-0000-7000-8000-000000000301"
secret = lambda n: open(f"{T}/secrets/{n}").read().strip()
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS: " if cond else "FAIL: ") + name + ("" if cond else f"\n  {detail}"), flush=True)
    if not cond:
        sys.exit(1)

def env(environment):
    return dict(os.environ, DOTNET_ROLL_FORWARD="Major", ASPNETCORE_ENVIRONMENT=environment,
                ConnectionStrings__StudioDatabaseFile=f"{T}/secrets/app_connection",
                MapValidation__ApprovedSettingsFile=f"{T}/approved-settings.json", Logging__LogLevel__Default="Warning",
                **{"Logging__LogLevel__Microsoft.EntityFrameworkCore": "Error"})

def cli(*args, stdin=None):
    r = subprocess.run(["dotnet", DLL, *args], env=env("Production"), input=stdin, capture_output=True, text=True, cwd=T)
    return r.returncode, r.stdout, r.stderr

def sql(query, user="nexus"):
    cmd = ["docker", "exec", "-i"]
    if user != "nexus":
        cmd += ["-e", "PGPASSWORD"]
    r = subprocess.run(cmd + [PG, "psql", "-h", "localhost", "-U", user, "-d", "nexus", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", query],
                       env=dict(os.environ, PGPASSWORD=secret({"nexus_public": "public", "nexus_studio_app": "app"}.get(user, "superuser"))),
                       capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"sql failed: {query}\n{r.stderr}")
    return r.stdout.strip()

def write(name, data):
    with open(f"{T}/{name}", "w", encoding="utf-8") as f:
        f.write(data if isinstance(data, str) else json.dumps(data, ensure_ascii=False))
    return f"{T}/{name}"

# ---- files (test values matching the fixture, not approved real values)
fixture = json.load(open(f"{STUDIO}/docs/schemas/examples/map-dataset-geojson-v2.example.json", encoding="utf-8"))
def renamed(data):
    data = json.loads(json.dumps(data))
    next(f for f in data["features"] if f["id"] == OLD)["id"] = NEW
    return data
write("approved-settings.json", {"status": "approved", "approvedBy": "試験", "approvedAt": "2026-11-01",
    "campusBoundary": {"type": "Polygon", "coordinates": [[[141.68, 42.77], [141.69, 42.77], [141.69, 42.78], [141.68, 42.78], [141.68, 42.77]]]},
    "enuOrigin": {"longitude": 141.68, "latitude": 42.77}, "entranceMaxGapMetres": 5, "pathDistanceToleranceMetres": 1, "startNodeIds": ["campus_n_020"]})
evidence = write("evidence.json", {"expectedPathSeconds": {"campus_e_012": 15, "campus_e_013": 25, "mb_1f_e_001": 13},
    "floorTransforms": {"mb_1f": {"roundTripMaxMetres": 0.01, "fitRmsMetres": 1, "fitMaxMetres": 1, "checkMaxMetres": 1, "roundingMaxMetres": 0.01}}})
reference = write("reference.json", {"occurrences": [{"id": OCC, "name": "改名試験の開催回", "days": [{"id": DAY, "date": "2027-09-20", "publicStart": "10:00", "publicEnd": "16:00"}]}],
    "categories": [{"id": CAT, "name": "体験", "sortOrder": 1, "selectable": True}],
    "spots": [{"canonicalId": OLD, "name": "1A教室", "aliases": ["1A"], "isPublished": False, "utilization": "available", "kind": "classroom"}]})

# ---- seed with the real CLI (Production, nexus_studio_app)
code, out, err = cli("admin", "add", "--email", ADMIN, "--name", "改名試験", stdin=secret("admin_password") + "\n")
check("admin add (Production, nexus_studio_app)", code == 0, err)
code, out, err = cli("reference", "import", "--file", reference)
check("reference import", code == 0, err)
code, out, err = cli("map", "import", "--file", write("map-v1.json", fixture), "--evidence", evidence)
check("map import v1", code == 0, err)

# ---- publish the starting state through the API (Development web server, same runtime role)
web = subprocess.Popen(["dotnet", DLL, "--urls", "http://127.0.0.1:5081"], env=env("Development"), cwd=T,
                       stdout=open(f"{T}/web.log", "w"), stderr=subprocess.STDOUT)
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def call(method, path, body=None):
    headers = {"Content-Type": "application/json"}
    if method != "GET":
        headers["X-XSRF-TOKEN"] = call("GET", "/api/auth/csrf")["token"]
    req = urllib.request.Request("http://127.0.0.1:5081" + path, method=method, headers=headers,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with opener.open(req) as r:
            text = r.read().decode()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read().decode()}")
    return json.loads(text) if text else None
try:
    for _ in range(60):
        try:
            urllib.request.urlopen("http://127.0.0.1:5081/health"); break
        except Exception:
            time.sleep(1)
    call("POST", "/api/auth/login", {"email": ADMIN, "password": secret("admin_password")})
    def entry(kind, target, rev): return {"targetKind": kind, "targetId": target, "action": "publish", "revisionId": rev}
    def preview(*entries):
        return call("POST", "/api/releases/preview", {"entries": list(entries)})
    def publish(*entries):
        p = preview(*entries)
        blocking = [f for f in p["validation"]["findings"] if f["severity"] == "blocking"]
        if blocking:
            raise SystemExit(f"blocking: {blocking}")
        body = call("POST", "/api/releases", {"operationId": str(uuid.uuid4()), "entries": p["validation"]["entries"],
                                               "confirmedValidationId": p["validation"]["id"], "message": None})
        assert body["status"] == "succeeded", body
    def event(title, venue):
        return call("POST", "/api/events", {"operationId": str(uuid.uuid4()), "draft": {
            "schemaVersion": "studio.event/1", "title": title, "description": "改名の試験用", "categoryId": CAT, "occurrenceId": OCC,
            "slots": [{"slotId": str(uuid.uuid4()), "ocDayId": DAY, "timeMode": "allDay", "fixed": None, "participation": "anytime",
                       "status": "normal", "cancelNote": None, "venues": [{"canonicalSpotId": venue, "note": None}]}]}})["id"]

    v1 = sql("SELECT id FROM studio.map_datasets WHERE version = 1")
    publish(entry("map", "map", v1))
    spot = call("GET", f"/api/spots/item?id={OLD}")
    publish(entry("occurrence", OCC, call("GET", f"/api/occurrences/{OCC}")["revisionId"]),
            entry("categories", "categories", call("GET", "/api/categories")["revisionId"]),
            entry("spot", OLD, spot["revisionId"]))
    published_event = event("公開中のイベント", OLD)
    publish(entry("event", published_event, call("GET", f"/api/events/{published_event}")["revisionId"]))
    draft_only = event("下書きだけのイベント", OLD)
    # Then stop new selections of the spot (review fix 2 on NexusStudio#26).
    spot = call("GET", f"/api/spots/item?id={OLD}")
    draft = spot["draft"]; draft["utilization"] = "noNewSelection"
    saved = call("PUT", f"/api/spots/item?id={OLD}", {"operationId": str(uuid.uuid4()), "rowVersion": spot["rowVersion"], "draft": draft})
    publish(entry("spot", OLD, saved["revisionId"]))
    check("starting state published: map v1, occurrence, categories, spot, one event; one draft-only event; spot then set to noNewSelection", True)
finally:
    web.terminate(); web.wait(30)

# An existing alias pointing at the old ID (T2 retarget), appended as the runtime role.
sql("INSERT INTO studio.id_reservations (sequence, id, entity_kind, state, canonical_id, created_at, source) "
    "SELECT max(sequence) + 1, 'old_cl_001', 'spot', 'alias', 'mb_1f_cl_001', now(), 'import' FROM studio.id_reservations", user="nexus_studio_app")
check("existing alias old_cl_001 -> mb_1f_cl_001 appended by nexus_studio_app", sql("SELECT canonical_id FROM studio.id_reservations WHERE id = 'old_cl_001'") == OLD)

COUNTS = ("SELECT (SELECT count(*) FROM studio.releases) || ',' || (SELECT count(*) FROM studio.spots) || ',' || (SELECT count(*) FROM studio.id_reservations)"
          " || ',' || (SELECT count(*) FROM studio.event_revisions) || ',' || (SELECT count(*) FROM delivery.participant_bundles) || ',' || (SELECT bundle_version FROM delivery.current_bundle)")
def rename(version, apply, frm=OLD, to=NEW):
    return cli("spot", "rename", "--from", frm, "--to", to, "--map-version", str(version), "--admin", ADMIN, *(["--apply"] if apply else []))
def refused(name, expected, run):
    before = sql(COUNTS)
    code, out, err = run
    check(f"refused: {name}", code == 1 and expected in err and sql(COUNTS) == before, f"{code} {out} {err}")

refused("published map version (not a draft)", "取り込み済みの下書きではありません", rename(1, True))
code, out, err = cli("map", "import", "--file", write("map-v2.json", renamed(fixture)), "--evidence", evidence)
check("map import v2 (destination renamed)", code == 0, err)
still = renamed(fixture); copy = json.loads(json.dumps(next(f for f in still["features"] if f["id"] == NEW))); copy["id"] = OLD
copy["properties"]["access_node_id"] = "mb_1f_n_005"; still["features"].append(copy)
code, out, err = cli("map", "import", "--file", write("map-v3.json", still), "--evidence", evidence)
check("map import v3 (still has the old ID)", code == 0, err)
refused("map still has the old ID", "まだ mb_1f_cl_001 があります", rename(3, True))
refused("older version than the latest import", "より新しい版 v3 が取り込まれています", rename(2, True))
code, out, err = cli("map", "import", "--file", write("map-v4.json", renamed(fixture)), "--evidence", evidence)
check("map import v4 (destination renamed, latest)", code == 0, err)
refused("new ID already reserved (alias)", "予約表にあります", rename(4, True, to="old_cl_001"))
refused("new ID absent from the map", "同じ種別", rename(4, True, to="mb_1f_cl_003"))
refused("old ID not published", "公開中ではありません", rename(4, True, frm="mb_ent_001"))
code, out, err = cli("spot", "rename", "--from", OLD, "--to", NEW, "--map-version", "4", "--admin", "nobody@example.test", "--apply")
check("refused: unknown admin", code == 1)

before = sql(COUNTS)
code, out, err = rename(4, False)
print(out.strip())
check("dry run succeeds and leaves nothing (counts and bundle pointer unchanged)", code == 0 and "確認だけ" in out and sql(COUNTS) == before, err)
code, out, err = rename(4, True)
print(out.strip())
check("rename applied (Production CLI, nexus_studio_app)", code == 0 and "改名しました" in out, err)
after = sql(COUNTS).split(","); b = before.split(",")
check("exactly one new release and one new bundle; pointer advanced by one", int(after[0]) == int(b[0]) + 1 and int(after[4]) == int(b[4]) + 1 and int(after[5]) == int(b[5]) + 1, f"{before} -> {','.join(after)}")

rel = sql("SELECT release_id FROM studio.releases ORDER BY sequence DESC LIMIT 1")
print("release:", sql(f"SELECT message FROM studio.releases WHERE release_id = '{rel}'"))
entries = sql(f"SELECT string_agg(target_kind || ':' || target_id || ':' || action, ' ' ORDER BY target_kind, target_id) FROM studio.release_entries WHERE release_id = '{rel}'")
print("entries:", entries)
check("release entries: event republish, map v4 publish, new spot publish, old spot withdraw",
      set(entries.split(" ")) == {f"event:{published_event}:publish", "map:map:publish", f"spot:{OLD}:withdraw", f"spot:{NEW}:publish"}, entries)
pubs = sql("SELECT string_agg(target_kind || ':' || target_id || ':' || state, ' ' ORDER BY target_kind, target_id) FROM studio.publications WHERE target_kind = 'spot'")
check("publications: old spot withdrawn, new spot published", set(pubs.split(" ")) == {f"spot:{NEW}:published", f"spot:{OLD}:withdrawn"}, pubs)
check("map v4 is the published map", sql("SELECT d.version FROM studio.publications p JOIN studio.map_datasets d ON d.id = p.revision_id WHERE p.target_kind = 'map'") == "4")
check("new spot copied with noNewSelection and a 'rename' revision",
      sql(f"SELECT s.utilization || ':' || r.source FROM studio.spots s JOIN studio.reference_revisions r ON r.revision_id = s.current_revision_id WHERE s.canonical_id = '{NEW}'") == "noNewSelection:rename")
venue = lambda rid: sql(f"SELECT payload::jsonb #>> '{{slots,0,venues,0,canonicalSpotId}}' FROM studio.event_revisions WHERE revision_id = '{rid}'")
check("published event republished with the new venue", venue(sql(f"SELECT revision_id FROM studio.publications WHERE target_kind = 'event' AND target_id = '{published_event}'")) == NEW)
check("draft-only event gets a new draft revision with the new venue and stays unpublished",
      venue(sql(f"SELECT current_revision_id FROM studio.event_heads WHERE event_id = '{draft_only}'")) == NEW
      and sql(f"SELECT count(*) FROM studio.publications WHERE target_kind = 'event' AND target_id = '{draft_only}'") == "0")
ledger = sql("SELECT string_agg(id || ':' || entity_kind || ':' || state || ':' || coalesce(canonical_id, '-') || ':' || source || ':' || (release_id IS NOT DISTINCT FROM '" + rel + "'), ' ' ORDER BY sequence) "
             f"FROM studio.id_reservations WHERE id IN ('{OLD}', '{NEW}', 'old_cl_001')")
print("ledger:", ledger)
for row in (f"{OLD}:spot:retired:-:rename:true", f"{OLD}:room:retired:-:rename:true", f"{OLD}:spot:alias:{NEW}:rename:true",
            f"old_cl_001:spot:alias:{NEW}:rename:true", f"{NEW}:spot:active:-:release:true"):
    check(f"ledger appended: {row}", row in ledger.split(" "), ledger)
bundle = json.loads(sql("SELECT convert_from(b.payload, 'UTF8') FROM delivery.current_bundle c JOIN delivery.participant_bundles b USING (bundle_version)", user="nexus_public"))
check("nexus_public reads the new bundle: spots = [new ID] in the room", [s["id"] for s in bundle["spots"]] == [NEW] and bundle["spots"][0]["placement"]["feature_type"] == "room", bundle["spots"])
check("bundle id_aliases: old ID and old alias resolve to the new ID",
      sorted((a["alias"], a["canonical_id"]) for a in bundle["id_aliases"]) == [(OLD, NEW), ("old_cl_001", NEW)], bundle["id_aliases"])
refused("second rename of the same old ID", "公開中ではありません", rename(4, True))
print(f"{len(results)} checks passed (disposable PG17 only; production untouched)")
