import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/view/$id")({
  component: Viewer,
});

interface Page {
  a: string;
  b: string;
  w: number;
  h: number;
}

interface Doc {
  id: string;
  title: string;
  pages: Page[];
  page_count: number;
}

function Viewer() {
  const { id } = Route.useParams();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [blocked, setBlocked] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wmRef = useRef<HTMLDivElement>(null);
  const flickerRef = useRef<HTMLDivElement>(null);

  /* =========================================================
     Load Document
  ========================================================= */

  useEffect(() => {
    supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setErr("Document not found or expired.");
          return;
        }

        setDoc(data as unknown as Doc);
      });
  }, [id]);

  /* =========================================================
     Security
  ========================================================= */

  useEffect(() => {
    const blockKeys = (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        e.key === "PrintScreen" ||
        (e.ctrlKey &&
          e.shiftKey &&
          (e.key === "I" || e.key === "J" || e.key === "C")) ||
        (e.ctrlKey &&
          (e.key === "s" || e.key === "u" || e.key === "p"))
      ) {
        e.preventDefault();

        setBlocked(true);

        setTimeout(() => {
          setBlocked(false);
        }, 1500);
      }

      if (e.key === "PrintScreen") {
        try {
          navigator.clipboard.writeText("");
        } catch {
          //
        }
      }
    };

    const blockCtx = (e: Event) => e.preventDefault();

    const onBlur = () => setBlocked(true);
    const onFocus = () => setBlocked(false);

    const onVis = () => {
      setBlocked(document.hidden);
    };

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

  /* =========================================================
     Current Page
  ========================================================= */

  const pageData = doc?.pages[page];

  const images = useMemo<{
    a: HTMLImageElement;
    b: HTMLImageElement;
  } | null>(() => {
    if (!pageData) return null;

    const a = new Image();
    const b = new Image();

    a.src = pageData.a;
    b.src = pageData.b;

    return { a, b };
  }, [pageData]);

  /* =========================================================
     Preload Next Page
  ========================================================= */

  useEffect(() => {
    if (!doc) return;

    const next = doc.pages[page + 1];

    if (next) {
      const i = new Image();
      const j = new Image();

      i.src = next.a;
      j.src = next.b;
    }
  }, [doc, page]);

  /* =========================================================
     Dynamic Flicker Layer
  ========================================================= */

  useEffect(() => {
    if (!flickerRef.current) return;

    let raf = 0;

    const animate = () => {
      if (flickerRef.current) {
        const opacity =
          0.01 +
          Math.random() * 0.02;

        const hue =
          Math.random() * 3 - 1.5;

        flickerRef.current.style.opacity =
          opacity.toString();

        flickerRef.current.style.backdropFilter =
          `hue-rotate(${hue}deg)`;
      }

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(raf);
  }, []);

  /* =========================================================
     Main Render Loop
  ========================================================= */

  useEffect(() => {
    if (!pageData || !images || !canvasRef.current) return;

    const canvas = canvasRef.current;

    canvas.width = pageData.w;
    canvas.height = pageData.h;

    const ctx = canvas.getContext("2d", {
      alpha: false,
    })!;

    let raf = 0;
    let parity = 0;
    let ready = false;
    let frame = 0;

    const check = () => {
      if (images.a.complete && images.b.complete) {
        ready = true;
      }
    };

    images.a.onload = check;
    images.b.onload = check;

    check();

    const draw = () => {
      frame++;

      if (ready && !blocked) {
        /* ======================================
           Base Alternating Frames
        ====================================== */

        ctx.clearRect(
          0,
          0,
          pageData.w,
          pageData.h
        );

        ctx.drawImage(
          parity ? images.b : images.a,
          0,
          0
        );

        parity ^= 1;

        /* ======================================
           Fine Moiré Pattern
        ====================================== */

        ctx.globalAlpha = 0.035;

        for (let y = 0; y < pageData.h; y += 3) {
          const shift =
            Math.sin((y + frame) * 0.03) * 1.5;

          ctx.fillStyle =
            y % 2 === 0
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.04)";

          ctx.fillRect(
            shift,
            y,
            pageData.w,
            1
          );
        }

        /* ======================================
           Animated Noise
        ====================================== */

        ctx.globalAlpha = 0.025;

        for (let i = 0; i < 1800; i++) {
          const x =
            Math.random() * pageData.w;

          const y =
            Math.random() * pageData.h;

          const size =
            Math.random() > 0.9 ? 2 : 1;

          ctx.fillStyle =
            Math.random() > 0.5
              ? "rgba(255,255,255,0.22)"
              : "rgba(0,0,0,0.18)";

          ctx.fillRect(x, y, size, size);
        }

        /* ======================================
           Dynamic Overlay Bands
        ====================================== */

        ctx.globalAlpha = 0.03;

        const bandY =
          ((frame * 3) % pageData.h);

        const gradient =
          ctx.createLinearGradient(
            0,
            bandY,
            0,
            bandY + 120
          );

        gradient.addColorStop(
          0,
          "rgba(255,255,255,0)"
        );

        gradient.addColorStop(
          0.5,
          "rgba(255,255,255,0.22)"
        );

        gradient.addColorStop(
          1,
          "rgba(255,255,255,0)"
        );

        ctx.fillStyle = gradient;

        ctx.fillRect(
          0,
          bandY,
          pageData.w,
          120
        );

        /* ======================================
           Subpixel RGB Distortion
        ====================================== */

        if (frame % 2 === 0) {
          ctx.globalAlpha = 0.02;

          ctx.drawImage(
            canvas,
            0,
            0,
            pageData.w,
            pageData.h,
            1,
            0,
            pageData.w,
            pageData.h
          );
        }

        ctx.globalAlpha = 1;
      } else if (blocked) {
        ctx.fillStyle = "#000";

        ctx.fillRect(
          0,
          0,
          pageData.w,
          pageData.h
        );
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(raf);
  }, [pageData, images, blocked]);

  /* =========================================================
     Moving Watermark
  ========================================================= */

  useEffect(() => {
    if (!wmRef.current) return;

    let t = 0;
    let raf = 0;

    const tick = () => {
      t += 0.01;

      if (wmRef.current) {
        const x =
          Math.sin(t) * 30 + 50;

        const y =
          Math.cos(t * 0.7) * 30 + 50;

        wmRef.current.style.left =
          `${x}%`;

        wmRef.current.style.top =
          `${y}%`;

        wmRef.current.style.transform =
          `translate(-50%, -50%) rotate(${Math.sin(t) * 8}deg)`;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, []);

  /* =========================================================
     Error
  ========================================================= */

  if (err) {
    return (
      <main className="flex min-h-screen items-center justify-center text-center">
        <div>
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />

          <p className="mt-3">
            {err}
          </p>
        </div>
      </main>
    );
  }

  /* =========================================================
     Loading
  ========================================================= */

  if (!doc) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading secure document…
      </div>
    );
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main
      className="min-h-screen no-select"
      onContextMenu={(e) =>
        e.preventDefault()
      }
    >
      <nav className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 font-display font-semibold">
          <Shield className="h-5 w-5 text-primary" />

          {doc.title}
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <button
            disabled={page === 0}
            onClick={() =>
              setPage((p) =>
                Math.max(0, p - 1)
              )
            }
            className="rounded p-1 transition hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <span>
            {page + 1} / {doc.page_count}
          </span>

          <button
            disabled={
              page >= doc.page_count - 1
            }
            onClick={() =>
              setPage((p) =>
                Math.min(
                  doc.page_count - 1,
                  p + 1
                )
              )
            }
            className="rounded p-1 transition hover:bg-muted disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </nav>

      <div className="flex justify-center py-6">
        <div
          className="viewer-protected relative overflow-hidden rounded-lg border border-border bg-black"
          style={{
            boxShadow:
              "var(--shadow-glow)",
          }}
        >
          <canvas
            ref={canvasRef}
            className="block max-w-[92vw] h-auto"
            style={{
              maxHeight: "85vh",
            }}
          />

          {/* Temporal Flicker Layer */}

          <div
            ref={flickerRef}
            className="flicker-layer"
          />

          {/* Scanlines */}

          <div className="scanlines" />

          {/* Dynamic Watermark */}

          <div
            ref={wmRef}
            className="
              pointer-events-none
              absolute
              select-none
              font-display
              text-2xl
              font-bold
              text-white/15
              mix-blend-overlay
            "
            style={{
              left: "50%",
              top: "50%",
              textShadow:
                "0 0 20px rgba(0,0,0,0.4)",
            }}
          >
            PREVIEW ONLY · {doc.title}
          </div>

          {/* Grid Watermarks */}

          <div className="pointer-events-none absolute inset-0 flex flex-wrap content-center justify-around opacity-[0.05]">
            {Array.from({
              length: 45,
            }).map((_, i) => (
              <span
                key={i}
                className="
                  rotate-[-30deg]
                  px-4
                  py-2
                  text-xs
                  font-bold
                  uppercase
                  tracking-widest
                  text-white
                "
              >
                Preview Only
              </span>
            ))}
          </div>

          {/* Block Overlay */}

          {blocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center text-destructive">
              <AlertTriangle className="h-10 w-10" />

              <p className="mt-3 font-semibold">
                Recording / focus loss
                detected
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Bring this window back
                to focus to resume.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default Viewer;