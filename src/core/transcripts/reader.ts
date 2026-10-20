// Reads only what was appended to a JSONL file since the last call. A partial
// last line waits in a buffer until its newline arrives. When the file gets
// shorter or is replaced (new inode), reading starts again from byte 0.

import { Buffer } from 'node:buffer';
import { open, stat } from 'node:fs/promises';

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const CHUNK_BYTES = 1024 * 1024;

function decodeLine(bytes: Buffer): string {
  const trimmed = bytes.at(-1) === CARRIAGE_RETURN ? bytes.subarray(0, -1) : bytes;
  return trimmed.toString('utf8');
}

/** Splits a byte stream into lines. Works on bytes so a multi-byte character can span chunks. */
export class LineSplitter {
  private pending: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): string[] {
    const data = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    const lines: string[] = [];
    let start = 0;
    let end = data.indexOf(NEWLINE, start);
    while (end !== -1) {
      lines.push(decodeLine(data.subarray(start, end)));
      start = end + 1;
      end = data.indexOf(NEWLINE, start);
    }
    this.pending = Buffer.from(data.subarray(start));
    return lines;
  }

  /** Bytes held back because their line has no newline yet. */
  get pendingBytes(): number {
    return this.pending.length;
  }

  reset(): void {
    this.pending = Buffer.alloc(0);
  }
}

export interface ReadResult {
  readonly lines: string[];
  /** True when the file shrank or was replaced, so earlier lines no longer apply. */
  readonly reset: boolean;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export class IncrementalReader {
  private offset = 0;
  private inode: number | null = null;
  private readonly splitter = new LineSplitter();

  constructor(readonly filePath: string) {}

  /** Byte offset of the next read. */
  get position(): number {
    return this.offset;
  }

  /** New complete lines since the last call. A missing file gives no lines. */
  async read(): Promise<ReadResult> {
    let size: number;
    let inode: number;
    try {
      const info = await stat(this.filePath);
      size = info.size;
      inode = info.ino;
    } catch (error: unknown) {
      if (isMissing(error)) {
        return { lines: [], reset: false };
      }
      throw error;
    }
    const replaced = this.inode !== null && inode !== this.inode;
    const reset = replaced || size < this.offset;
    if (reset) {
      this.offset = 0;
      this.splitter.reset();
    }
    this.inode = inode;
    const lines = size > this.offset ? await this.readRange(size) : [];
    return { lines, reset };
  }

  private async readRange(size: number): Promise<string[]> {
    const handle = await open(this.filePath, 'r');
    try {
      const lines: string[] = [];
      const buffer = Buffer.alloc(Math.min(CHUNK_BYTES, size - this.offset));
      // A read of 0 bytes means the file shrank under us; the next call resets.
      let bytesRead = 1;
      while (this.offset < size && bytesRead > 0) {
        const length = Math.min(buffer.length, size - this.offset);
        ({ bytesRead } = await handle.read(buffer, 0, length, this.offset));
        this.offset += bytesRead;
        for (const line of this.splitter.push(buffer.subarray(0, bytesRead))) {
          lines.push(line);
        }
      }
      return lines;
    } finally {
      await handle.close();
    }
  }
}

/** Every complete line of a file, read once from the start. */
export async function readAllLines(filePath: string): Promise<string[]> {
  const result = await new IncrementalReader(filePath).read();
  return result.lines;
}
