import type { DiscoveredAgent, ExternalAgentConfig } from './types';
import { getCommandBasename, isPathLikeCommand } from './shared/pathLikeCommand';

export { isPathLikeCommand, getCommandBasename };

export type ManagedAgentKey =
  | 'codex'
  | 'claude'
  | 'copilot'
  | 'cursor'
  | 'codebuddy'
  | 'workbuddy'
  | 'opencode';

const MANAGED_AGENT_META: Record<ManagedAgentKey, { commandNames: string[]; sdkBackend: string }> = {
  codex: { commandNames: ['codex'], sdkBackend: 'codex' },
  claude: { commandNames: ['claude'], sdkBackend: 'claude' },
  copilot: { commandNames: ['copilot'], sdkBackend: 'copilot' },
  cursor: { commandNames: ['cursor'], sdkBackend: 'cursor' },
  codebuddy: { commandNames: ['codebuddy'], sdkBackend: 'codebuddy' },
  // WorkBuddy desktop embeds the CodeBuddy CLI as `bin/codebuddy` (not workbuddy.exe).
  workbuddy: { commandNames: ['workbuddy'], sdkBackend: 'workbuddy' },
  opencode: { commandNames: ['opencode'], sdkBackend: 'opencode' },
};

function matchesPrimaryCliBasename(command: string | undefined, agentKey: ManagedAgentKey): boolean {
  const basename = getCommandBasename(command);
  return basename === agentKey || basename.startsWith(`${agentKey}.`);
}

export function isSettingsManagedDiscoveredAgent(
  agent: Pick<DiscoveredAgent, 'command'>,
): agent is Pick<DiscoveredAgent, 'command'> & { command: ManagedAgentKey } {
  return agent.command === 'codex'
    || agent.command === 'claude'
    || agent.command === 'copilot'
    || agent.command === 'cursor'
    || agent.command === 'codebuddy'
    || agent.command === 'workbuddy'
    || agent.command === 'opencode';
}

export function matchesManagedAgentConfig(
  agent: Pick<ExternalAgentConfig, 'id' | 'command' | 'sdkBackend' | 'acpCommand'>,
  agentKey: ManagedAgentKey,
): boolean {
  const meta = MANAGED_AGENT_META[agentKey];
  const basename = getCommandBasename(agent.command);
  if (agentKey === 'claude') {
    return (
      agent.id === 'discovered_claude' ||
      basename === 'claude' ||
      basename.startsWith('claude.')
    );
  }
  return (
    agent.id === `discovered_${agentKey}` ||
    getExternalAgentSdkBackend(agent) === meta.sdkBackend ||
    meta.commandNames.some((commandName) => basename === commandName || basename.startsWith(`${commandName}.`))
  );
}

export function getExternalAgentSdkBackend(
  agent: Pick<ExternalAgentConfig, 'sdkBackend' | 'acpCommand'> | undefined,
): string | undefined {
  return agent?.sdkBackend || agent?.acpCommand || undefined;
}

export function getManagedAgentStoredPath(
  agents: ExternalAgentConfig[],
  agentKey: ManagedAgentKey,
): string | null {
  const managedId = `discovered_${agentKey}`;
  // WorkBuddy's real agent entry is the embedded CodeBuddy CLI (`.../bin/codebuddy`),
  // so basename matching on "workbuddy" would reject valid paths.
  const basenameOk = (command: string | undefined) => (
    agentKey === 'workbuddy'
      ? isPathLikeCommand(command)
      : matchesPrimaryCliBasename(command, agentKey)
  );

  const preferredAgent = agents.find(
    (agent) =>
      agent.id === managedId &&
      isPathLikeCommand(agent.command) &&
      basenameOk(agent.command),
  );
  if (preferredAgent) {
    return preferredAgent.command;
  }

  const fallbackAgent = agents.find(
    (agent) =>
      matchesManagedAgentConfig(agent, agentKey) &&
      isPathLikeCommand(agent.command) &&
      basenameOk(agent.command),
  );
  return fallbackAgent?.command ?? null;
}

export function getManualAgentCommand(
  config: Pick<ExternalAgentConfig, 'command' | 'commandSource'> | null | undefined,
): string | undefined {
  const command = String(config?.command || '').trim();
  return config?.commandSource === 'manual' && command ? command : undefined;
}

/** CLI path for SDK turns: explicit manual path, or auto-discovered path-like command. */
export function getSdkAgentCommand(
  config: Pick<ExternalAgentConfig, 'command' | 'commandSource'> | null | undefined,
): string | undefined {
  const manual = getManualAgentCommand(config);
  if (manual) return manual;
  const command = String(config?.command || '').trim();
  return isPathLikeCommand(command) ? command : undefined;
}
