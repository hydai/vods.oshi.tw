import { ArrowLeft, Film } from "lucide-react";
import Link from "next/link";
import { Brand } from "./components/Brand";
import { ThemeToggle } from "./components/ThemeToggle";

export default function NotFound() {
  return (
    <main className="unavailable-page">
      <header>
        <Brand />
        <ThemeToggle />
      </header>
      <section className="unavailable-card">
        <span className="unavailable-icon"><Film aria-hidden="true" /></span>
        <p className="eyebrow">404 · VOD not found</p>
        <h1>這部 VOD 不在目前的封存庫裡</h1>
        <p>它可能已從新版資料快照移除，或連結中的 VTuber 與影片代碼不正確。</p>
        <div>
          <Link className="primary-button" href="/">
            <ArrowLeft aria-hidden="true" /> 回到 VOD 封存庫
          </Link>
        </div>
      </section>
    </main>
  );
}
