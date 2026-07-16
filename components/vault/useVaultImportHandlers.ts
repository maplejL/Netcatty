import { useCallback } from "react";

import { sanitizeHost } from "../../domain/host";
import { readTextFile } from "../../lib/readTextFile";
import {
  applyVaultHostImport,
  importVaultHostsFromText,
  type VaultImportFormat,
} from "../../domain/vaultImport";
import { buildVaultHostMergeKey } from "../../domain/vaultHostCreate";
import { prepareFinalShellImportFiles } from "../../infrastructure/finalshellImport";
import type { Host, ManagedSource, SSHKey } from "../../types";
import type { ImportOptions } from "./ImportVaultDialog";
import { toast } from "../ui/toast";

interface UseVaultImportHandlersOptions {
  customGroups: string[];
  hosts: Host[];
  managedSources: ManagedSource[];
  onUpdateCustomGroups: (groups: string[]) => void;
  onUpdateHosts: (hosts: Host[]) => void;
  onUpdateManagedSources: (sources: ManagedSource[]) => void;
  importOrReuseKey: (draft: Partial<SSHKey>) => SSHKey;
  setIsImportOpen: (open: boolean) => void;
  t: (key: string, values?: Record<string, unknown>) => string;
}

function attachImportedKeys(
  hosts: Host[],
  keyAttachments: Array<{ hostKey: string; label: string; privateKeyPem: string }>,
  importOrReuseKey: (draft: Partial<SSHKey>) => SSHKey,
): Host[] {
  if (keyAttachments.length === 0) {
    return hosts;
  }

  const attachmentByHostKey = new Map(
    keyAttachments.map((entry) => [entry.hostKey, entry]),
  );

  return hosts.map((host) => {
    const attachment = attachmentByHostKey.get(buildVaultHostMergeKey(host));
    if (!attachment) {
      return host;
    }
    const key = importOrReuseKey({
      label: attachment.label,
      privateKey: attachment.privateKeyPem,
      source: "imported",
      category: "key",
    });
    return { ...host, keyId: key.id };
  });
}

