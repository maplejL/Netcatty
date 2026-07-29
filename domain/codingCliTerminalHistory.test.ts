import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addCodingCliHistoryTombstone,
  buildCodingCliHistoryDedupeKey,
  buildCodingCliJumpCommand,
  buildCodingCliJumpPlan,
  buildTombstoneFromEntry,
  captureCodingCliTerminalHistoryInput,
  extractCodingCliResumeCommand,
  extractLocalShellCwdFromOutput,
  filterCodingCliTerminalHistory,
  normalizeCodingCliHistoryCwd,
  resolveCodingCliHistoryJumpStatus,
  resumeCommandMatchesProvider,
  sanitizeCodingCliTerminalHistory,
  upsertCodingCliTerminalHistoryEntry,
  upsertCodingCliTerminalHistoryEntryRespectingTombstones,
} from './codingCliTerminalHistory';

test('normalizeCodingCliHistoryCwd trims and lowercases Windows paths', () => {
  assert.equal(normalizeCodingCliHistoryCwd('  C:\\Work\\Netcatty\\  '), 'c:\\work\\netcatty');
  assert.equal(normalizeCodingCliHistoryCwd('/Users/me/proj/'), '/Users/me/proj');
});

test('upsert merges same cwd + provider and bumps useCount', () => {
  const first = upsertCodingCliTerminalHistoryEntry([], {
    cwd: 'D:\\work\\a',
    providerId: 'claude',
    title: 'Netcatty',
    now: 1000,
  });
  assert.equal(first.length, 1);
  assert.equal(first[0]?.useCount, 1);

  const second = upsertCodingCliTerminalHistoryEntry(first, {
    cwd: 'd:\\work\\a',
    providerId: 'claude',
    title: 'Netcatty refactor',
    now: 2000,
  });
  assert.equal(second.length, 1);
  assert.equal(second[0]?.useCount, 2);
  assert.equal(second[0]?.title, 'Netcatty refactor');
  assert.equal(second[0]?.lastUsedAt, 2000);
});

test('upsert by entryId updates the same row even if cwd differs', () => {
  const first = upsertCodingCliTerminalHistoryEntry([], {
    cwd: 'C:\\Users\\a',
    providerId: 'grok',
    title: 'Grok Build',
    now: 1000,
  });
  const id = first[0]!.id;
  const second = upsertCodingCliTerminalHistoryEntry(first, {
    entryId: id,
    cwd: 'D:\\work\\Netcatty',
    providerId: 'grok',
    now: 2000,
  });
  assert.equal(second.length, 1);
  assert.equal(second[0]?.id, id);
  assert.equal(second[0]?.cwd, 'D:\\work\\Netcatty');
  assert.equal(second[0]?.useCount, 2);
});

test('tombstone blocks resurrection by entryId or provider+cwd', () => {
  const first = upsertCodingCliTerminalHistoryEntry([], {
    cwd: 'D:\\work\\a',
    providerId: 'grok',
    now: 1000,
  });
  const entry = first[0]!;
  const stones = addCodingCliHistoryTombstone([], buildTombstoneFromEntry(entry));

  const byId = upsertCodingCliTerminalHistoryEntryRespectingTombstones(
    [],
    {
      entryId: entry.id,
      cwd: 'D:\\work\\a',
      providerId: 'grok',
      now: 2000,
    },
    stones,
  );
  assert.equal(byId.length, 0);

  const byKey = upsertCodingCliTerminalHistoryEntryRespectingTombstones(
    [],
    {
      cwd: 'D:\\work\\a',
      providerId: 'grok',
      now: 3000,
    },
    stones,
  );
  assert.equal(byKey.length, 0);
});

test('upsert keeps different providers in the same directory separate', () => {
  let entries = upsertCodingCliTerminalHistoryEntry([], {
    cwd: '/home/me/proj',
    providerId: 'claude',
    now: 1,
  });
  entries = upsertCodingCliTerminalHistoryEntry(entries, {
    cwd: '/home/me/proj',
    providerId: 'codex',
    now: 2,
  });
  assert.equal(entries.length, 2);
  assert.notEqual(
    buildCodingCliHistoryDedupeKey('/home/me/proj', 'claude'),
    buildCodingCliHistoryDedupeKey('/home/me/proj', 'codex'),
  );
});

test('captureCodingCliTerminalHistoryInput only accepts local sessions with provider + cwd', () => {
  assert.equal(
    captureCodingCliTerminalHistoryInput({
      protocol: 'ssh',
      codingCliProviderId: 'claude',
      lastCwd: '/tmp',
    }),
    null,
  );
  assert.equal(
    captureCodingCliTerminalHistoryInput({
      protocol: 'local',
      codingCliProviderId: 'claude',
    }),
    null,
  );
  const captured = captureCodingCliTerminalHistoryInput({
    protocol: 'local',
    codingCliProviderId: 'codex',
    localStartDir: 'D:\\work\\Netcatty',
    customName: 'ops',
  });
  assert.equal(captured?.providerId, 'codex');
  assert.equal(captured?.cwd, 'D:\\work\\Netcatty');
  assert.equal(captured?.title, 'ops');

  const withFallback = captureCodingCliTerminalHistoryInput(
    {
      protocol: 'local',
      codingCliProviderId: 'grok',
    },
    null,
    { fallbackLocalCwd: 'C:\\Users\\admins2604' },
  );
  assert.equal(withFallback?.providerId, 'grok');
  assert.equal(withFallback?.cwd, 'C:\\Users\\admins2604');
});

