import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

function safeRequestOrigin(host: string | null, protocol: string | null): URL {
  const fallback = new URL("https://vods.oshi.tw");
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return fallback;
  try {
    const candidate = new URL(`${protocol === "http" ? "http" : "https"}://${host}`);
    return candidate.username || candidate.password ? fallback : candidate;
  } catch {
    return fallback;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const origin = safeRequestOrigin(
    host,
    requestHeaders.get("x-forwarded-proto"),
  );
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: origin,
    title: {
      default: "VODs — VTuber 歌回資料庫",
      template: "%s · VODs",
    },
    description:
      "快速瀏覽 VTuber 歌回 VOD，搜尋歌曲、原唱與演唱時間點。",
    applicationName: "VODs by oshi.tw",
    openGraph: {
      type: "website",
      locale: "zh_TW",
      siteName: "VODs by oshi.tw",
      title: "VODs — 快速找到，想再聽一次的歌",
      description: "瀏覽 VTuber 歌回 VOD，直接回到每一段演唱發生的時間點。",
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "VODs — 快速找到，想再聽一次的歌。",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "VODs — VTuber 歌回資料庫",
      description: "快速找到，想再聽一次的歌。",
      images: [socialImage],
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff0f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0a1a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(!t&&d))document.documentElement.classList.add('dark')}catch(e){}})()",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
