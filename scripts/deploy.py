"""Run on the NAS after building, testing and reviewing dist/index.html."""
from pathlib import Path
from datetime import datetime, timezone
import os, shutil, hashlib
project=Path(__file__).resolve().parents[1]
root=Path(os.environ.get('ENERGIE_ROOT','/volume1/docker/energie'))
source=project/'dist/index.html';target=root/'html/index.html'
if not target.is_file():raise SystemExit('Existing installation not found; no file changed')
data=source.read_bytes()
if b'<html lang="fr">' not in data or b'energy-config-status' not in data:raise SystemExit('Invalid build')
backup=root/'backups'/('git-'+datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f'));backup.mkdir(parents=True)
shutil.copy2(target,backup/'index.html')
staged=target.with_name('.index.deploy.tmp');staged.write_bytes(data);staged.chmod(0o644);os.replace(staged,target)
print('Published SHA256:',hashlib.sha256(data).hexdigest());print('Backup:',backup)
