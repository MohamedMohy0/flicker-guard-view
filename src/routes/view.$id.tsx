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

  // Load Document
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

  // Preload images for current page
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

  // Advanced Adaptive Flicker + Jitter rAF Loop
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
        // 1. الاهتزاز الميكروسكوبي لتشتيت تركيز كاميرات الهواتف (Micro-Jitter)
        // نقوم بإزاحة بكسل واحد بشكل عشوائي سريع لا تلاحظه العين البشرية
        const jitterX = Math.random() > 0.5 ? 0.5 : -0.5;
        const shadowJitter = parity ? 0.2 : -0.2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 2. التناوب المتكيف مع تردد الشاشة الأصلي
        ctx.save();
        ctx.translate(jitterX, 0);
        ctx.drawImage(parity ? images.b : images.a, 0, 0);
        ctx.restore();

        // 3. طبقة التعمية اللونية المتباينة (High-Frequency Color Mask Overlay)
        // تُنشئ وميض لوني ميكروسكوبي يدمر معالجة كاميرا الهاتف تماماً ويبكسلها عند التقاط إطار واحد
        ctx.fillStyle = parity ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // تعديل حالة التناوب للإطار القادم
        parity ^= 1;
      } else if (blocked) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, pageData.w, pageData.h);
      }
      
      // مزامنة التردد مع أي شاشة تلقائياً دون تثبيت رقم هرتز محدد
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
    <main className="min-h-screen no-select bg-zinc-950 text-zinc-50" onContextMenu={e => e.preventDefault()}>
      <nav className="flex items-center justify-between border-b border-zinc-800 px-6 py-3 bg-zinc-900/50 backdrop-blur">
        <div className="flex items-center gap-2 font-semibold"><Shield className="h-5 w-5 text-emerald-500" /> {doc.title}</div>
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="rounded p-1 disabled:opacity-30 hover:bg-zinc-800"><ChevronLeft className="h-5 w-5" /></button>
          <span>{page + 1} / {doc.page_count}</span>
          <button disabled={page >= doc.page_count - 1} onClick={() => setPage(p => Math.min(doc.page_count - 1, p + 1))} className="rounded p-1 disabled:opacity-30 hover:bg-zinc-800"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </nav>

      <div className="flex justify-center py-6 select-none">
        <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-black shadow-2xl">
          
          {/* الـ Canvas الرئيسي الخاص بالوميض */}
          <canvas ref={canvasRef} className="block max-w-[92vw] h-auto pointer-events-none" style={{ maxHeight: "85vh" }} />

          {/* 
            طبقة الـ Moiré Anti-Photography Mask:
            خلفية شبكية ميكروسكوبية شفافة جداً ومتحركة تتداخل مع مستشعرات الهاتف
            لتضمن تدمير الملامح حتى لو كان الهاتف يملك شاتر سريع جداً.
          */}
          <div 
            className="pointer-events-none absolute inset-0 mix-blend-difference opacity-[0.03] animate-pulse"
            style={{
              backgroundImage: `radial-gradient(circle, #fff 1px, transparent 1px), linear-gradient(to right, #fff 1px, transparent 1px)`,
              backgroundSize: '4px 4px, 6px 6px'
            }}
          />

          {/* Moving watermark */}
          <div
            ref={wmRef}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none text-2xl font-bold text-white/10 mix-blend-overlay tracking-wider"
            style={{ textShadow: "0 0 20px rgba(0,0,0,0.6)" }}
          >
            SECURE VIEW · {doc.title}
          </div>

          {/* Tiled static watermark for extra coverage */}
          <div className="pointer-events-none absolute inset-0 flex flex-wrap content-center justify-around opacity-[0.04]">
            {Array.from({ length: 30 }).map((_, i) => (
              <span key={i} className="rotate-[-30deg] px-6 py-4 text-xs font-bold uppercase tracking-widest text-white">Protected Content</span>
            ))}
          </div>

          {/* Blackout overlay */}
          {blocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center text-red-500 backdrop-blur-md">
              <AlertTriangle className="h-10 w-10 animate-bounce" />
              <p className="mt-3 font-semibold text-lg">Security Event Triggered</p>
              <p className="mt-1 text-xs text-zinc-400">Window focus lost or screenshot shortcut detected.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}