import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VodDetail } from "../../../components/VodDetail";
import { getVodByKey, makeVodCards } from "../../../../lib/vod-data";

interface VodPageProps {
  params: Promise<{ streamer: string; videoId: string }>;
}

export async function generateMetadata({ params }: VodPageProps): Promise<Metadata> {
  const { streamer, videoId } = await params;
  const result = await getVodByKey(streamer, videoId).catch(() => null);
  if (!result) return { title: "找不到 VOD" };
  return {
    title: `${result.vod.title} — ${result.streamer.displayName}`,
    description: `${result.streamer.displayName} 的歌回 VOD，共收錄 ${result.vod.performances.length} 首歌曲與演唱時間點。`,
  };
}

export default async function VodPage({ params }: VodPageProps) {
  const { streamer: streamerSlug, videoId } = await params;
  const result = await getVodByKey(streamerSlug, videoId);
  if (!result) notFound();

  const relatedVods = makeVodCards(result.dataset)
    .filter(
      (card) =>
        card.streamerSlug === result.streamer.slug &&
        card.videoId !== result.vod.videoId,
    )
    .slice(0, 4);

  return (
    <VodDetail
      streamer={result.streamer}
      vod={result.vod}
      manifest={result.dataset.manifest}
      relatedVods={relatedVods}
    />
  );
}
