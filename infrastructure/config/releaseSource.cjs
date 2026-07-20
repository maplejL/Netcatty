/**
 * Single source of truth for this fork's GitHub release feed.
 * Used by:
 * - electron-builder `publish` (electron-updater feed / app-update.yml)
 * - renderer update check (GitHub API banner)
 * - Settings "Open releases" / repo links
 *
 * Change owner/repo here when pointing Netcatty at a different release repo.
 */
const RELEASE_GITHUB_OWNER = "maplejL";
const RELEASE_GITHUB_REPO = "Netcatty";

const RELEASE_REPO_URL = `https://github.com/${RELEASE_GITHUB_OWNER}/${RELEASE_GITHUB_REPO}`;
const RELEASES_PAGE_URL = `${RELEASE_REPO_URL}/releases`;
const GITHUB_LATEST_RELEASE_API_URL =
  `https://api.github.com/repos/${RELEASE_GITHUB_OWNER}/${RELEASE_GITHUB_REPO}/releases/latest`;

module.exports = {
  RELEASE_GITHUB_OWNER,
  RELEASE_GITHUB_REPO,
  RELEASE_REPO_URL,
  RELEASES_PAGE_URL,
  GITHUB_LATEST_RELEASE_API_URL,
};
