import { describe, expect, it } from 'vitest';

import {
  attachmentPiece,
  callDetail,
  filesIn,
  oneLine,
  resultSource,
  textLength,
  textPiece,
} from './pieces.js';

// cspell:words cdcat toolongext

describe('oneLine', () => {
  it('flattens whitespace and cuts at 100 characters', () => {
    expect(oneLine('  a\n\tb  ')).toBe('a b');
    expect(oneLine('x'.repeat(100))).toBe('x'.repeat(100));
    expect(oneLine('x'.repeat(101))).toBe(`${'x'.repeat(97)}...`);
  });
});

describe('textLength', () => {
  it('counts a string, the text of each part, and nothing else', () => {
    expect(textLength('abc')).toBe(3);
    expect(textLength(['ab', { text: 'cde' }, { type: 'image' }, 7])).toBe(5);
    expect(textLength({ text: 'abc' })).toBe(0);
    expect(textLength(null)).toBe(0);
  });
});

describe('resultSource', () => {
  it('counts Read and shell commands that print files as file reads', () => {
    for (const command of [
      'cat a.ts',
      'head -50 a.ts',
      'tail a.log',
      'nl a.ts',
      'less a.ts',
      'bat a.ts',
      'sed -n 1,20p a.ts',
      '  cat a.ts',
      'cd /repo && cat a.ts',
      'cd /repo &&cat a.ts',
      'cd /repo;cat a.ts',
      'cd /repo; cat a.ts && ls',
      'cd /repo && cat a.ts; ls',
    ]) {
      expect([command, resultSource('Bash', command)]).toStrictEqual([command, 'fileReads']);
    }
    expect(resultSource('Read', '')).toBe('fileReads');
  });

  it('leaves other commands as command output', () => {
    for (const command of [
      'sed s/a/b/ a.ts',
      'cd /repo',
      'cd /repo && npm test',
      'ls',
      '',
      'cdcat a.ts',
    ]) {
      expect([command, resultSource('Bash', command)]).toStrictEqual([command, 'toolOutput']);
    }
    expect(resultSource('Grep', 'cat')).toBe('toolOutput');
  });

  it('sorts subagents and the web into their own sources', () => {
    expect(resultSource('Agent', '')).toBe('subagentReports');
    expect(resultSource('Task', '')).toBe('subagentReports');
    expect(resultSource('WebFetch', '')).toBe('web');
    expect(resultSource('WebSearch', '')).toBe('web');
    expect(resultSource('mcp__docs__read', '')).toBe('web');
    expect(resultSource('Mcp__docs', '')).toBe('toolOutput');
  });
});

describe('filesIn', () => {
  it('finds the words that look like file paths', () => {
    expect(
      filesIn(
        `cat src/app.ts "b.tsx" 'c.md'; head -5 ./d.config.json|grep x >out.txt (e.py) \`f.go\` && g.rs`,
      ),
    ).toStrictEqual([
      'src/app.ts',
      'b.tsx',
      'c.md',
      './d.config.json',
      'out.txt',
      'e.py',
      'f.go',
      'g.rs',
    ]);
  });

  it('skips flags, folders with dots, numbers and odd extensions', () => {
    expect(filesIn('.hidden a.b/c v1.2 x.toolongext y.1z ~/n.md a$b.ts')).toStrictEqual(['~/n.md']);
  });
});

describe('callDetail', () => {
  it('takes the first field that names what the call is about', () => {
    expect(callDetail({ file_path: 'a.ts', command: 'ls' })).toBe('a.ts');
    expect(callDetail({ command: 'ls', pattern: 'x' })).toBe('ls');
    expect(callDetail({ pattern: 'x', url: 'u' })).toBe('x');
    expect(callDetail({ url: 'u', query: 'q' })).toBe('u');
    expect(callDetail({ query: 'q', skill: 's' })).toBe('q');
    expect(callDetail({ skill: 's', description: 'd' })).toBe('s');
    expect(callDetail({ description: 'd' })).toBe('d');
    expect(callDetail({ file_path: 3, other: 'x' })).toBe('');
    expect(callDetail('a.ts')).toBe('');
  });
});

