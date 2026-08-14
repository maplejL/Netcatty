import { useCallback } from "react";
import { netcattyBridge } from "../../../infrastructure/services/netcattyBridge";
import type { SftpFileEntry, SftpFilenameEncoding } from "../../../domain/models";
import { buildMockLocalFiles } from "./mockLocalFiles";
import { formatFileSize, formatDate } from "./utils";

/** Renderer safety net: clear loading even if main-process list hangs past channel timeouts. */
const LIST_REMOTE_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const useSftpDirectoryListing = () => {
  const getMockLocalFiles = useCallback((path: string): SftpFileEntry[] => {
    return buildMockLocalFiles(path);
  }, []);

  const listLocalFiles = useCallback(
    async (path: string): Promise<SftpFileEntry[]> => {
      const rawFiles = await netcattyBridge.get()?.listLocalDir?.(path);
      if (!rawFiles) {
        return getMockLocalFiles(path);
      }

      return rawFiles.map((f) => {
        const size = parseInt(f.size) || 0;
        const lastModified = new Date(f.lastModified).getTime();
        return {
          name: f.name,
          type: f.type as "file" | "directory" | "symlink",
          size,
          sizeFormatted: formatFileSize(size),
          lastModified,
          lastModifiedFormatted: formatDate(lastModified),
          linkTarget: f.linkTarget as "file" | "directory" | null | undefined,
          hidden: f.hidden,
        };
      });
    },
    [getMockLocalFiles],
  );

  const listRemoteFiles = useCallback(
    async (sftpId: string, path: string, encoding?: SftpFilenameEncoding): Promise<SftpFileEntry[]> => {
      const bridge = netcattyBridge.get();
      if (!bridge?.listSftp) return [];

      const rawFiles = await withTimeout(
        bridge.listSftp(sftpId, path, encoding),
        LIST_REMOTE_TIMEOUT_MS,
        `SFTP list timed out after ${LIST_REMOTE_TIMEOUT_MS}ms`,
      );
      if (!rawFiles) return [];

      return rawFiles.map((f) => {
        const size = parseInt(f.size) || 0;
        const lastModified = new Date(f.lastModified).getTime();
        return {
          name: f.name,
          type: f.type as "file" | "directory" | "symlink",
          size,
          sizeFormatted: formatFileSize(size),
          lastModified,
          lastModifiedFormatted: formatDate(lastModified),
          permissions: f.permissions,
          linkTarget: f.linkTarget as "file" | "directory" | null | undefined,
        };
      });
    },
    [],
  );

  return {
    listLocalFiles,
    listRemoteFiles,
  };
};
