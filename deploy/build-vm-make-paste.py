#!/usr/bin/env python3
"""Build a one-shot VM paste that writes Makefile + compose, then runs make deploy."""
from __future__ import annotations

import base64
from pathlib import Path

root = Path(__file__).resolve().parents[1]
mf = base64.b64encode((root / "Makefile").read_bytes()).decode()
comp = base64.b64encode((root / "docker-compose.prod.yml").read_bytes()).decode()
script = f"""#!/usr/bin/env bash
set -euo pipefail
cd "$HOME"
mkdir -p wqms
cd wqms
python3 - << 'PY'
import base64, pathlib
pathlib.Path("Makefile").write_bytes(base64.b64decode("{mf}"))
pathlib.Path("docker-compose.prod.yml").write_bytes(base64.b64decode("{comp}"))
print("Makefile and compose written")
PY
make deploy
"""
out = Path(__file__).with_name("run-make-deploy-on-vm.sh")
out.write_text(script)
print(f"wrote {out} ({out.stat().st_size} bytes)")
