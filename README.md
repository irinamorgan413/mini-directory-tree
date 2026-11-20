# mini-directory-tree

Walks a directory tree and emits a deterministic JSON-compatible array of `{ path, type, size }` entries suitable for snapshot comparison.

```js
import { serializeDirectory } from 'mini-directory-tree';

const entries = serializeDirectory('/some/dir');
// [
//   { path: 'a.txt', type: 'file', size: 5 },
//   { path: 'sub', type: 'dir', size: 0 },
//   { path: 'sub/b.txt', type: 'file', size: 2 },
// ]
```

## Why this exists

Snapshot tests for filesystem layout usually need a stable, byte-for-byte comparable representation of a tree. The two things that break that stability are ordering and path separators. This library fixes both: siblings are sorted by byte order (not `localeCompare`, which varies by host locale), and every emitted path uses POSIX separators regardless of platform. The trade-off is that the output is not locale-friendly for human display — it is meant to be diffed, not read.

## Exports

- `serializeDirectory(root)` — walks `root` and returns an array of entries. The root itself is not included. Directories appear before their contents; siblings are sorted by name. Symlinks are reported as `type: 'symlink'` with `size: 0` and are not followed, so the snapshot cannot depend on files outside the tree or loop on cycles. Unreadable directories and unstatable entries are reported as `type: 'other'` with `size: 0`.
- `serializeEntries(entries)` — normalizes an in-memory list of `{ path, type?, size? }` objects into the same shape, defaulting `type` to `'other'` and `size` to `0`. Throws `TypeError` for malformed entries and `RangeError` for negative or non-finite sizes.

## The awkward edge

Sizes are only meaningful for regular files. Directories, symlinks, and other special files are emitted with `size: 0` on purpose: a directory's `st_size` is filesystem-dependent and would make snapshots non-portable. If you need aggregate sizes, sum the `file` entries yourself.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