test('sanitize drops unknown providers and bad cwd values', () => {
  const cleaned = sanitizeCodingCliTerminalHistory([
    {
      id: 'ok',
      cwd: '/home/a',
      providerId: 'claude',
      firstSeenAt: 1,
      lastUsedAt: 2,
      useCount: 3,
    },
    {
      id: 'bad-provider',
      cwd: '/home/a',
      providerId: 'not-a-real-cli',
      firstSeenAt: 1,
      lastUsedAt: 2,
      useCount: 1,
    },
    {
      id: 'bad-cwd',
      cwd: 'relative/path',
      providerId: 'claude',
      firstSeenAt: 1,
      lastUsedAt: 2,
      useCount: 1,
    },
  ]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0]?.id, 'ok');
});

test('buildCodingCliJumpPlan tiers: exact > continue > fresh', () => {
  assert.deepEqual(
    buildCodingCliJumpPlan({
      providerId: 'grok',
      cwd: 'D:\\work\\Netcatty',
      resumeCommand: 'grok --resume 019fa8bb-58a6-7a61-94dc-e5c6332c6859',
    }),
    {
      tier: 'exact',
      command: 'grok --cwd D:\\work\\Netcatty --resume 019fa8bb-58a6-7a61-94dc-e5c6332c6859',
    },
  );
  assert.deepEqual(
    buildCodingCliJumpPlan({ providerId: 'claude', cwd: '/repo' }),
    { tier: 'continue', command: 'claude --continue' },
  );
  assert.deepEqual(
    buildCodingCliJumpPlan({ providerId: 'codex', cwd: '/repo' }),
    { tier: 'continue', command: 'codex resume --last' },
  );
  assert.deepEqual(
    buildCodingCliJumpPlan({ providerId: 'grok', cwd: 'D:\\work\\Netcatty' }),
    { tier: 'continue', command: 'grok --cwd D:\\work\\Netcatty --continue' },
  );
  assert.equal(buildCodingCliJumpCommand({ providerId: 'claude' }), 'claude --continue');
  assert.equal(resolveCodingCliHistoryJumpStatus({ providerId: 'grok', cwd: 'C:\\Users\\a' }), 'continue');
  assert.equal(
    resolveCodingCliHistoryJumpStatus({
      providerId: 'grok',
      cwd: 'C:\\Users\\a',
      resumeCommand: 'grok --resume 019fa8bb-58a6-7a61-94dc-e5c6332c6859',
    }),
    'exact',
  );
});

test('extractCodingCliResumeCommand parses grok resume hints', () => {
  assert.equal(
    extractCodingCliResumeCommand(
      'Resume this session with:\n  grok --resume 019fa8bb-58a6-7a61-94dc-e5c6332c6859',
      'grok',
    ),
    'grok --resume 019fa8bb-58a6-7a61-94dc-e5c6332c6859',
  );
  assert.equal(
    extractCodingCliResumeCommand(
      'grok \u001b[33m--resume\u001b[0m 019fa8bb-58a6-7a61-94dc-e5c6332c6859)',
      'grok',
    ),
    'grok --resume 019fa8bb-58a6-7a61-94dc-e5c6332c6859',
  );
  // Trailing "grok" glued to the id must not be kept.
  assert.equal(
    extractCodingCliResumeCommand(
      'grok --resume 019fa882-e8ef-7bc3-a866-a1101b4ec075grok',
      'grok',
    ),
    'grok --resume 019fa882-e8ef-7bc3-a866-a1101b4ec075',
  );
});

test('resumeCommandMatchesProvider blocks cross-CLI bleed', () => {
  assert.equal(
    resumeCommandMatchesProvider('grok --resume 019fa8bb-58a6-7a61-94dc-e5c6332c6859', 'grok'),
    true,
  );
  assert.equal(
    resumeCommandMatchesProvider('grok --resume 019fa8bb-58a6-7a61-94dc-e5c6332c6859', 'cursor'),
    false,
  );
});

test('extractLocalShellCwdFromOutput parses PowerShell prompts', () => {
  assert.equal(
    extractLocalShellCwdFromOutput('PS C:\\Users\\admins2604\\work\\Netcatty> '),
    'C:\\Users\\admins2604\\work\\Netcatty',
  );
  assert.equal(
    extractLocalShellCwdFromOutput('hello\nPS D:\\work\\proj>\ngrok --resume x'),
    'D:\\work\\proj',
  );
  // Must not keep prompt junk glued together.
  assert.equal(
    extractLocalShellCwdFromOutput('C:\\Users\\admins2604> PS C:\\Users\\admins2604>'),
    'C:\\Users\\admins2604',
  );
});

test('filterCodingCliTerminalHistory supports provider and free-text search', () => {
  const entries = sanitizeCodingCliTerminalHistory([
    {
      id: '1',
      cwd: 'D:\\work\\Netcatty',
      providerId: 'claude',
      title: 'feature branch',
      firstSeenAt: 1,
      lastUsedAt: 3,
      useCount: 1,
    },
    {
      id: '2',
      cwd: 'D:\\work\\other',
      providerId: 'codex',
      firstSeenAt: 1,
      lastUsedAt: 2,
      useCount: 1,
    },
  ]);

  assert.equal(filterCodingCliTerminalHistory(entries, { providerId: 'claude' }).length, 1);
  assert.equal(filterCodingCliTerminalHistory(entries, { query: 'netcatty' }).length, 1);
  assert.equal(filterCodingCliTerminalHistory(entries, { query: 'codex' }).length, 1);
});
