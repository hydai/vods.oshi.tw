import type { Metadata } from "next";
import { DataUnavailable } from "./components/DataUnavailable";
import { VodBrowser } from "./components/VodBrowser";
import { getVodDataset, makeVodCards } from "../lib/vod-data";

export const metadata: Metadata = {
  title: "VTuber VOD 封存庫",
  description: "搜尋 VTuber 歌回 VOD、歌曲與原唱，直接回到每一段演唱發生的時間點。",
};

type HomeSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function Home({
  searchParams,
}: {
  searchParams: HomeSearchParams;
}) {
  const loaded = await loadHomeData(await searchParams);
  if (!loaded) return <DataUnavailable />;

  return <VodBrowser {...loaded} />;
}

async function loadHomeData(queryParams: Record<string, string | string[] | undefined>) {
  try {
    const dataset = await getVodDataset();
    const cards = makeVodCards(dataset);
    const groups = Array.from(
      new Set(
        dataset.snapshot.streamers
          .map((streamer) => streamer.group)
          .filter((group): group is string => Boolean(group)),
      ),
    ).sort((left, right) => left.localeCompare(right, "zh-TW"));
    const streamers = dataset.snapshot.streamers
      .filter((streamer) => streamer.vods.length > 0)
      .map((streamer) => ({
        slug: streamer.slug,
        displayName: streamer.displayName,
        avatarUrl: streamer.avatarUrl,
        vodCount: streamer.vods.length,
      }))
      .sort(
        (left, right) =>
          right.vodCount - left.vodCount ||
          left.displayName.localeCompare(right.displayName, "zh-TW"),
      );
    const requestedSort = first(queryParams.sort);
    const sort: "newest" | "oldest" | "songs" =
      requestedSort === "oldest" || requestedSort === "songs"
        ? requestedSort
        : "newest";

    return {
      cards,
      streamers,
      groups,
      counts: dataset.manifest.counts,
      publishedAt: dataset.manifest.publishedAt,
      initialFilters: {
        query: first(queryParams.q),
        group: first(queryParams.group),
        streamer: first(queryParams.streamer),
        year: first(queryParams.year),
        sort,
      },
    };
  } catch (error) {
    console.error("Unable to load the VOD dataset", error);
    return null;
  }
}
