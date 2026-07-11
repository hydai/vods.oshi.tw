export default function Loading() {
  return (
    <main className="loading-page" role="status" aria-label="正在載入 VOD 封存庫">
      <div className="loading-sidebar" />
      <div className="loading-main">
        <div className="loading-line loading-title" />
        <div className="loading-line loading-copy" />
        <div className="loading-search" />
        <div className="loading-cards">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="loading-card" key={index} />
          ))}
        </div>
      </div>
      <span className="sr-only">正在載入…</span>
    </main>
  );
}
