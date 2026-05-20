import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      nav({ to: "/dashboard" });
    }
  }, [user, loading, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "signup") {
      if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }

      if (password.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }
    }

    setBusy(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,

          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,

            data: {
              full_name: fullName,
              whatsapp: whatsapp,
            },
          },
        });

        if (error) throw error;

        toast.success(
          "Account created successfully. Please verify your email before logging in."
        );

        setMode("signin");
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (error) throw error;

        if (!data.user.email_confirmed_at) {
          toast.error("Please verify your email first.");
          await supabase.auth.signOut();
          return;
        }

        toast.success("Welcome back!");
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Authentication failed"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card/60 p-8 backdrop-blur"
        style={{ boxShadow: "var(--shadow-glow)" }}
      >
        <Link
          to="/"
          className="mb-6 flex items-center gap-2 font-display text-lg font-semibold"
        >
          <Shield className="h-6 w-6 text-primary" />
          PDF Shield
        </Link>

        <h1 className="text-2xl font-bold">
          {mode === "signin"
            ? "Welcome back"
            : "Create your account"}
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup"
            ? "Create account and verify your email."
            : "Sign in to continue."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">

          {mode === "signup" && (
            <>
              <div>
                <Label>Full Name</Label>

                <Input
                  required
                  value={fullName}
                  onChange={(e) =>
                    setFullName(e.target.value)
                  }
                />
              </div>

              <div>
                <Label>WhatsApp Number</Label>

                <Input
                  required
                  type="tel"
                  value={whatsapp}
                  onChange={(e) =>
                    setWhatsapp(e.target.value)
                  }
                />
              </div>
            </>
          )}

          <div>
            <Label>Email</Label>

            <Input
              type="email"
              required
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
            />
          </div>

          <div>
            <Label>Password</Label>

            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
            />
          </div>

          {mode === "signup" && (
            <div>
              <Label>Confirm Password</Label>

              <Input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="w-full"
            style={{
              backgroundImage:
                "var(--gradient-primary)",
            }}
          >
            {busy
              ? "Please wait..."
              : mode === "signin"
              ? "Sign In"
              : "Create Account"}
          </Button>
        </form>

        <button
          onClick={() =>
            setMode(
              mode === "signin"
                ? "signup"
                : "signin"
            )
          }
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}