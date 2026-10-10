export interface YouTubePlayer {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  loadVideoById(options: {
    videoId: string;
    startSeconds?: number;
    endSeconds?: number;
  }): void;
  pauseVideo(): void;
  playVideo(): void;
}

interface YouTubePlayerEvent {
  target: YouTubePlayer;
}

interface YouTubePlayerStateEvent extends YouTubePlayerEvent {
  data: number;
}

interface YouTubePlayerErrorEvent extends YouTubePlayerEvent {
  data: number;
}

export interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: {
        autoplay: 0 | 1;
        controls: 0 | 1;
        origin: string;
        playsinline: 0 | 1;
        rel: 0 | 1;
      };
      events: {
        onReady: (event: YouTubePlayerEvent) => void;
        onStateChange: (event: YouTubePlayerStateEvent) => void;
        onError: (event: YouTubePlayerErrorEvent) => void;
        onAutoplayBlocked: () => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

/** The video length in seconds, or null while YouTube still reports 0. */
export function readVideoDuration(
  player: Pick<YouTubePlayer, "getDuration">,
): number | null {
  const duration = player.getDuration();
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    const script = existingScript ?? document.createElement("script");
    let settled = false;

    function cleanup() {
      window.clearTimeout(timeoutId);
      script.removeEventListener("error", onError);
      if (window.onYouTubeIframeAPIReady === onReady) {
        window.onYouTubeIframeAPIReady = previousReadyHandler;
      }
    }

    function fail(error: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      reject(error);
    }

    function onError() {
      fail(new Error("YouTube IFrame API failed to load"));
    }

    function onReady() {
      if (settled) return;
      try {
        previousReadyHandler?.();
      } finally {
        if (window.YT?.Player) {
          settled = true;
          cleanup();
          resolve(window.YT);
        } else {
          fail(new Error("YouTube IFrame API did not initialize"));
        }
      }
    }

    const timeoutId = window.setTimeout(
      () => fail(new Error("YouTube IFrame API timed out")),
      15_000,
    );
    window.onYouTubeIframeAPIReady = onReady;
    script.addEventListener("error", onError, { once: true });
    if (!existingScript) {
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      try {
        document.head.append(script);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }).catch((error) => {
    youtubeApiPromise = null;
    throw error;
  });

  return youtubeApiPromise;
}
