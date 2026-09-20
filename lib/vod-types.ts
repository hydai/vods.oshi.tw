export type VodExportSchemaVersion = `${number}.${number}.${number}`;

export interface VodExportCounts {
  streamers: number;
  vods: number;
  performances: number;
}

export interface VodExportManifest {
  schemaVersion: VodExportSchemaVersion;
  snapshotUrl: string;
  sha256: string;
  publishedAt: string;
  uncompressedBytes: number;
  counts: VodExportCounts;
}

export interface VodExportSocialLinks {
  youtube?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  twitch?: string;
}

export interface VodExportPerformance {
  performanceId: string;
  songId: string;
  title: string;
  originalArtist: string | null;
  startSeconds: number;
  endSeconds: number;
}

export interface VodExportVod {
  title: string;
  date: string;
  videoId: string;
  performances: VodExportPerformance[];
}

export interface VodExportStreamer {
  slug: string;
  displayName: string;
  youtubeChannelId: string;
  avatarUrl: string | null;
  group: string | null;
  socialLinks: VodExportSocialLinks;
  vods: VodExportVod[];
}

export interface VodExportSnapshot {
  schemaVersion: VodExportSchemaVersion;
  streamers: VodExportStreamer[];
}

export type VodStreamerProfile = Omit<VodExportStreamer, "vods">;

export interface VodDataset {
  manifest: VodExportManifest;
  snapshot: VodExportSnapshot;
}

export interface VodCardData {
  id: string;
  streamerSlug: string;
  streamerName: string;
  streamerAvatarUrl: string | null;
  group: string | null;
  videoId: string;
  title: string;
  date: string;
  songCount: number;
  songPreview: string[];
  searchText: string;
}
