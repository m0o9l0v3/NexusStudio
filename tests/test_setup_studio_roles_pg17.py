"""The PG17 role setup wrapper must reject wrong targets before invoking its DDL file (Infra #8)."""
import os
from pathlib import Path
import subprocess
import tempfile

SCRIPT = Path(__file__).resolve().parents[1] / "deploy/database/pg17/setup-studio-roles.sh"


def exercise(metadata: str, expected_id: str = "123456789", **overrides: str) -> tuple[int, bool]:
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        bin_dir = root / "bin"
        bin_dir.mkdir()
        marker = root / "ddl-called"
        psql = bin_dir / "psql"
        psql.write_text("""#!/usr/bin/env python3
import os, pathlib, sys
args = sys.argv[1:]
if '-c' in args:
    print(os.environ['FAKE_METADATA'])
elif '-f' in args:
    pathlib.Path(os.environ['FAKE_DDL_MARKER']).write_text('called')
else:
    sys.exit(2)
""")
        psql.chmod(0o755)
        env = os.environ | {
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "FAKE_METADATA": metadata,
            "FAKE_DDL_MARKER": str(marker),
            "NEXUS_STUDIO_MIGRATOR_PASSWORD": "m" * 32,
            "NEXUS_STUDIO_APP_PASSWORD": "a" * 32,
            "NEXUS_STUDIO_TARGET_ENV": "verification",
            "NEXUS_STUDIO_TARGET_HOST": "postgres",
            "NEXUS_STUDIO_TARGET_PORT": "5432",
            "NEXUS_STUDIO_EXPECTED_SYSTEM_ID": expected_id,
        } | overrides
        result = subprocess.run([str(SCRIPT)], env=env, capture_output=True, text=True, check=False)
        return result.returncode, marker.exists()


ACCEPTED = "nexus|nexus|true|170011|123456789"
for rejected in (
    "nexus|nexus|true|180006|123456789",
    "nexus|nexus|true|160009|123456789",
    "nexus_admin|nexus|true|170011|123456789",
    "nexus|postgres|true|170011|123456789",
    "nexus|nexus|false|170011|123456789",
    "nexus|nexus|true|170011|999999999",
    "garbled-response",
):
    status, ddl_called = exercise(rejected)
    assert status != 0 and not ddl_called, rejected
status, ddl_called = exercise(ACCEPTED, NEXUS_STUDIO_TARGET_ENV="production")
assert status != 0 and not ddl_called, "production without approval flag"
status, ddl_called = exercise(ACCEPTED, NEXUS_STUDIO_TARGET_ENV="production", ALLOW_PRODUCTION_STUDIO_ROLE_SETUP="1")
assert status != 0 and not ddl_called, "the PG18 approval flag must not open PG17 production"
status, ddl_called = exercise(ACCEPTED)
assert status == 0 and ddl_called
print("Studio PG17 role target preflight checks passed")
