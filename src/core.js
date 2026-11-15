import { readdirSync, lstatSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';

/**
 * Normalize a platform path to POSIX separators so snapshots are portable
 * across Windows and Unix. The tree structure itself is platform-independent,
 * but the emitted paths must be stable for byte-for-byte comparison.
 */
function toPosix(p) {
  return p.split(sep).join(posix.sep);
}

/**
 * Sort entries by name using a byte-wise comparison. Locale-aware sorting
 * (`localeCompare`) would make the output depend on the host's locale, which
 * defeats the purpose of a deterministic snapshot.
 */
function byName(a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

/**
 * Walk a directory tree and emit a deterministic array of entries.
 *
 * Each entry is a plain object:
 *   { path: string, type: 'file' | 'dir' | 'symlink' | 'other', size: number }
 *
 * `path` is relative to `root` and uses POSIX separators. The root itself is
 * not included. Directories are emitted before their contents (pre-order),
 * and siblings are sorted by name.
 *
 * Symlinks are reported with type 'symlink' and size 0; they are NOT followed.
 * Following links would make the snapshot depend on files outside the tree and
 * could introduce cycles. This is a deliberate trade-off: the snapshot records
 * what is in the tree, not what it points to.
 *
 * @param {string} root Absolute or relative path to the directory to walk.
 * @returns {Array<{path: string, type: string, size: number}>}
 */
export function serializeDirectory(root) {
  const out = [];
  walk(root, root, out);
  return out;
}

function walk(root, dir, out) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (err) {
    // A directory we cannot read is reported as an 'other' entry so the
    // snapshot records that something exists there without pretending to
    // know its contents.
    const rel = toPosix(relative(root, dir)) || '.';
    out.push({ path: rel, type: 'other', size: 0 });
    return;
  }

  const entries = names.map((name) => {
    const full = join(dir, name);
    let st;
    try {
      st = lstatSync(full);
    } catch (err) {
      return { name, full, type: 'other', size: 0 };
    }
    let type;
    if (st.isSymbolicLink()) type = 'symlink';
    else if (st.isDirectory()) type = 'dir';
    else if (st.isFile()) type = 'file';
    else type = 'other';
    return { name, full, type, size: st.isFile() ? st.size : 0 };
  });

  entries.sort(byName);

  for (const e of entries) {
    const rel = toPosix(relative(root, e.full));
    out.push({ path: rel, type: e.type, size: e.size });
    if (e.type === 'dir') {
      walk(root, e.full, out);
    }
  }
}

/**
 * Serialize an in-memory list of entries. Useful for tests and for callers
 * that already have a directory listing and do not want to touch the disk.
 *
 * @param {Array<{path: string, type?: string, size?: number}>} entries
 * @returns {Array<{path: string, type: string, size: number}>}
 */
export function serializeEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('entries must be an array');
  }
  return entries.map((e) => {
    if (e == null || typeof e.path !== 'string') {
      throw new TypeError('each entry must have a string path');
    }
    const type = e.type == null ? 'other' : String(e.type);
    const size = e.size == null ? 0 : Number(e.size);
    if (!Number.isFinite(size) || size < 0) {
      throw new RangeError('entry size must be a non-negative finite number');
    }
    return { path: toPosix(e.path), type, size };
  });
}
