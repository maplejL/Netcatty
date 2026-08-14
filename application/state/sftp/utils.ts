import { SftpFileEntry, TransferTask } from "../../../domain/models";

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "--";
  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

export const formatDate = (timestamp: number): string => {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "--";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const getFileExtension = (name: string): string => {
  if (name === "..") return "folder";
  const ext = name.split(".").pop()?.toLowerCase();
  return ext || "file";
};

// Check if an entry is navigable like a directory (directories or symlinks pointing to directories)
export const isNavigableDirectory = (entry: SftpFileEntry): boolean => {
  return entry.type === "directory" || (entry.type === "symlink" && entry.linkTarget === "directory");
};

// Check if path is Windows-style
export const isWindowsPath = (path: string): boolean => /^[A-Za-z]:/.test(path);

const normalizeWindowsRoot = (path: string): string => {
  const normalized = path.replace(/\//g, "\\");
  if (/^[A-Za-z]:\\$/.test(normalized)) return normalized;
  if (/^[A-Za-z]:$/.test(normalized)) return `${normalized}\\`;
  return normalized;
};

export const isWindowsRoot = (path: string): boolean => {
  if (!isWindowsPath(path)) return false;
  return /^[A-Za-z]:\\?$/.test(path.replace(/\//g, "\\"));
};

export const joinPath = (base: string, name: string): string => {
  if (isWindowsPath(base)) {
    const normalizedBase = normalizeWindowsRoot(base).replace(/[\\/]+$/, "");
    return `${normalizedBase}\\${name}`;
  }
  if (base === "/") return `/${name}`;
  return `${base.replace(/\/+$/, "")}/${name}`;
};

export const getParentPath = (path: string): string => {
  if (isWindowsPath(path)) {
    const normalized = normalizeWindowsRoot(path).replace(/[\\]+$/, "");
    const drive = normalized.slice(0, 2);
    if (/^[A-Za-z]:$/.test(normalized) || /^[A-Za-z]:\\$/.test(normalized)) {
      return `${drive}\\`;
    }
    const rest = normalized.slice(2).replace(/^[\\]+/, "");
    const parts = rest ? rest.split(/[\\]+/).filter(Boolean) : [];
    if (parts.length <= 1) {
      return `${drive}\\`;
    }
    parts.pop();
    const result = `${drive}\\${parts.join("\\")}`;
    return result;
  }
  if (path === "/") {
    return "/";
  }
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  const result = parts.length ? `/${parts.join("/")}` : "/";
  return result;
};

export const isConcreteTransferTargetPath = (task: Pick<TransferTask, "targetPath">): boolean => {
  const targetPath = task.targetPath.trim();
  return targetPath.length > 0 && targetPath !== "(temp)";
};

export const getFileName = (path: string): string => {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || "";
};

export const normalizeSftpPathForCompare = (path: string): string => {
  if (isWindowsRoot(path)) return path.replace(/\//g, "\\").toLowerCase();
  if (/^[A-Za-z]:/.test(path)) {
    return path.replace(/\//g, "\\").replace(/[\\]+$/, "").toLowerCase();
  }
  if (path === "/") return "/";
  return path.replace(/\/+$/, "");
};

export const isSameSftpPath = (a: string, b: string): boolean => {
  return normalizeSftpPathForCompare(a) === normalizeSftpPathForCompare(b);
};

export const isSftpPermissionDeniedError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /permission denied/i.test(message) || /\beacces\b/i.test(message);
};

/**
 * Terminal soft-refresh should re-list the open directory without blocking the
 * pane. When files are already visible for the same path, keep the UI interactive
 * and update the list when the request finishes (or silently keep the old list).
 */
export const shouldUseBackgroundSftpSoftRefresh = (options: {
  soft?: boolean;
  currentPath: string;
  targetPath: string;
  existingFileCount: number;
}): boolean => {
  if (!options.soft) return false;
  if (options.existingFileCount <= 0) return false;
  return isSameSftpPath(options.currentPath, options.targetPath);
};

/**
 * Gate the SFTP sidebar's terminal-driven refresh effect.
 * Refreshing updates `connection` object identity; if the effect depends on
 * that object (or on `loading`), it retriggers forever and React throws #185.
 */
export const shouldApplySftpSoftRefreshRevision = (options: {
  isVisible: boolean;
  revision: number;
  lastHandledRevision: number;
  hasConnection: boolean;
  hasActiveWork: boolean;
}): boolean => {
  if (!options.isVisible || options.hasActiveWork) return false;
  if (!options.hasConnection) return false;
  if (options.revision <= 0) return false;
  return options.revision !== options.lastHandledRevision;
};

export const shouldClearSftpFilterForPathChange = (
  currentPath: string,
  nextPath: string,
): boolean => {
  return !isSameSftpPath(currentPath, nextPath);
};

export const getSftpFilterAfterPathChange = (
  currentPath: string,
  nextPath: string,
  currentFilter: string,
): string => {
  return shouldClearSftpFilterForPathChange(currentPath, nextPath) ? "" : currentFilter;
};

export const getSftpFilterAfterPathChangeError = (
  clearFilterForPathChange: boolean,
  previousFilter: string,
  currentFilter: string,
): string => {
  return clearFilterForPathChange ? previousFilter : currentFilter;
};
