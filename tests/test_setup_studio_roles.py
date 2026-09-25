"""The role setup wrapper must reject wrong targets before invoking its DDL file."""
import os
from pathlib import Path
import subprocess
import tempfile

SCRIPT = Path(__file__).resolve().parents[1] / "deploy/database/setup-studio-roles.sh"


def exercise(metadata: str, expected_id: str = "123456789") -> tuple[int, bool]:
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
        }
        result = subprocess.run([str(SCRIPT)], env=env, capture_output=True, text=True, check=False)
        return result.returncode, marker.exists()


for rejected in (
    "nexus_admin|postgres|170011|123456789",
    "other_db|postgres|180006|123456789",
    "nexus_admin|other_user|180006|123456789",
    "nexus_admin|postgres|180006|999999999",
    "garbled-response",
):
    status, ddl_called = exercise(rejected)
    assert status != 0 and not ddl_called, rejected
status, ddl_called = exercise("nexus_admin|postgres|180006|123456789")
assert status == 0 and ddl_called
print("Studio role target preflight checks passed")
