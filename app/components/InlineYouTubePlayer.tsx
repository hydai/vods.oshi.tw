"use client";

/* eslint-disable @next/next/no-img-element -- YouTube thumbnail URLs are derived from validated video IDs. */

import { AlertTriangle, LoaderCircle, Play, RotateCcw, Youtube } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { loadYouTubeApi, type YouTubePlayer } from "../../lib/youtube-api";

export interface PlaybackRequest {
  requestId: number;
  performanceId: string | null;
  title: string;
  startSeconds: number;
  endSeconds?: number;
}

export type PlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "finished"
  | "blocked"
  | "error";

export interface InlineYouTubePlayerHandle {
  play(request: PlaybackRequest): boolean;
}

interface InlineYouTubePlayerProps {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  request: PlaybackRequest | null;
  onRequestFullVod: () => void;
  onReadyChange?: (ready: boolean) => void;
  onStatusChange?: (status: PlaybackStatus) => void;
}

function formatTimestamp(seconds: number): string {
  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remaining = rounded % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function errorMessage(code: number): string {
  if (code === 101 || code === 150) return "這部 VOD 不允許嵌入播放。";
  if (code === 100) return "這部 VOD 已不存在或設為私人影片。";
  if (code === 2) return "YouTube 無法辨識這部 VOD。";
  if (code === 5) return "播放器暫時無法播放這部 VOD。";
  if (code === 153) return "YouTube 無法確認播放器來源。";
  return "播放器暫時無法連線。";
}

export const InlineYouTubePlayer = forwardRef<
  InlineYouTubePlayerHandle,
  InlineYouTubePlayerProps
>(function InlineYouTubePlayer(
  {
    videoId,
    title,
    thumbnailUrl,
    request,
    onRequestFullVod,
    onReadyChange,
    onStatusChange,
  },
  ref,
) {
  const mountRootRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const requestRef = useRef<PlaybackRequest | null>(request);
  const appliedRequestIdRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const boundaryReachedRef = useRef(false);
  const statusRef = useRef<PlaybackStatus>("idle");
  const onReadyChangeRef = useRef(onReadyChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const onRequestFullVodRef = useRef(onRequestFullVod);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [initializationAttempt, setInitializationAttempt] = useState(0);

  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
    onStatusChangeRef.current = onStatusChange;
    onRequestFullVodRef.current = onRequestFullVod;
  }, [onReadyChange, onRequestFullVod, onStatusChange]);

  const publishStatus = useCallback((nextStatus: PlaybackStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    onStatusChangeRef.current?.(nextStatus);
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const finishSegment = useCallback(
    (player: YouTubePlayer) => {
      boundaryReachedRef.current = true;
      clearWatchdog();
      player.pauseVideo();
      publishStatus("finished");
    },
    [clearWatchdog, publishStatus],
  );

  const armWatchdog = useCallback(
    (player: YouTubePlayer) => {
      clearWatchdog();
      const activeRequest = requestRef.current;
      if (activeRequest?.endSeconds === undefined) return;

      const requestId = activeRequest.requestId;
      watchdogRef.current = window.setInterval(() => {
        const currentRequest = requestRef.current;
        if (!currentRequest || currentRequest.requestId !== requestId) {
          clearWatchdog();
          return;
        }

        const currentTime = player.getCurrentTime();
        if (
          Number.isFinite(currentTime) &&
          currentTime >= currentRequest.endSeconds!
        ) {
          finishSegment(player);
        }
      }, 75);
    },
    [clearWatchdog, finishSegment],
  );

  const applyRequest = useCallback(
    (player: YouTubePlayer, nextRequest: PlaybackRequest) => {
      if (appliedRequestIdRef.current === nextRequest.requestId) return;

      appliedRequestIdRef.current = nextRequest.requestId;
      boundaryReachedRef.current = false;
      setError(null);
      clearWatchdog();
      publishStatus("loading");

      if (nextRequest.endSeconds !== undefined) {
        player.loadVideoById({
          videoId,
          startSeconds: nextRequest.startSeconds,
          endSeconds: nextRequest.endSeconds,
        });
      } else {
        player.loadVideoById({
          videoId,
          startSeconds: nextRequest.startSeconds,
        });
      }
    },
    [clearWatchdog, publishStatus, videoId],
  );

  useImperativeHandle(
    ref,
    () => ({
      play(nextRequest) {
        requestRef.current = nextRequest;
        const player = playerRef.current;
        if (!player) {
          if (statusRef.current === "error") {
            setError(null);
            setInitializationAttempt((attempt) => attempt + 1);
          }
          publishStatus("loading");
          return false;
        }

        applyRequest(player, nextRequest);
        return true;
      },
    }),
    [applyRequest, publishStatus],
  );

  useEffect(() => {
    const activePlayer = playerRef.current;
    if (request && activePlayer) {
      applyRequest(activePlayer, request);
    }
  }, [applyRequest, request]);

  useEffect(() => {
    let cancelled = false;
    const mountRoot = mountRootRef.current;
    if (!mountRoot) return;

    loadYouTubeApi()
      .then((youtube) => {
        if (cancelled) return;

        const mount = document.createElement("div");
        mountRoot.replaceChildren(mount);

        const player = new youtube.Player(mount, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              setReady(true);
              onReadyChangeRef.current?.(true);

              const queuedRequest = requestRef.current;
              if (queuedRequest) {
                applyRequest(event.target, queuedRequest);
              } else {
                publishStatus("idle");
              }
            },
            onStateChange: (event) => {
              if (cancelled) return;

              if (event.data === youtube.PlayerState.PLAYING) {
                const activeRequest = requestRef.current;
                if (
                  activeRequest?.endSeconds !== undefined &&
                  event.target.getCurrentTime() >= activeRequest.endSeconds
                ) {
                  finishSegment(event.target);
                  return;
                }
                publishStatus("playing");
                armWatchdog(event.target);
                return;
              }

              clearWatchdog();

              if (event.data === youtube.PlayerState.ENDED) {
                if (statusRef.current !== "loading") {
                  boundaryReachedRef.current = true;
                  publishStatus("finished");
                }
              } else if (event.data === youtube.PlayerState.PAUSED) {
                if (statusRef.current !== "loading") {
                  publishStatus(
                    boundaryReachedRef.current ? "finished" : "paused",
                  );
                }
              }
            },
            onError: (event) => {
              if (cancelled) return;
              clearWatchdog();
              setError(errorMessage(event.data));
              publishStatus("error");
            },
            onAutoplayBlocked: () => {
              if (cancelled) return;
              clearWatchdog();
              publishStatus("blocked");
            },
          },
        });

        playerRef.current = player;
      })
      .catch(() => {
        if (cancelled) return;
        setError("頁內播放器載入失敗，請檢查連線後再試一次。");
        publishStatus("error");
      });

    return () => {
      cancelled = true;
      clearWatchdog();
      setReady(false);
      onReadyChangeRef.current?.(false);
      const player = playerRef.current;
      playerRef.current = null;
      appliedRequestIdRef.current = null;
      boundaryReachedRef.current = false;
      player?.destroy();
      mountRoot.replaceChildren();
    };
  }, [
    applyRequest,
    armWatchdog,
    clearWatchdog,
    finishSegment,
    publishStatus,
    videoId,
    initializationAttempt,
  ]);

  function retryPlayback() {
    const player = playerRef.current;
    const activeRequest = requestRef.current;
    if (!player || !ready) {
      setError(null);
      publishStatus("loading");
      setInitializationAttempt((attempt) => attempt + 1);
      return;
    }

    setError(null);
    boundaryReachedRef.current = false;

    if (status === "blocked" && activeRequest) {
      publishStatus("loading");
      player.playVideo();
      return;
    }

    if (activeRequest) {
      appliedRequestIdRef.current = null;
      applyRequest(player, activeRequest);
    } else {
      onRequestFullVodRef.current();
    }
  }

  const activeTitle = request?.title ?? title;
  const hasSegment = request?.endSeconds !== undefined;
  const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  return (
    <div className="inline-player">
      <div className="inline-player-frame">
        <div className="inline-player-mount" ref={mountRootRef} />

        {!ready && (
          <button
            type="button"
            className="hero-video inline-player-poster"
            onClick={() => onRequestFullVodRef.current()}
            aria-label={`在此頁播放 ${title}`}
          >
            <img src={thumbnailUrl} alt={`${title} 的 YouTube 縮圖`} />
            <span className="hero-video-scrim" />
            <span className="hero-play">
              {status === "loading" ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <Play fill="currentColor" aria-hidden="true" />
              )}
            </span>
            <span className="hero-source">
              <Youtube aria-hidden="true" /> 頁內播放
            </span>
          </button>
        )}

        {(status === "blocked" || status === "error") && (
          <div className="inline-player-recovery" role="status">
            <AlertTriangle aria-hidden="true" />
            <strong>
              {status === "blocked" ? "瀏覽器擋下了自動播放" : error}
            </strong>
            <span>
              {status === "blocked"
                ? "再點一次即可從選取的時間繼續。"
                : "你仍可前往 YouTube 觀看完整 VOD。"}
            </span>
            <div>
              {status === "blocked" && (
                <button type="button" onClick={retryPlayback}>
                  <Play fill="currentColor" aria-hidden="true" />
                  繼續播放
                </button>
              )}
              {status === "error" && (
                <button type="button" onClick={retryPlayback}>
                  <RotateCcw aria-hidden="true" />
                  重試
                </button>
              )}
              <a href={youtubeUrl} target="_blank" rel="noreferrer">
                <Youtube aria-hidden="true" />
                YouTube
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="inline-player-caption" aria-live="polite">
        <span className={`player-status-dot is-${status}`} aria-hidden="true" />
        <span>
          <strong>
            {request ? activeTitle : ready ? "頁內播放器已就緒" : "正在準備頁內播放器"}
          </strong>
          <small>
            {hasSegment && request
              ? `${formatTimestamp(request.startSeconds)} → ${formatTimestamp(request.endSeconds!)} · 結束時自動暫停`
              : request
                ? "播放完整 VOD"
                : "點選下方歌曲即可從標記時間播放"}
          </small>
        </span>
      </div>
    </div>
  );
});
