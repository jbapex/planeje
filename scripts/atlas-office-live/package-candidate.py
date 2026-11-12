"""Package only this change; never package the unrelated dirty working tree."""
from pathlib import Path
import hashlib
import json
import tarfile

root = Path(__file__).resolve().parents[2]
out = root / '.local/atlas-office-live'
out.mkdir(parents=True, exist_ok=True)
allow = [
    'src/components/pages/AtlasPage.jsx',
    'src/components/atlas/AtlasInbox.jsx',
    'src/components/atlas/AtlasOffice.jsx',
    'src/components/atlas/AtlasOffice.css',
    'src/lib/atlasApi.js',
    'src/lib/atlasOfficePresentation.js',
    'supabase/functions/atlas-office',
    'supabase/functions/_shared/atlasOffice.js',
    'supabase/functions/_shared/atlasOfficeManager.js',
    'supabase/migrations/20261015044353_atlas_office_manager.sql',
    'supabase/migrations/20261015122902_atlas_office_task_audit_reference.sql',
    'scripts/atlas-office-worker.mjs',
    'scripts/atlasOffice.test.mjs',
    'scripts/atlasOfficeDatabase.test.mjs',
    'scripts/atlasOfficeApi.test.py',
    'scripts/atlasOfficeModelSmoke.mjs',
    'scripts/atlasOfficeLiveRead.mjs',
    'scripts/atlas-office-live',
    'scripts/atlas-office-preview',
    'public/atlas-office',
]
files = set()
for item in allow:
    path = root / item
    if not path.exists():
        raise SystemExit('Required source missing: ' + item)
    for source in path.rglob('*') if path.is_dir() else [path]:
        if source.is_file() and source.name != '.DS_Store':
            if source.is_symlink() or any(p.startswith('.env') for p in source.parts):
                raise SystemExit('Private or linked source refused')
            files.add(source.relative_to(root).as_posix())
manifest = [{'path': p, 'sha256': hashlib.sha256((root/p).read_bytes()).hexdigest()}
            for p in sorted(files)]
(out/'candidate-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
archive = out/'atlas-office-candidate.tar.gz'
with tarfile.open(archive, 'w:gz') as bundle:
    for item in manifest:
        bundle.add(root/item['path'], arcname=item['path'])
print(json.dumps({'files': len(files), 'archive': str(archive),
                  'bytes': archive.stat().st_size, 'production_modified': False}))
