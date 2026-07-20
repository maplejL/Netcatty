/**
 * Typed re-export of the fork release source.
 * Keep values in sync with `releaseSource.cjs` (canonical for electron-builder).
 */
export const RELEASE_GITHUB_OWNER = 'maplejL' as const;
export const RELEASE_GITHUB_REPO = 'Netcatty' as const;

export const RELEASE_REPO_URL =
  `https://github.com/${RELEASE_GITHUB_OWNER}/${RELEASE_GITHUB_REPO}` as const;

export const RELEASES_PAGE_URL = `${RELEASE_REPO_URL}/releases` as const;

export const GITHUB_LATEST_RELEASE_API_URL =
  `https://api.github.com/repos/${RELEASE_GITHUB_OWNER}/${RELEASE_GITHUB_REPO}/releases/latest` as const;
