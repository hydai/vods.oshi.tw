import { Clapperboard } from "lucide-react";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="VODs 首頁">
      <span className="brand-mark" aria-hidden="true">
        <Clapperboard />
      </span>
      <span className="brand-copy">
        <strong>VODs</strong>
        {!compact && <small>by oshi.tw</small>}
      </span>
    </Link>
  );
}
