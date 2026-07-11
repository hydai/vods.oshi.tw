"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { Brand } from "./components/Brand";
import { ThemeToggle } from "./components/ThemeToggle";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="unavailable-page">
      <header>
        <Brand />
        <ThemeToggle />
      </header>
      <section className="unavailable-card">
        <span className="unavailable-icon"><TriangleAlert aria-hidden="true" /></span>
        <p className="eyebrow">發生未預期的錯誤</p>
        <h1>這個畫面沒有順利載入</h1>
        <p>請再試一次；若問題持續發生，可以前往 Crystal 回報。</p>
        <div>
          <button className="primary-button" type="button" onClick={reset}>
            <RefreshCw aria-hidden="true" /> 再試一次
          </button>
        </div>
      </section>
    </main>
  );
}
