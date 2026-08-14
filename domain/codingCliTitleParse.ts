import type { CodingCliProviderId } from './codingCliProviders';

/** Braille dot-spinner frames used by Codex and several other agent TUIs. */
export const CODING_CLI_BRAILLE_SPINNER_FRAMES = [
  '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏',
] as const;

const BRAILLE_SPINNER_RE = /^[\s⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✳✴✶✻✽❋◆◇]+/u;
const ACTION_REQUIRED_PREFIX_RE = /^\[\s*[!.]\s*\]\s*(?:Action Required\s*)?/iu;
const LEADING_SEPARATOR_RE = /^[\s·•….]+/u;

const CLAUDE_MARKERS = ['claude code', 'claude', 'anthropic'] as const;
const CODEX_STATUS_WORDS = ['working', 'thinking', 'ready', 'waiting'] as const;
const BUSY_STATUS_WORDS = [
  'working',
  'thinking',
  'running',
  'compacting',
  'generating',
  'processing',
  'streaming',
  'searching',
  'planning',
] as const;
const WAITING_STATUS_WORDS = [
  'waiting',
  'permission',
  'approval',
  'confirm',
  'input required',
  'action required',
  'needs input',
  'y/n',
] as const;
const COMPLETED_STATUS_WORDS = [
  'done',
  'complete',
  'completed',
  'finished',
  'success',
  'succeeded',
  'passed',
] as const;
const FAILED_STATUS_WORDS = [
  'error',
  'failed',
  'failure',
  'crash',
  'crashed',
  'aborted',
  'fatal',
] as const;

/**
 * Coding-agent run phase shown on terminal tabs.
 * - idle: agent present, not actively working
 * - busy: running / spinning
 * - waiting: needs user approval or input
 * - completed: finished successfully
 * - failed: error / aborted
 */
export type CodingCliActivityPhase = 'idle' | 'busy' | 'waiting' | 'completed' | 'failed';

/** i18n key suffix under `codingCli.phase.*` */
export function codingCliActivityPhaseI18nKey(
  phase: CodingCliActivityPhase,
): `codingCli.phase.${CodingCliActivityPhase}` {
  return `codingCli.phase.${phase}`;
}

/** Tailwind / CSS class names for the status badge/dot. */
export function codingCliActivityPhaseDotClass(phase: CodingCliActivityPhase): string {
  switch (phase) {
    case 'busy':
      return 'bg-sky-500 coding-cli-status-dot-busy';
    case 'waiting':
      return 'bg-amber-500 coding-cli-status-dot-waiting';
    case 'completed':
      return 'bg-emerald-500';
    case 'failed':
      return 'bg-rose-500';
    case 'idle':
    default:
      return 'bg-slate-400 dark:bg-slate-500';
  }
}

export function normalizeCodingCliTitle(title: string): string {
  let normalized = title.trim().replace(BRAILLE_SPINNER_RE, '').trim();
  normalized = normalized.replace(ACTION_REQUIRED_PREFIX_RE, '').trim();
  normalized = normalized.replace(LEADING_SEPARATOR_RE, '').trim();
  return normalized;
}

export function normalizeCodingCliDynamicTitleForStorage(title: string): string {
  let normalized = title.trim().replace(BRAILLE_SPINNER_RE, '').trim();
  normalized = normalized.replace(LEADING_SEPARATOR_RE, '').trim();
  return normalized;
}

export function titleHasBrailleSpinner(title: string): boolean {
  return CODING_CLI_BRAILLE_SPINNER_FRAMES.some((frame) => title.includes(frame));
}

export function titleIncludesPhrase(title: string, phrase: string): boolean {
  const normalized = title.toLowerCase();
  const needle = phrase.toLowerCase().trim();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(normalized);
}

export function inferCodingCliProviderFromTitleSignals(title: string): CodingCliProviderId | undefined {
  const raw = title.trim();
  if (!raw) return undefined;

  if (titleIncludesPhrase(raw, 'claude code') || raw.includes('✳') || titleIncludesPhrase(raw, 'claude')) {
    return 'claude';
  }
  if (titleIncludesPhrase(raw, 'opencode')) return 'opencode';
  if (titleIncludesPhrase(raw, 'codex') || titleIncludesPhrase(raw, 'chatgpt')) return 'codex';
  if (titleIncludesPhrase(raw, 'github copilot') || titleIncludesPhrase(raw, 'copilot')) return 'copilot';
  if (titleIncludesPhrase(raw, 'codebuddy')) return 'codebuddy';
  if (titleIncludesPhrase(raw, 'gemini')) return 'gemini';
  if (titleIncludesPhrase(raw, 'moonshot') || titleIncludesPhrase(raw, 'kimi')) return 'kimi';
  if (titleIncludesPhrase(raw, 'factory droid') || titleIncludesPhrase(raw, 'factory ai')) return 'droid';
  if (titleIncludesPhrase(raw, 'droid')) return 'droid';
  // Prefer Grok before Cursor: titles like "… - grok" or mixed banners must not
  // be stolen by a bare "cursor" substring (e.g. "Resume Cursor Session … - grok").
  if (titleIncludesPhrase(raw, 'grok build') || titleIncludesPhrase(raw, 'grok')) return 'grok';
  if (titleIncludesPhrase(raw, 'deepseek')) return 'deepseek';
  // Require "cursor agent" — bare "cursor" matches Windows titles / session names.
  if (titleIncludesPhrase(raw, 'cursor agent')) return 'cursor';

  const stripped = normalizeCodingCliTitle(raw).toLowerCase();
  if (
    titleHasBrailleSpinner(raw)
    && CODEX_STATUS_WORDS.some((word) => titleIncludesPhrase(stripped, word))
    && !CLAUDE_MARKERS.some((marker) => titleIncludesPhrase(raw, marker))
  ) {
    return 'codex';
  }

  return undefined;
}