describe('textPiece', () => {
  it('names a loaded skill by its folder', () => {
    const text = 'Base directory for this skill:   /home/me/skills/voice\n\nBody';
    expect(textPiece(text, true)).toStrictEqual({
      source: 'skills',
      label: 'skill voice',
      chars: text.length,
      file: null,
      skill: '/home/me/skills/voice',
    });
  });

  it('knows CLAUDE.md, reminders and prompts', () => {
    const memory = '<system-reminder>Contents of /home/me/CLAUDE.md</system-reminder>';
    expect(textPiece(memory, true)).toStrictEqual({
      source: 'instructions',
      label: 'CLAUDE.md',
      chars: memory.length,
      file: null,
      skill: null,
    });
    expect(textPiece('<system-reminder>other</system-reminder>', true)).toStrictEqual({
      source: 'reminders',
      label: 'reminder',
      chars: 40,
      file: null,
      skill: null,
    });
    expect(textPiece('Contents of x', false)).toStrictEqual({
      source: 'conversation',
      label: 'prompt',
      chars: 13,
      file: null,
      skill: null,
    });
  });
});

describe('attachmentPiece', () => {
  it('sizes an attachment from what it rendered and sorts it by type', () => {
    expect(
      attachmentPiece({
        attachment: { type: 'nested_memory' },
        rendered: [{ content: 'abc' }, { content: 'de' }, { other: 1 }],
      }),
    ).toStrictEqual({
      source: 'instructions',
      label: 'nested memory',
      chars: 5,
      file: null,
      skill: null,
    });
    for (const [type, source] of [
      ['instructions', 'instructions'],
      ['memory', 'instructions'],
      ['claude_md', 'instructions'],
      ['relevant_memories', 'instructions'],
      ['skill_listing', 'skills'],
      ['invoked_skills', 'skills'],
      ['todo', 'reminders'],
    ] as const) {
      expect([
        type,
        attachmentPiece({ attachment: { type }, rendered: [{ content: 'x' }] }).source,
      ]).toStrictEqual([type, source]);
    }
  });

  it('keeps the file a changed-file attachment names', () => {
    expect(
      attachmentPiece({
        attachment: { type: 'edited_text_file', filename: '/r/a.ts' },
        rendered: [{ content: 'xy' }],
      }),
    ).toStrictEqual({
      source: 'fileReads',
      label: 'edited text file',
      chars: 2,
      file: '/r/a.ts',
      skill: null,
    });
    expect(attachmentPiece({ attachment: { type: 'file', filename: '/r/b.ts' } }).file).toBe(
      '/r/b.ts',
    );
    expect(attachmentPiece({ attachment: { type: 'todo', filename: '/r/c.ts' } }).file).toBeNull();
  });

  it('falls back to the hook text and labels hooks by name', () => {
    expect(
      attachmentPiece({
        attachment: {
          type: 'hook_additional_context',
          content: ['abc', 'd'],
          hookName: 'SessionStart:startup',
        },
      }),
    ).toStrictEqual({
      source: 'reminders',
      label: 'SessionStart:startup',
      chars: 4,
      file: null,
      skill: null,
    });
    expect(
      attachmentPiece({
        attachment: { type: 'hook_additional_context', content: ['abc'] },
        rendered: [{ content: 'x' }],
      }).chars,
    ).toBe(1);
    expect(attachmentPiece({ attachment: { type: 'other', content: ['abc'] } }).chars).toBe(0);
    expect(attachmentPiece({})).toStrictEqual({
      source: 'reminders',
      label: 'attachment',
      chars: 0,
      file: null,
      skill: null,
    });
  });
});
