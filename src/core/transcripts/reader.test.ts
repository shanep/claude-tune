import { Buffer } from 'node:buffer';
import { appendFile, rename, symlink, truncate, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IncrementalReader, LineSplitter, readAllLines } from './reader.js';
import { makeTemporaryDirectory, removeDir } from './test-helpers/fixtures.js';

/** Cut a buffer at the given positions. */
function split(data: Buffer, cuts: readonly number[]): Buffer[] {
  const points = [...new Set(cuts.map((cut) => cut % (data.length + 1)))].toSorted((a, b) => a - b);
  const chunks: Buffer[] = [];
  let start = 0;
  for (const point of points) {
    chunks.push(data.subarray(start, point));
    start = point;
  }
  chunks.push(data.subarray(start));
  return chunks;
}

function completeLines(content: string): string[] {
  const parts = content.split('\n');
  parts.pop();
  return parts.map((part) => (part.endsWith('\r') ? part.slice(0, -1) : part));
}

const lineText = fc.string({ unit: fc.constantFrom('a', 'é', '漢', '😀', '\r', ' ', '{', '"') });
const contentArbitrary = fc
  .tuple(fc.array(lineText, { maxLength: 12 }), fc.boolean(), lineText)
  .map(
    ([lines, trailing, tail]) => lines.map((line) => `${line}\n`).join('') + (trailing ? tail : ''),
  );

describe('LineSplitter', () => {
  it('splits complete lines and holds the partial one', () => {
    const splitter = new LineSplitter();
    expect(splitter.push(Buffer.from('one\ntw'))).toStrictEqual(['one']);
    expect(splitter.pendingBytes).toBe(2);
    expect(splitter.push(Buffer.from('o\r\n\nthree'))).toStrictEqual(['two', '']);
    expect(splitter.pendingBytes).toBe(5);
    splitter.reset();
    expect(splitter.pendingBytes).toBe(0);
    expect(splitter.push(Buffer.from('four\n'))).toStrictEqual(['four']);
    expect(splitter.pendingBytes).toBe(0);
  });

  it('only strips a carriage return at the end of a line', () => {
    const splitter = new LineSplitter();
    expect(splitter.push(Buffer.from('a\rb\n\r\n'))).toStrictEqual(['a\rb', '']);
  });

  it('keeps multi-byte characters that span chunks', () => {
    const bytes = Buffer.from('é漢😀\n');
    const splitter = new LineSplitter();
    const lines: string[] = [];
    for (const byte of bytes) {
      lines.push(...splitter.push(Buffer.from([byte])));
    }
    expect(lines).toStrictEqual(['é漢😀']);
  });

  it('does not keep a reference to a reused chunk buffer', () => {
    const splitter = new LineSplitter();
    const chunk = Buffer.from('abc');
    splitter.push(chunk);
    chunk.fill(0x78);
    expect(splitter.push(Buffer.from('\n'))).toStrictEqual(['abc']);
  });

  it('gives the same lines for any chunking', () => {
    fc.assert(
      fc.property(contentArbitrary, fc.array(fc.nat(), { maxLength: 10 }), (content, cuts) => {
        const data = Buffer.from(content);
        const splitter = new LineSplitter();
        const lines = split(data, cuts).flatMap((chunk) => splitter.push(chunk));
        expect(lines).toStrictEqual(completeLines(content));
        const whole = new LineSplitter().push(data);
        expect(lines).toStrictEqual(whole);
      }),
    );
  });
});

describe('IncrementalReader', () => {
  let root = '';
  let file = '';

  beforeEach(async () => {
    root = await makeTemporaryDirectory();
    file = path.join(root, 'session.jsonl');
  });

  afterEach(async () => {
    await removeDir(root);
  });

  it('gives nothing for a missing file and picks it up once it exists', async () => {
    const reader = new IncrementalReader(file);
    expect(reader.filePath).toBe(file);
    expect(await reader.read()).toStrictEqual({ lines: [], reset: false });
    await writeFile(file, 'a\n');
    expect(await reader.read()).toStrictEqual({ lines: ['a'], reset: false });
  });

  it('reads only appended bytes and waits for a partial line', async () => {
    await writeFile(file, 'one\ntw');
    const reader = new IncrementalReader(file);
    expect(await reader.read()).toStrictEqual({ lines: ['one'], reset: false });
    expect(reader.position).toBe(6);
    expect(await reader.read()).toStrictEqual({ lines: [], reset: false });
    await appendFile(file, 'o\nthree\n');
    expect(await reader.read()).toStrictEqual({ lines: ['two', 'three'], reset: false });
    expect(reader.position).toBe(14);
  });

  it('starts over when the file gets shorter', async () => {
    await writeFile(file, 'first\nsecond\npart');
    const reader = new IncrementalReader(file);
    const firstRead = await reader.read();
    expect(firstRead.lines).toStrictEqual(['first', 'second']);
    await truncate(file, 0);
    await appendFile(file, 'new\n');
    expect(await reader.read()).toStrictEqual({ lines: ['new'], reset: true });
    expect(await reader.read()).toStrictEqual({ lines: [], reset: false });
  });

  it('starts over when the file is replaced, even if it is not shorter', async () => {
    await writeFile(file, 'old\n');
    const reader = new IncrementalReader(file);
    const firstRead = await reader.read();
    expect(firstRead.lines).toStrictEqual(['old']);
    const next = path.join(root, 'next.jsonl');
    await writeFile(next, 'replaced\nmore\n');
    await rename(next, file);
    expect(await reader.read()).toStrictEqual({ lines: ['replaced', 'more'], reset: true });
  });

  it('reports a same-size file of the same inode as unchanged', async () => {
    await writeFile(file, 'x\n');
    const reader = new IncrementalReader(file);
    await reader.read();
    expect(await reader.read()).toStrictEqual({ lines: [], reset: false });
  });

  it('reads files larger than one chunk', async () => {
    const line = 'x'.repeat(1000);
    const count = 2600;
    await writeFile(file, `${line}\n`.repeat(count));
    const lines = await readAllLines(file);
    expect(lines).toHaveLength(count);
    expect(lines.every((value) => value === line)).toBe(true);
  });

  it('throws errors other than a missing file', async () => {
    const link = path.join(root, 'loop.jsonl');
    await symlink(link, link);
    await expect(new IncrementalReader(link).read()).rejects.toThrow(/ELOOP/u);
  });

  it('gives the same lines for appends in any chunks as for one read', async () => {
    let run = 0;
    await fc.assert(
      fc.asyncProperty(
        contentArbitrary,
        fc.array(fc.nat(), { maxLength: 6 }),
        async (content, cuts) => {
          run += 1;
          const target = path.join(root, `prop-${String(run)}.jsonl`);
          const data = Buffer.from(content);
          await writeFile(target, '');
          const reader = new IncrementalReader(target);
          const lines: string[] = [];
          for (const chunk of split(data, cuts)) {
            await appendFile(target, chunk);
            const result = await reader.read();
            expect(result.reset).toBe(false);
            lines.push(...result.lines);
          }
          expect(lines).toStrictEqual(await readAllLines(target));
          expect(lines).toStrictEqual(completeLines(content));
        },
      ),
      { numRuns: 40 },
    );
  });
});