export function resolveCodingCliActivityPhase(
  title: string | undefined,
  providerId?: CodingCliProviderId,
  stickyPhase?: CodingCliActivityPhase | null,
): CodingCliActivityPhase {
  const raw = title?.trim();
  if (!providerId) return stickyPhase || 'idle';
  if (!raw) return stickyPhase || 'idle';

  const normalized = normalizeCodingCliTitle(raw).toLowerCase();

  // Failed / error wins over everything else.
  if (FAILED_STATUS_WORDS.some((word) => titleIncludesPhrase(normalized, word))) {
    return 'failed';
  }

  // Explicit action-required prefixes (Claude etc.) → waiting.
  if (ACTION_REQUIRED_PREFIX_RE.test(raw)) {
    return 'waiting';
  }

  if (WAITING_STATUS_WORDS.some((word) => titleIncludesPhrase(normalized, word))) {
    return 'waiting';
  }

  // Spinners / busy glyphs → running.
  if (titleHasBrailleSpinner(raw) || raw.includes('✳')) {
    return 'busy';
  }

  if (BUSY_STATUS_WORDS.some((word) => titleIncludesPhrase(normalized, word))) {
    return 'busy';
  }

  if (COMPLETED_STATUS_WORDS.some((word) => titleIncludesPhrase(normalized, word))) {
    return 'completed';
  }

  if (providerId === 'codex' && CODEX_STATUS_WORDS.includes(normalized as typeof CODEX_STATUS_WORDS[number])) {
    return normalized === 'ready' ? 'idle' : 'busy';
  }

  // Sticky phases survive quiet titles (Grok rarely puts spinners in OSC titles).
  // Title-derived busy/waiting/failed already returned above when present.
  if (
    stickyPhase === 'completed'
    || stickyPhase === 'failed'
    || stickyPhase === 'busy'
    || stickyPhase === 'waiting'
  ) {
    return stickyPhase;
  }

  return 'idle';
}

/**
 * Infer run phase from recent terminal output.
 * Grok Build (and similar) often keep a static window title while working;
 * stdout lines like "Thought for …" / "command still running" are the real signal.
 */
export function inferCodingCliActivityPhaseFromOutput(
  text: string,
  providerId?: CodingCliProviderId | null,
): CodingCliActivityPhase | null {
  const raw = text
    .replace(/\u001b\[[0-9:;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '');
  if (!raw.trim()) return null;

  // Failed first — "Task failed" / exit codes.
  if (
    /\btask\s+failed\b/i.test(raw)
    || /\bexited?\s+with\s+(?:code\s+)?[1-9]\d*\b/i.test(raw)
    || /\bexit\s+(?:code\s+)?[1-9]\d*\b/i.test(raw)
    || /\bfatal\s+error\b/i.test(raw)
  ) {
    return 'failed';
  }

  // Waiting / approval.
  if (
    /\b(?:waiting\s+for\s+(?:approval|permission|input|user)|action\s+required|needs?\s+your\s+(?:input|approval)|y\/n)\b/i.test(raw)
    || /\[\s*[!.]\s*\]\s*action\s+required/i.test(raw)
  ) {
    return 'waiting';
  }

  // Completed / resume banner (agent finished a turn).
  if (
    /\bresume\s+this\s+session\s+with\b/i.test(raw)
    || /\btask\s+completed\b/i.test(raw)
    || (providerId === 'grok' && /\bgrok\s+(?:-r|--resume)\b/i.test(raw))
  ) {
    return 'completed';
  }

  // Actively running — Grok Build prints these without updating the title.
  if (
    /\b\d+\s+commands?\s+still\s+running\b/i.test(raw)
    || /\bcommand\s+still\s+running\b/i.test(raw)
    || /\bthought\s+for\b/i.test(raw)
    || /\btask\s+started\b/i.test(raw)
    || /\btasks?\s+\d+\b/i.test(raw)
    || /\bworking\s+on\b/i.test(raw)
    || /\bgenerating\b/i.test(raw)
    || /\bcompacting\b/i.test(raw)
    || titleHasBrailleSpinner(raw)
  ) {
    return 'busy';
  }

  return null;
}

const SHELL_TITLE_RE = /^(?:bash|zsh|fish|pwsh|powershell|sh|nu|xonsh|cmd)(?:\s|$|[(@])/i;
const SHELL_PATH_TITLE_RE = /^(?:(?:[^@\s:]+@)?[^:\s]+:)?(?:~(?:\/|$)|\/|[A-Za-z]:[\\/])/;

/** Whether a shell-reported title no longer reflects an active coding CLI session. */
export function shouldClearCodingCliProviderForTitle(
  title: string,
  providerId: CodingCliProviderId,
): boolean {
  const trimmed = title.trim();
  if (!trimmed) return true;

  const inferredId = inferCodingCliProviderFromTitleSignals(trimmed);
  if (inferredId === providerId) return false;
  if (inferredId) return true;
  if (SHELL_TITLE_RE.test(trimmed)) return true;
  if (SHELL_PATH_TITLE_RE.test(trimmed)) return true;

  // Ambiguous titles (e.g. Codex project names) may still be an active agent session.
  return false;
}
