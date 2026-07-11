import { DatabaseZap, ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

export function DataUnavailable() {
  return (
    <main className="unavailable-page">
      <header>
        <Brand />
        <ThemeToggle />
      </header>
      <section className="unavailable-card">
        <span className="unavailable-icon">
          <DatabaseZap aria-hidden="true" />
        </span>
        <p className="eyebrow">資料暫時無法取得</p>
        <h1>VOD 封存庫正在重新連線</h1>
        <p>
          我們沒有顯示未完成或未驗證的資料。請稍後重新整理，上一個有效版本會在服務恢復後自動回來。
        </p>
        <div>
          <Link className="primary-button" href="/">
            <RefreshCw aria-hidden="true" /> 重新整理
          </Link>
          <a
            className="secondary-button"
            href="https://prism.oshi.tw"
            target="_blank"
            rel="noreferrer"
          >
            前往 Prism <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </section>
    </main>
  );
}
