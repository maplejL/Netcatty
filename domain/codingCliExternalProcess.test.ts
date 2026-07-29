import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureExternalCodingCliHistoryInput,
  extractCodingCliCwdFromCommandLine,
  isExternalCodingCliProcessCandidate,
  mapExternalCodingCliProcessesToHistoryInputs,
} from './codingCliExternalProcess';

test('isExternalCodingCliProcessCandidate accepts grok and rejects desktop hosts', () => {
  assert.equal(
    isExternalCodingCliProcessCandidate({
      name: 'grok.exe',
      commandLine: '"C:\\Users\\me\\.grok\\bin\\grok.exe"',
    }),
    true,
  );
  assert.equal(
    isExternalCodingCliProcessCandidate({
      name: 'grok.exe',
      commandLine: '"C:\\Users\\me\\.grok\\bin\\grok.exe" --resume 019fa882-e8ef-7bc3-a866-a1101b4ec075',
    }),
    true,
  );
  assert.equal(
    isExternalCodingCliProcessCandidate({
      name: 'codex.exe',
      commandLine: 'codex.exe -c features.code_mode_host=true app-server',
    }),
    false,
  );
  assert.equal(
    isExternalCodingCliProcessCandidate({
      name: 'codex-code-mode-host.exe',
      commandLine: 'codex-code-mode-host.exe',
    }),
    false,
  );
  assert.equal(
    isExternalCodingCliProcessCandidate({
      name: 'Kimi.exe',
      commandLine: '"C:\\Users\\me\\AppData\\Local\\Programs\\kimi-desktop\\Kimi.exe"',
    }),
    false,
  );
  assert.equal(
    isExternalCodingCliProcessCandidate({
      name: 'Kimi.exe',
      commandLine: 'Kimi.exe --type=gpu-process --user-data-dir=C:\\x',
    }),
    false,
  );
  assert.equal(
    isExternalCodingCliProcessCandidate({
      name: 'cursor.exe',
      commandLine: 'cursor.exe',
    }),
    false,
  );
  assert.equal(
    isExternalCodingCliProcessCandidate({
      name: 'cursor.exe',
      commandLine: 'cursor agent --workspace D:\\work',
    }),
    true,
  );
});

test('extractCodingCliCwdFromCommandLine parses --cwd forms', () => {
  assert.equal(
    extractCodingCliCwdFromCommandLine('grok --cwd D:\\work\\Netcatty --resume abc'),
    'D:\\work\\Netcatty',
  );
  assert.equal(
    extractCodingCliCwdFromCommandLine('grok --cwd="D:\\work\\AI study"'),
    'D:\\work\\AI study',
  );
  assert.equal(extractCodingCliCwdFromCommandLine('grok --resume only'), undefined);
});

test('captureExternalCodingCliHistoryInput builds resume + cwd from process snapshot', () => {
  const input = captureExternalCodingCliHistoryInput({
    pid: 42,
    name: 'grok.exe',
    commandLine: '"C:\\Users\\me\\.grok\\bin\\grok.exe" --resume 019fa882-e8ef-7bc3-a866-a1101b4ec075',
    cwd: 'D:\\work\\通用\\AI学习项目\\aiStudy',
  });
  assert.ok(input);
  assert.equal(input!.providerId, 'grok');
  assert.equal(input!.cwd, 'D:\\work\\通用\\AI学习项目\\aiStudy');
  assert.equal(input!.resumeCommand, 'grok --resume 019fa882-e8ef-7bc3-a866-a1101b4ec075');
  assert.match(input!.title || '', /aiStudy/i);
});

test('captureExternalCodingCliHistoryInput parses resume from quoted grok.exe path', () => {
  const input = captureExternalCodingCliHistoryInput({
    pid: 7,
    name: 'grok.exe',
    commandLine: '"C:\\Users\\admins2604\\.grok\\bin\\grok.exe" --resume 019fa882-e8ef-7bc3-a866-a1101b4ec075',
    cwd: 'D:\\ai\\homepage',
  });
  assert.equal(input?.resumeCommand, 'grok --resume 019fa882-e8ef-7bc3-a866-a1101b4ec075');
  assert.equal(input?.cwd, 'D:\\ai\\homepage');
});

test('mapExternalCodingCliProcessesToHistoryInputs dedupes same provider+cwd', () => {
  const result = mapExternalCodingCliProcessesToHistoryInputs([
    {
      pid: 1,
      name: 'grok.exe',
      commandLine: 'grok.exe',
      cwd: 'D:\\work\\a',
    },
    {
      pid: 2,
      name: 'grok.exe',
      commandLine: 'grok.exe --resume 019fa882-e8ef-7bc3-a866-a1101b4ec075',
      cwd: 'D:\\work\\a',
    },
    {
      pid: 3,
      name: 'grok.exe',
      commandLine: 'grok.exe',
      cwd: 'D:\\work\\b',
    },
  ]);
  assert.equal(result.matchedProcesses, 3);
  assert.equal(result.candidates.length, 2);
  const withResume = result.candidates.find((c) => c.cwd.toLowerCase() === 'd:\\work\\a');
  assert.equal(withResume?.resumeCommand, 'grok --resume 019fa882-e8ef-7bc3-a866-a1101b4ec075');
});

test('mapExternalCodingCliProcessesToHistoryInputs counts skippedNoCwd', () => {
  const result = mapExternalCodingCliProcessesToHistoryInputs([
    {
      pid: 9,
      name: 'grok.exe',
      commandLine: 'grok.exe',
      // no cwd
    },
  ]);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.skippedNoCwd, 1);
});
