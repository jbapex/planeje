import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destDir = resolve(root, 'public/downloads');
const dest = resolve(destDir, 'planeje-meet-extensao.zip');

mkdirSync(destDir, { recursive: true });

const py = `
import zipfile, pathlib
root = pathlib.Path(${JSON.stringify(root)})
src = root / "extensao-meet-planeje"
dest = pathlib.Path(${JSON.stringify(dest)})
if dest.exists():
    dest.unlink()
skip = {".DS_Store"}
with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in src.rglob("*"):
        if path.is_dir() or path.name in skip:
            continue
        zf.write(path, path.relative_to(root).as_posix())
print(dest)
`;

const packed = spawnSync('python3', ['-c', py], { cwd: root, encoding: 'utf8' });
if (packed.status !== 0) {
  console.error(packed.stderr || 'Falha ao gerar o ZIP da extensão de reuniões.');
  process.exit(packed.status || 1);
}
console.log(`Extensão empacotada em ${dest}`);