export function useVaultImportHandlers({
  customGroups,
  hosts,
  managedSources,
  onUpdateCustomGroups,
  onUpdateHosts,
  onUpdateManagedSources,
  importOrReuseKey,
  setIsImportOpen,
  t,
}: UseVaultImportHandlersOptions) {
  const handleImportFilesSelected = useCallback(
    async (format: VaultImportFormat, files: File[], options?: ImportOptions) => {
      if (files.length === 0) {
        return;
      }

      setIsImportOpen(false);

      try {
        const formatLabel =
          format === "putty"
            ? "PuTTY"
            : format === "mobaxterm"
              ? "MobaXterm"
              : format === "csv"
                ? "CSV"
                : format === "securecrt"
                  ? "SecureCRT"
                  : format === "finalshell"
                    ? "FinalShell"
                    : "ssh_config";

        toast.info(t("vault.import.toast.start", { format: formatLabel }));

        const rawFiles = await Promise.all(
          files.map(async (file) => ({
            fileName: file.name,
            text: await readTextFile(file),
          })),
        );

        const finalshellFiles =
          format === "finalshell"
            ? await prepareFinalShellImportFiles(rawFiles)
            : undefined;

        const primaryFile = files[0];
        const result = importVaultHostsFromText(format, rawFiles[0]?.text ?? "", {
          fileName: primaryFile?.name,
          finalshellFiles,
        });

        const importedHosts = attachImportedKeys(
          result.hosts,
          result.keyAttachments ?? [],
          importOrReuseKey,
        );
        const importResult = { ...result, hosts: importedHosts };

        const isManaged = format === "ssh_config" && options?.managed === true;
        const fileBaseName = primaryFile.name.replace(/\.[^/.]+$/, "");

        let managedGroupName = `${fileBaseName} - Managed`;
        if (isManaged) {
          const existingGroupNames = new Set([
            ...managedSources.map((s) => s.groupName),
            ...customGroups,
            ...hosts.map((h) => h.group).filter((g): g is string => !!g),
          ]);
          let suffix = 1;
          while (existingGroupNames.has(managedGroupName)) {
            managedGroupName = `${fileBaseName} - Managed (${suffix})`;
            suffix += 1;
          }
        }

        const bridge = (window as unknown as {
          netcatty?: { getPathForFile?: (file: File) => string | undefined };
        }).netcatty;
        const filePath =
          bridge?.getPathForFile?.(primaryFile)
          || (primaryFile as File & { path?: string }).path;

        if (isManaged && !filePath) {
          toast.error(
            t("vault.import.sshConfig.noFilePathDesc"),
            t("vault.import.sshConfig.noFilePath"),
          );
          return;
        }

        if (isManaged) {
          const existingSource = managedSources.find((s) => s.filePath === filePath);
          if (existingSource) {
            toast.error(
              t("vault.import.sshConfig.alreadyManagedDesc", { group: existingSource.groupName }),
              t("vault.import.sshConfig.alreadyManaged"),
            );
            return;
          }
        }

        const makeKey = (h: Host) =>
          `${(h.protocol ?? "ssh").toLowerCase()}|${h.hostname.toLowerCase()}|${h.port}|${(h.username ?? "").toLowerCase()}`;

        const existingKeys = new Set(hosts.map(makeKey));
        let newHosts = importResult.hosts.filter((h) => !existingKeys.has(makeKey(h)));

        let updatedExistingHosts: Host[] = [];
        if (isManaged) {
          const importedKeys = new Set(importResult.hosts.map(makeKey));
          updatedExistingHosts = hosts.filter((h) => importedKeys.has(makeKey(h)));
        }

        if (isManaged && (newHosts.length > 0 || updatedExistingHosts.length > 0)) {
          const sourceId = crypto.randomUUID();
          const newSource: ManagedSource = {
            id: sourceId,
            type: "ssh_config",
            filePath: filePath!,
            groupName: managedGroupName,
            lastSyncedAt: Date.now(),
          };

          newHosts = newHosts.map((h) => ({
            ...h,
            group: managedGroupName,
            managedSourceId: (!h.protocol || h.protocol === "ssh") ? sourceId : undefined,
          }));

          const existingHostIds = new Set(updatedExistingHosts.map((h) => h.id));
          const updatedHosts = hosts.map((h) => {
            if (!existingHostIds.has(h.id)) return h;
            const canBeManaged = !h.protocol || h.protocol === "ssh";
            return {
              ...h,
              group: managedGroupName,
              managedSourceId: canBeManaged ? sourceId : undefined,
              label: canBeManaged && h.label ? h.label.replace(/\s/g, "") : h.label,
            };
          });

          onUpdateManagedSources([...managedSources, newSource]);
          onUpdateHosts([...updatedHosts, ...newHosts].map(sanitizeHost));
        } else if (newHosts.length > 0) {
          const merged = applyVaultHostImport(hosts, customGroups, importResult, { skipDuplicates: true });
          onUpdateHosts(merged.hosts);
          onUpdateCustomGroups(merged.customGroups);
        }

        const totalAffected = newHosts.length + (isManaged ? updatedExistingHosts.length : 0);
        const skipped = result.stats.skipped;
        const duplicates = result.stats.duplicates;
        const hasWarnings = skipped > 0 || duplicates > 0 || result.issues.length > 0;

        if (result.stats.parsed === 0 && totalAffected === 0) {
          toast.error(
            t("vault.import.toast.noEntries", { format: formatLabel }),
            t("vault.import.toast.failedTitle"),
          );
          return;
        }

        if (totalAffected === 0) {
          toast.warning(
            t("vault.import.toast.noNewHosts", { format: formatLabel }),
            t("vault.import.toast.completedTitle"),
          );
          return;
        }

        if (isManaged) {
          toast.success(
            t("vault.import.sshConfig.managedSuccess", { count: totalAffected }),
            t("vault.import.toast.completedTitle"),
          );
        } else {
          const details = t("vault.import.toast.summary", {
            count: totalAffected,
            skipped,
            duplicates,
          });

          if (hasWarnings) {
            const firstIssue = result.issues[0]?.message;
            toast.warning(
              firstIssue ? `${details} ${t("vault.import.toast.firstIssue", { issue: firstIssue })}` : details,
              t("vault.import.toast.completedTitle"),
            );
          } else {
            toast.success(details, t("vault.import.toast.completedTitle"));
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("common.unknownError");
        toast.error(message, t("vault.import.toast.failedTitle"));
      }
    },
    [
      customGroups,
      hosts,
      managedSources,
      importOrReuseKey,
      onUpdateCustomGroups,
      onUpdateHosts,
      onUpdateManagedSources,
      setIsImportOpen,
      t,
    ],
  );

  return { handleImportFilesSelected };
}
