import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Shield, Lock, Eye, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => { if (!loading && user) nav({ to: "/dashboard" }); }, [user, loading, nav]);

  return (
    <main className="min-h-screen">
      <nav className="flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <Shield className="h-6 w-6 text-primary" />
          <span>PDF Shield</span>
        </div>
        <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
      </nav>

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-24 text-center md:pt-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <Zap className="h-3.5 w-3.5 text-primary" /> Anti-screenshot · Anti-camera · Browser-only
        </div>
        <h1 className="mt-6 text-5xl font-bold leading-tight md:text-7xl">
          Share PDFs. <br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>
            Block the thieves.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Send a private link to clients. They see the document clearly — but cameras and screen
          recorders see only black bars, noise, and glitches.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/auth">
            <Button size="lg" className="px-8" style={{ backgroundImage: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}>
              Get 5 free previews
            </Button>
          </Link>
        </div>

        <div className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { icon: Lock, t: "Temporal interlacing", d: "60Hz row alternation invisible to the eye, devastating to cameras." },
            { icon: Eye, t: "Live watermarks", d: "Moving 'Preview Only' marks float over every page." },
            { icon: Shield, t: "Lock-on-blur", d: "Switch tab or try to record? The page goes black instantly." },
          ].map((f, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card/40 p-6 text-left backdrop-blur">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{f.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
