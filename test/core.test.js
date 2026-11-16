import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeDirectory, serializeEntries } from '../src/core.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mini-directory-tree-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('serializeDirectory returns an empty array for an empty directory', () => {
  withTempDir((dir) => {
    assert.deepEqual(serializeDirectory(dir), []);
  });
});

test('serializeDirectory lists files with sizes and dirs with size zero', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'a.txt'), 'hello');
    writeFileSync(join(dir, 'sub', 'b.txt'), 'xy');

    const out = serializeDirectory(dir);
    assert.deepEqual(out, [
      { path: 'a.txt', type: 'file', size: 5 },
      { path: 'sub', type: 'dir', size: 0 },
      { path: 'sub/b.txt', type: 'file', size: 2 },
    ]);
  });
});

test('serializeDirectory sorts siblings by byte order, not locale', () => {
  withTempDir((dir) => {
    // 'Z' (0x5A) sorts before 'a' (0x61) in byte order, unlike localeCompare.
    writeFileSync(join(dir, 'a.txt'), '');
    writeFileSync(join(dir, 'Z.txt'), '');
    const out = serializeDirectory(dir);
    assert.deepEqual(out.map((e) => e.path), ['Z.txt', 'a.txt']);
  });
});

test('serializeDirectory reports symlinks without following them', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'target.txt'), 'data');
    symlinkSync('target.txt', join(dir, 'link.txt'));
    const out = serializeDirectory(dir);
    const link = out.find((e) => e.path === 'link.txt');
    assert.deepEqual(link, { path: 'link.txt', type: 'symlink', size: 0 });
    const target = out.find((e) => e.path === 'target.txt');
    assert.deepEqual(target, { path: 'target.txt', type: 'file', size: 4 });
  });
});

test('serializeDirectory emits directories before their contents', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'a'));
    mkdirSync(join(dir, 'a', 'b'));
    writeFileSync(join(dir, 'a', 'b', 'c.txt'), '');
    const paths = serializeDirectory(dir).map((e) => e.path);
    assert.deepEqual(paths, ['a', 'a/b', 'a/b/c.txt']);
  });
});

test('serializeEntries normalizes separators and defaults', () => {
  const out = serializeEntries([
    { path: 'a\\b\\c.txt' },
    { path: 'x', type: 'file', size: 3 },
  ]);
  assert.deepEqual(out, [
    { path: 'a\\b\\c.txt', type: 'other', size: 0 },
    { path: 'x', type: 'file', size: 3 },
  ]);
});

test('serializeEntries rejects malformed input', () => {
  assert.throws(() => serializeEntries('nope'), TypeError);
  assert.throws(() => serializeEntries([null]), TypeError);
  assert.throws(() => serializeEntries([{ path: 1 }]), TypeError);
  assert.throws(() => serializeEntries([{ path: 'a', size: -1 }]), RangeError);
  assert.throws(() => serializeEntries([{ path: 'a', size: Infinity }]), RangeError);
});

test('serializeDirectory output is deterministic across two calls', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'z'));
    mkdirSync(join(dir, 'a'));
    writeFileSync(join(dir, 'z', 'f'), '1');
    writeFileSync(join(dir, 'a', 'g'), '22');
    const first = serializeDirectory(dir);
    const second = serializeDirectory(dir);
    assert.deepEqual(first, second);
  });
});
