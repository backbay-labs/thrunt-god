/** Possible hunt artifact marker files (checked in order) */
export const HUNT_MARKERS = [
  '.hunt/MISSION.md',
  '.planning/MISSION.md',
] as const;

/** Hunt artifact directory names (without MISSION.md) */
export const HUNT_DIRS = ['.hunt', '.planning'] as const;

/** Extension output channel name */
export const OUTPUT_CHANNEL_NAME = 'THRUNT God';

/** Command ID prefix */
export const COMMAND_PREFIX = 'thrunt-god';
