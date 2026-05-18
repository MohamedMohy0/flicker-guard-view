import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/view/$id")({ component: Viewer });

interface Page { a: string; b: string; w: number; h: number; }
interface Doc { id: string; title: string; pages: Page[]; page_count: number; }

function Viewer() {
  const { id } = Route.useParams();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wmRef = useRef<HTMLDivElement>(null);

  // Load
  useEffect(() => {
    supabase.from("documents").select("*").eq("id", id).maybeSingle().then(({ data, error }) => {
      if (error || !data) { setErr("Document not found or expired."); return; }
      setDoc(data as unknown as Doc);
    });
  }, [id]);

  // Security: block context menu, devtools shortcuts, blur, visibility
  useEffect(() => {
    const blockKeys = (e: KeyboardEvent) => {
      if (e.key === "F12" || e.key === "PrintScreen" ||
          (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
          (e.ctrlKey && (e.key === "s" || e.key === "u" || e.key === "p"))) {
        e.preventDefault();
        setBlocked(true);
        setTimeout(() => setBlocked(false), 1500);
      }
      // Wipe clipboard on PrintScreen as a deterrent
      if (e.key === "PrintScreen") {
        try { navigator.clipboard.writeText(""); } catch { /* noop */ }
      }
    };
    const blockCtx = (e: Event) => e.preventDefault();
    const onBlur = () => setBlocked(true);
    const onFocus = () => setBlocked(false);
    const onVis = () => setBlocked(document.hidden);

    window.addEventListener("keydown", blockKeys);
    window.addEventListener("contextmenu", blockCtx);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", blockKeys);
      window.removeEventListener("contextmenu", blockCtx);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Preload images for current + next page (lazy)
  const pageData = doc?.pages[page];
  const images = useMemo<{ a: HTMLImageElement; b: HTMLImageElement } | null>(() => {
    if (!pageData) return null;
    const a = new Image(); a.src = pageData.a;
    const b = new Image(); b.src = pageData.b;
    return { a, b };
  }, [pageData]);

  // Preload next page in background
  useEffect(() => {
    if (!doc) return;
    const next = doc.pages[page + 1];
    if (next) { const i = new Image(); i.src = next.a; const j = new Image(); j.src = next.b; }
  }, [doc, page]);

  // Flicker rAF loop at native refresh rate
  useEffect(() => {
    if (!pageData || !images || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = pageData.w;
    canvas.height = pageData.h;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let parity = 0;
    let ready = false;
    const check = () => { if (images.a.complete && images.b.complete) ready = true; };
    images.a.onload = check; images.b.onload = check; check();

    const draw = () => {
      if (ready && !blocked) {
        // Alternate complementary frames every rAF tick.
        // Eye averages A+B → clean image. Camera shutter samples one → noisy capture.
        ctx.drawImage(parity ? images.b : images.a, 0, 0);
        parity ^= 1;
      } else if (blocked) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, pageData.w, pageData.h);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [pageData, images, blocked]);

  // Drifting watermark
  useEffect(() => {
    if (!wmRef.current) return;
    let t = 0; let raf = 0;
    const tick = () => {
      t += 0.01;
      if (wmRef.current) {
        const x = (Math.sin(t) * 30 + 50);
        const y = (Math.cos(t * 0.7) * 30 + 50);
        wmRef.current.style.left = `${x}%`;
        wmRef.current.style.top = `${y}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (err) return (
    <main className="flex min-h-screen items-center justify-center text-center">
      <div><AlertTriangle className="mx-auto h-10 w-10 text-destructive" /><p className="mt-3">{err}</p></div>
    </main>
  );
  if (!doc) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading secure document…</div>;

  return (
    <main className="min-h-screen no-select" onContextMenu={e => e.preventDefault()}>
      <nav className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 font-display font-semibold"><Shield className="h-5 w-5 text-primary" /> {doc.title}</div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="rounded p-1 disabled:opacity-30 hover:bg-muted"><ChevronLeft className="h-5 w-5" /></button>
          <span>{page + 1} / {doc.page_count}</span>
          <button disabled={page >= doc.page_count - 1} onClick={() => setPage(p => Math.min(doc.page_count - 1, p + 1))} className="rounded p-1 disabled:opacity-30 hover:bg-muted"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </nav>

      <div className="flex justify-center py-6">
        <div className="relative overflow-hidden rounded-lg border border-border bg-black" style={{ boxShadow: "var(--shadow-glow)" }}>
          <canvas ref={canvasRef} className="block max-w-[92vw] h-auto" style={{ maxHeight: "85vh" }} />

          {/* Moving watermark */}
          <div
            ref={wmRef}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none font-display text-2xl font-bold text-white/15 mix-blend-overlay"
            style={{ textShadow: "0 0 20px rgba(0,0,0,0.4)" }}
          >
            PREVIEW ONLY · {doc.title}
          </div>

          {/* Tiled static watermark for extra coverage */}
          <div className="pointer-events-none absolute inset-0 flex flex-wrap content-center justify-around opacity-[0.06]">
            {Array.from({ length: 40 }).map((_, i) => (
              <span key={i} className="rotate-[-30deg] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">Preview Only</span>
            ))}
          </div>

          {/* Blackout overlay */}
          {blocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center text-destructive">
              <AlertTriangle className="h-10 w-10" />
              <p className="mt-3 font-semibold">Recording / focus loss detected</p>
              <p className="mt-1 text-xs text-muted-foreground">Bring this window back to focus to resume.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
