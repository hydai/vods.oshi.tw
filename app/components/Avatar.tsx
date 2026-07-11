"use client";

/* eslint-disable @next/next/no-img-element -- dynamic, validated YouTube profile URLs are intentionally rendered without the image proxy. */

import { useState } from "react";

export function Avatar({
  src,
  name,
  size = "medium",
  eager = false,
}: {
  src: string | null;
  name: string;
  size?: "small" | "medium" | "large";
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase("zh-TW") ?? "V";

  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  );
}
