from pathlib import Path
import os, subprocess, sys
root=Path(__file__).resolve().parents[1];os.chdir(root)
subprocess.run([sys.executable,'scripts/build.py'],check=True)
subprocess.run(['node','--check','dist/app.js'],check=True)
subprocess.run([sys.executable,'config-sync/test_sync.py'],check=True)
for test in sorted(Path('tests').glob('check-*.cjs')):subprocess.run(['node',str(test)],check=True)
