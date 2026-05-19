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

  // Load document
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
        e.stopPropagation();
        setBlocked(true);
        setTimeout(() => setBlocked(false), 1500);
      }
      // Attempt to wipe clipboard on PrintScreen
      if (e.key === "PrintScreen") {
        try { navigator.clipboard.writeText(""); } catch { /* noop */ }
      }
    };
    
    const blockCtx = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
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
    const a = new Image(); 
    const b = new Image(); 
    
    // Add crossOrigin if needed for canvas operations
    a.crossOrigin = "anonymous";
    b.crossOrigin = "anonymous";
    
    a.src = pageData.a;
    b.src = pageData.b;
    return { a, b };
  }, [pageData]);

  // Preload next page in background
  useEffect(() => {
    if (!doc) return;
    const next = doc.pages[page + 1];
    if (next) { 
      const i = new Image(); 
      const j = new Image();
      i.crossOrigin = "anonymous";
      j.crossOrigin = "anonymous";
      i.src = next.a; 
      j.src = next.b; 
    }
  }, [doc, page]);

  // Flicker animation loop at native refresh rate
  useEffect(() => {
    if (!pageData || !images || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    canvas.width = pageData.w;
    canvas.height = pageData.h;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let parity = 0;
    let ready = false;
    
    const check = () => { 
      if (images.a.complete && images.b.complete) ready = true; 
    };
    
    images.a.onload = check; 
    images.b.onload = check; 
    check();

    // Timing control to ensure smooth flicker
    let lastFrameTime = 0;
    const targetFPS = 60; // Target 60fps for smooth flicker
    const frameInterval = 1000 / targetFPS;

    const draw = (timestamp: number) => {
      if (!ready || !canvasRef.current) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const deltaTime = timestamp - lastFrameTime;

      if (blocked) {
        // Show black screen when blocked
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, pageData.w, pageData.h);
      } else if (deltaTime >= frameInterval) {
        // Alternate complementary frames for anti-photography effect
        ctx.clearRect(0, 0, pageData.w, pageData.h);
        ctx.drawImage(parity ? images.b : images.a, 0, 0, pageData.w, pageData.h);
        parity ^= 1;
        lastFrameTime = timestamp - (deltaTime % frameInterval);
      }
      
      raf = requestAnimationFrame(draw);
    };
    
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [pageData, images, blocked]);

  // Enhanced drifting watermark with multiple elements
  useEffect(() => {
    if (!wmRef.current) return;
    let t = 0; 
    let raf = 0;
    const tick = () => {
      t += 0.008; // Slower drift
      if (wmRef.current) {
        // Lissajous-like pattern for more organic movement
        const x = (Math.sin(t) * 25 + 50);
        const y = (Math.cos(t * 0.7) * 25 + 50);
        const rotation = Math.sin(t * 0.3) * 5; // Slight rotation variation
        
        wmRef.current.style.left = `${x}%`;
        wmRef.current.style.top = `${y}%`;
        wmRef.current.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (err) return (
    <main className="flex min-h-screen items-center justify-center text-center">
      <div>
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3">{err}</p>
      </div>
    </main>
  );
  
  if (!doc) return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Loading secure document…
    </div>
  );

  return (
    <main className="min-h-screen no-select" onContextMenu={e => e.preventDefault()}>
      <nav className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 font-display font-semibold">
          <Shield className="h-5 w-5 text-primary" /> {doc.title}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <button 
            disabled={page === 0} 
            onClick={() => setPage(p => Math.max(0, p - 1))} 
            className="rounded p-1 disabled:opacity-30 hover:bg-muted"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span>{page + 1} / {doc.page_count}</span>
          <button 
            disabled={page >= doc.page_count - 1} 
            onClick={() => setPage(p => Math.min(doc.page_count - 1, p + 1))} 
            className="rounded p-1 disabled:opacity-30 hover:bg-muted"
            aria-label="Next page"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </nav>

      <div className="flex justify-center py-6">
        <div 
          className="relative overflow-hidden rounded-lg border border-border bg-black" 
          style={{ boxShadow: "var(--shadow-glow)" }}
          // Additional CSS for anti-screenshot
         
      >
          <canvas 
            ref={canvasRef} 
            className="block max-w-[92vw] h-auto" 
            style={{ 
              maxHeight: "85vh",
              // Prevent browser image saving
              WebkitTouchCallout: 'none',
            }} 
          />

          {/* Primary moving watermark */}
          <div
            ref={wmRef}
            className="pointer-events-none absolute select-none font-display text-2xl font-bold text-white/15 mix-blend-overlay transition-none"
            style={{ 
              textShadow: "0 0 20px rgba(0,0,0,0.4)",
              willChange: "transform, left, top"
            }}
          >
            PREVIEW ONLY · {doc.title}
          </div>

          {/* Secondary tiled watermark for extra coverage */}
          <div className="pointer-events-none absolute inset-0 flex flex-wrap content-center justify-around opacity-[0.04]">
            {Array.from({ length: 40 }).map((_, i) => (
              <span 
                key={i} 
                className="rotate-[-30deg] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white"
                style={{
                  textShadow: "0 0 2px rgba(0,0,0,0.5)"
                }}
              >
                Preview Only
              </span>
            ))}
          </div>

          {/* Blackout overlay when blocked */}
          {blocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm text-center text-destructive">
              <AlertTriangle className="h-10 w-10" />
              <p className="mt-3 font-semibold">Recording / focus loss detected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Bring this window back to focus to resume viewing.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default Viewer;