export const WORK_TABS_LOCATIONS = ["top", "left", "right"] as const;

export type WorkTabsLocation = (typeof WORK_TABS_LOCATIONS)[number];

export const DEFAULT_WORK_TABS_LOCATION: WorkTabsLocation = "top";

export const isWorkTabsLocation = (value: unknown): value is WorkTabsLocation =>
  typeof value === "string" && (WORK_TABS_LOCATIONS as readonly string[]).includes(value);

export const resolveWorkTabsLocation = (stored: string | null | undefined): WorkTabsLocation =>
  isWorkTabsLocation(stored) ? stored : DEFAULT_WORK_TABS_LOCATION;

export const isSideWorkTabsLocation = (
  location: WorkTabsLocation,
): location is Exclude<WorkTabsLocation, "top"> => location === "left" || location === "right";
