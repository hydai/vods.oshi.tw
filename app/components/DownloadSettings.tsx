"use client";

import { Settings2, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  DEFAULT_DOWNLOAD_SETTINGS,
  detectDownloadPlatform,
  loadDownloadSettings,
  resolveDownloadPlatform,
  saveDownloadSettings,
  type DownloadSettings as DownloadSettingsValue,
} from "../../lib/download-settings";
import type {
  ResolvedDownloadPlatform,
  VideoDownloadProfile,
} from "../../lib/video-download-command";

const PROFILE_OPTIONS: ReadonlyArray<{
  value: VideoDownloadProfile;
  title: string;
  format: string;
  description: string;
  badge?: string;
}> = [
  {
    value: "editing-mp4",
    title: "剪輯相容 MP4",
    format: "H.264 + AAC · 快速",
    description: "適合 CapCut、DaVinci Resolve 與 Premiere，通常最高為 1080p。",
    badge: "預設",
  },
  {
    value: "quality-webm",
    title: "高畫質 WebM",
    format: "VP9 或 AV1 + Opus · 快速",
    description: "優先保留 YouTube 的高畫質串流，但剪輯軟體相容性較低。",
  },
  {
    value: "precise-reencode",
    title: "較精準切點",
    format: "重新編碼 · 較慢",
    description: "重新壓製片段以改善切點，會明顯增加等待時間、耗電與發熱。",
  },
];

const PLATFORM_LABELS: Record<ResolvedDownloadPlatform, string> = {
  windows: "Windows（PowerShell）",
  macos: "macOS（Terminal）",
  linux: "Linux（Shell）",
  unknown: "無法辨識",
};

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: { platform?: string };
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useDownloadSettings() {
  const [settings, setSettings] = useState<DownloadSettingsValue>(
    DEFAULT_DOWNLOAD_SETTINGS,
  );
  const [detectedPlatform, setDetectedPlatform] =
    useState<ResolvedDownloadPlatform>("unknown");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const browserNavigator = navigator as NavigatorWithUserAgentData;
      setSettings(loadDownloadSettings(browserStorage()));
      setDetectedPlatform(
        detectDownloadPlatform({
          userAgentDataPlatform: browserNavigator.userAgentData?.platform,
          navigatorPlatform: navigator.platform,
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints,
        }),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const updateSettings = useCallback((next: DownloadSettingsValue) => {
    setSettings(next);
    saveDownloadSettings(browserStorage(), next);
  }, []);

  const resolvedPlatform = useMemo(
    () => resolveDownloadPlatform(settings.platform, detectedPlatform),
    [detectedPlatform, settings.platform],
  );

  return { settings, detectedPlatform, resolvedPlatform, updateSettings };
}

interface DownloadSettingsProps {
  settings: DownloadSettingsValue;
  detectedPlatform: ResolvedDownloadPlatform;
  resolvedPlatform: ResolvedDownloadPlatform;
  onChange: (settings: DownloadSettingsValue) => void;
  placement?: "left" | "right";
}

export function DownloadSettings({
  settings,
  detectedPlatform,
  resolvedPlatform,
  onChange,
  placement = "right",
}: DownloadSettingsProps) {
  const generatedId = useId().replaceAll(":", "");
  const popoverId = `download-settings-${generatedId}`;
  const titleId = `${popoverId}-title`;
  const radioName = `${popoverId}-profile`;
  const hasCustomSettings =
    settings.profile !== DEFAULT_DOWNLOAD_SETTINGS.profile ||
    settings.platform !== DEFAULT_DOWNLOAD_SETTINGS.platform;

  return (
    <div className={`download-settings-control is-${placement}`}>
      <button
        type="button"
        className={`icon-button download-settings-trigger${hasCustomSettings ? " has-custom-settings" : ""}`}
        popoverTarget={popoverId}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        aria-label="下載指令設定"
        title="下載指令設定"
      >
        <Settings2 aria-hidden="true" />
      </button>

      <section
        id={popoverId}
        className="download-settings-popover"
        popover="auto"
        role="dialog"
        aria-labelledby={titleId}
      >
        <header className="download-settings-header">
          <div>
            <p>Download settings</p>
            <h2 id={titleId}>下載指令設定</h2>
          </div>
          <button
            type="button"
            className="download-settings-close"
            popoverTarget={popoverId}
            popoverTargetAction="hide"
            aria-label="關閉下載指令設定"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <fieldset className="download-settings-fieldset">
          <legend>影片格式</legend>
          <div className="download-profile-options">
            {PROFILE_OPTIONS.map((option) => (
              <label
                className={`download-profile-option${settings.profile === option.value ? " is-selected" : ""}`}
                key={option.value}
              >
                <input
                  type="radio"
                  name={radioName}
                  value={option.value}
                  checked={settings.profile === option.value}
                  onChange={() =>
                    onChange({ ...settings, profile: option.value })
                  }
                />
                <span className="download-profile-copy">
                  <span>
                    <strong>{option.title}</strong>
                    {option.badge && <em>{option.badge}</em>}
                  </span>
                  <small>{option.format}</small>
                  <span>{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="download-settings-fieldset platform-fieldset">
          <legend>執行環境</legend>
          <label className="download-platform-select">
            <span className="sr-only">下載指令執行環境</span>
            <select
              value={settings.platform}
              onChange={(event) =>
                onChange({
                  ...settings,
                  platform: event.target.value as DownloadSettingsValue["platform"],
                })
              }
            >
              <option value="auto">自動偵測</option>
              <option value="windows">Windows（PowerShell）</option>
              <option value="macos">macOS（Terminal）</option>
              <option value="linux">Linux（Shell）</option>
            </select>
          </label>
          <p className={resolvedPlatform === "unknown" ? "is-unknown" : undefined}>
            {settings.platform === "auto"
              ? detectedPlatform === "unknown"
                ? "目前無法辨識；將使用通用指令，你也可以手動指定平台。"
                : `目前偵測：${PLATFORM_LABELS[detectedPlatform]}`
              : `已手動指定：${PLATFORM_LABELS[resolvedPlatform]}`}
          </p>
        </fieldset>

        <footer className="download-settings-footer">
          <span>變更會自動儲存在這台裝置</span>
          <button
            type="button"
            popoverTarget={popoverId}
            popoverTargetAction="hide"
          >
            完成
          </button>
        </footer>
      </section>
    </div>
  );
}
