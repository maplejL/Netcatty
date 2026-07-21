/**
 * Cursor model selection encoding.
 *
 * Cursor SDK accepts ModelSelection as `{ id, params? }`. Netcatty stores the
 * selection as a single string:
 *   - base:            "gpt-5.5"
 *   - Fast:            "composer-2.5?fast=true"
 *   - effort:          "gpt-5.5?effort=high"
 *   - Fast + effort:   "gpt-5.5?fast=true&effort=high"
 *
 * Codex still uses "id/level" slash encoding — keep that path separate.
 */

export type CursorModelParam = { id: string; value: string };

export type CursorModelSelectionParts = {
  baseId: string;
  /** True when the stored selection includes the model's Fast params. */
  fast: boolean;
  /** Effort / thinking value when present (e.g. "low" | "high"). */
  effort: string | undefined;
  params: CursorModelParam[];
};

export function parseCursorModelId(modelId: string | null | undefined): CursorModelSelectionParts {
  const raw = String(modelId || "").trim();
  if (!raw) return { baseId: "", fast: false, effort: undefined, params: [] };

  const queryIndex = raw.indexOf("?");
  if (queryIndex < 0) {
    return { baseId: raw, fast: false, effort: undefined, params: [] };
  }

  const baseId = raw.slice(0, queryIndex);
  const search = new URLSearchParams(raw.slice(queryIndex + 1));
  const params: CursorModelParam[] = [];
  for (const [id, value] of search.entries()) {
    if (id && value) params.push({ id, value });
  }

  const effort = params.find((p) => p.id === "effort")?.value;
  // Only an explicit fast= param counts as Fast. effort=low is a normal
  // reasoning level and must not light up the Fast toggle (Grok bills
  // combined selections as *-low-fast when both axes are set).
  const fast = params.some((p) => (
    p.id === "fast" && (p.value === "true" || p.value === "1")
  ));

  return { baseId, fast, effort, params };
}

export function encodeCursorModelId(
  baseId: string,
  params: readonly CursorModelParam[] | null | undefined,
): string {
  const id = String(baseId || "").trim();
  if (!id) return "";
  const usable = (params || []).filter((p) => p?.id && p?.value);
  if (usable.length === 0) return id;
  const search = new URLSearchParams();
  for (const param of usable) {
    search.set(param.id, param.value);
  }
  const query = search.toString();
  return query ? `${id}?${query}` : id;
}

export function buildCursorModelParams(options: {
  fast?: boolean;
  effort?: string | null;
  thinkingParamId?: string | null;
  fastParams?: readonly CursorModelParam[] | null;
}): CursorModelParam[] {
  const thinkingParamId = options.thinkingParamId || "effort";
  const params: CursorModelParam[] = [];
  const fastParams = options.fastParams || [];
  const explicitFastParam = fastParams.find((param) => param?.id === "fast");

  if (options.fast && fastParams.length > 0) {
    for (const param of fastParams) {
      if (!param?.id || !param?.value) continue;
      // Skip effort from fastParams when a distinct effort is also chosen —
      // the explicit effort wins.
      if (
        param.id === thinkingParamId
        && options.effort
        && options.effort !== param.value
      ) {
        continue;
      }
      params.push({ id: param.id, value: param.value });
    }
  } else if (explicitFastParam) {
    // Cursor defaults many models (Composer, Grok, …) to the Fast variant when
    // `fast` is omitted. Pin false whenever the catalog exposes a fast axis.
    params.push({ id: "fast", value: "false" });
  }

  if (options.effort) {
    const existing = params.findIndex((p) => p.id === thinkingParamId);
    if (existing >= 0) params[existing] = { id: thinkingParamId, value: options.effort };
    else params.push({ id: thinkingParamId, value: options.effort });
  }

  // De-dupe by id (last wins)
  const byId = new Map<string, string>();
  for (const param of params) byId.set(param.id, param.value);
  return [...byId.entries()].map(([id, value]) => ({ id, value }));
}

export function resolveCursorModelSelection(
  baseId: string,
  options: {
    fast?: boolean;
    effort?: string | null;
    thinkingParamId?: string | null;
    fastParams?: readonly CursorModelParam[] | null;
  },
): string {
  return encodeCursorModelId(baseId, buildCursorModelParams(options));
}

/**
 * True when Fast is driven only by effort=low (no separate fast=true param).
 * Returns false when "low" is also a normal effort choice — those must stay
 * independent so selecting Low does not imply Fast.
 */
export function isEffortOnlyFast(
  fastParams: readonly CursorModelParam[] | null | undefined,
  thinkingParamId = "effort",
  thinkingLevels?: readonly string[] | null,
): boolean {
  if (!fastParams || fastParams.length !== 1) return false;
  const only = fastParams[0];
  if (!(only.id === thinkingParamId && only.value === "low")) return false;
  if (thinkingLevels?.includes("low")) return false;
  return true;
}
