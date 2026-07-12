/* eslint-disable @next/next/no-img-element -- This reuses the app's local high-resolution brand artwork. */

import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="VODs 首頁">
      <span className="brand-mark" aria-hidden="true">
        <img src="/apple-icon.png" alt="" width="180" height="180" />
      </span>
      <span className="brand-copy">
        <strong>VODs</strong>
        {!compact && <small>by oshi.tw</small>}
      </span>
    </Link>
  );
}
