import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) nav({ to: "/dashboard" }); }, [user, loading, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` }
        });
        if (error) throw error;
        toast.success("Account created! You have 5 free previews.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally { setBusy(false); }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/dashboard` });
    if (r.error) toast.error("Google sign-in failed");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/60 p-8 backdrop-blur" style={{ boxShadow: "var(--shadow-glow)" }}>
        <Link to="/" className="mb-6 flex items-center gap-2 font-display text-lg font-semibold">
          <Shield className="h-6 w-6 text-primary" /> PDF Shield
        </Link>
        <h1 className="text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup" ? "Get 5 free previews instantly." : "Sign in to manage your documents."}
        </p>

        <Button onClick={google} variant="outline" className="mt-6 w-full">
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35 11.1H12v3.2h5.35c-.23 1.2-1.4 3.5-5.35 3.5-3.2 0-5.85-2.7-5.85-6s2.65-6 5.85-6c1.85 0 3.05.8 3.75 1.45l2.55-2.45C16.85 3.4 14.65 2.5 12 2.5 6.75 2.5 2.5 6.75 2.5 12s4.25 9.5 9.5 9.5c5.5 0 9.15-3.85 9.15-9.3 0-.65-.05-1.1-.3-1.1z"/></svg>
          Continue with Google
        </Button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div><Label>Email</Label><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><Label>Password</Label><Input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></div>
          <Button type="submit" disabled={busy} className="w-full" style={{ backgroundImage: "var(--gradient-primary)" }}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground">
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
