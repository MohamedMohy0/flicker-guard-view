import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { processPdf } from "@/lib/pdf-processor";
import { Button } from "@/components/ui/button";
import { Shield, Upload, Link2, Trash2, LogOut, Coins, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

interface Doc { id: string; title: string; page_count: number; created_at: string; }

function Dashboard() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [user, loading, nav]);

  const loadDocs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("documents").select("id,title,page_count,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false });
    setDocs((data ?? []) as Doc[]);
  };
  useEffect(() => { if (user) loadDocs(); }, [user]);

  const onPick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!profile || profile.credits <= 0) {
      toast.error("You're out of credits. Upgrade to add more.");
      return;
    }
    setBusy(true);
    try {
      setProgress("Reading PDF…");
      const pages = await processPdf(file, (c, t) => setProgress(`Securing page ${c}/${t}…`));

      const docId = crypto.randomUUID();
      const urlPages: { a: string; b: string; w: number; h: number }[] = [];

      for (let i = 0; i < pages.length; i++) {
        setProgress(`Uploading page ${i + 1}/${pages.length}…`);
        const p = pages[i];
        const base = `${user.id}/${docId}/${i}`;
        const [ua, ub] = await Promise.all([
          supabase.storage.from("pdf-pages").upload(`${base}_a.png`, p.a, {
            contentType: "image/png", upsert: true,
          }),
          supabase.storage.from("pdf-pages").upload(`${base}_b.png`, p.b, {
            contentType: "image/png", upsert: true,
          }),
        ]);
        if (ua.error) throw ua.error;
        if (ub.error) throw ub.error;
        const aUrl = supabase.storage.from("pdf-pages").getPublicUrl(`${base}_a.png`).data.publicUrl;
        const bUrl = supabase.storage.from("pdf-pages").getPublicUrl(`${base}_b.png`).data.publicUrl;
        urlPages.push({ a: aUrl, b: bUrl, w: p.w, h: p.h });
      }

      setProgress("Saving…");
      const { error } = await supabase.from("documents").insert({
        id: docId,
        user_id: user.id,
        title: file.name.replace(/\.pdf$/i, ""),
        pages: urlPages as unknown as never,
        page_count: urlPages.length,
      });
      if (error) throw error;
      await supabase.from("profiles").update({ credits: profile.credits - 1 }).eq("id", user.id);
      await refreshProfile();
      await loadDocs();
      toast.success("Document secured!");
      copyLink(docId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };


  const copyLink = (id: string) => {
    const url = `${window.location.origin}/view/${id}`;
    navigator.clipboard.writeText(url);
    toast.success("Preview link copied to clipboard");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    await supabase.from("documents").delete().eq("id", id);
    await loadDocs();
  };

  if (loading || !user) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <main className="min-h-screen">
      <nav className="flex items-center justify-between border-b border-border px-6 py-4 md:px-10">
        <Link to="/" className="flex items-center gap-2 font-display font-semibold"><Shield className="h-5 w-5 text-primary" /> PDF Shield</Link>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
            <Coins className="h-4 w-4 text-primary" />
            <span className="font-medium">{profile?.credits ?? 0}</span>
            <span className="text-muted-foreground">credits</span>
          </div>
          <span className="hidden text-muted-foreground md:inline">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-bold">Your secure documents</h1>
        <p className="mt-1 text-muted-foreground">Upload a PDF — get a private link that fights cameras.</p>

        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onFile} />
          <Upload className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-lg font-semibold">{busy ? progress : "Drop a PDF or click to upload"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Each upload costs 1 credit. Processed locally in your browser.</p>
          <Button onClick={onPick} disabled={busy} className="mt-5" style={{ backgroundImage: "var(--gradient-primary)" }}>
            {busy ? "Processing…" : "Select PDF"}
          </Button>
        </div>

        <div className="mt-10 space-y-2">
          {docs.length === 0 && <p className="text-center text-sm text-muted-foreground">No documents yet.</p>}
          {docs.map(d => (
            <div key={d.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/50 p-4">
              <div className="min-w-0">
                <div className="truncate font-medium">{d.title}</div>
                <div className="text-xs text-muted-foreground">{d.page_count} pages · {new Date(d.created_at).toLocaleDateString()}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link to="/view/$id" params={{ id: d.id }}><Button variant="outline" size="sm"><Link2 className="h-4 w-4" /></Button></Link>
                <Button variant="outline" size="sm" onClick={() => copyLink(d.id)}><Copy className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
