import type {
  ResolvedDownloadPlatform,
  VideoDownloadProfile,
} from "./video-download-command";

export type DownloadPlatformPreference =
  | "auto"
  | Exclude<ResolvedDownloadPlatform, "unknown">;

export interface DownloadSettings {
  profile: VideoDownloadProfile;
  platform: DownloadPlatformPreference;
}

interface StoredDownloadSettings extends DownloadSettings {
  version: 1;
}

export interface PlatformDetectionHints {
  userAgentDataPlatform?: string | null;
  navigatorPlatform?: string | null;
  userAgent?: string | null;
  maxTouchPoints?: number;
}

export const DOWNLOAD_SETTINGS_STORAGE_KEY = "vods.download-settings.v1";

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  profile: "editing-mp4",
  platform: "auto",
};

const DOWNLOAD_PROFILES: readonly VideoDownloadProfile[] = [
  "editing-mp4",
  "quality-webm",
  "precise-reencode",
];

const PLATFORM_PREFERENCES: readonly DownloadPlatformPreference[] = [
  "auto",
  "windows",
  "macos",
  "linux",
];

function isDownloadProfile(value: unknown): value is VideoDownloadProfile {
  return DOWNLOAD_PROFILES.includes(value as VideoDownloadProfile);
}

function isPlatformPreference(
  value: unknown,
): value is DownloadPlatformPreference {
  return PLATFORM_PREFERENCES.includes(value as DownloadPlatformPreference);
}

export function parseDownloadSettings(value: string | null): DownloadSettings {
  if (!value) return { ...DEFAULT_DOWNLOAD_SETTINGS };

  try {
    const parsed = JSON.parse(value) as Partial<StoredDownloadSettings>;
    if (
      parsed.version !== 1 ||
      !isDownloadProfile(parsed.profile) ||
      !isPlatformPreference(parsed.platform)
    ) {
      return { ...DEFAULT_DOWNLOAD_SETTINGS };
    }
    return { profile: parsed.profile, platform: parsed.platform };
  } catch {
    return { ...DEFAULT_DOWNLOAD_SETTINGS };
  }
}

export function loadDownloadSettings(
  storage: Pick<Storage, "getItem"> | null,
): DownloadSettings {
  if (!storage) return { ...DEFAULT_DOWNLOAD_SETTINGS };
  try {
    return parseDownloadSettings(storage.getItem(DOWNLOAD_SETTINGS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_DOWNLOAD_SETTINGS };
  }
}

export function saveDownloadSettings(
  storage: Pick<Storage, "setItem"> | null,
  settings: DownloadSettings,
): boolean {
  if (!storage) return false;
  try {
    const value: StoredDownloadSettings = { version: 1, ...settings };
    storage.setItem(DOWNLOAD_SETTINGS_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function detectDownloadPlatform({
  userAgentDataPlatform,
  navigatorPlatform,
  userAgent,
  maxTouchPoints = 0,
}: PlatformDetectionHints): ResolvedDownloadPlatform {
  const agent = userAgent?.trim().toLowerCase() ?? "";
  const legacyPlatform = navigatorPlatform?.trim().toLowerCase() ?? "";

  if (
    /android|iphone|ipad|ipod|cros/.test(agent) ||
    (legacyPlatform === "macintel" && maxTouchPoints > 1)
  ) {
    return "unknown";
  }

  const candidate =
    userAgentDataPlatform?.trim().toLowerCase() ||
    legacyPlatform ||
    agent;

  if (/windows|^win/.test(candidate)) return "windows";
  if (/macos|macintosh|^mac/.test(candidate)) return "macos";
  if (/linux|x11/.test(candidate)) return "linux";
  return "unknown";
}

export function resolveDownloadPlatform(
  preference: DownloadPlatformPreference,
  detected: ResolvedDownloadPlatform,
): ResolvedDownloadPlatform {
  return preference === "auto" ? detected : preference;
}
