import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Megaphone, Trash2 } from "lucide-react";
import { useToast } from "./Toast";

type UpdateRow = {
  id: string;
  title: string;
  body: string;
  published: number;
  createdAt: string;
  createdBy: string;
  authorName?: string;
  read?: number;
};

export default function UpdatesModal({
  isOpen,
  onClose,
  adminToken,
  isSuperAdmin,
  onUnreadChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  adminToken: string;
  isSuperAdmin: boolean;
  onUnreadChange?: (n: number) => void;
}) {
  const { success, error: toastError } = useToast();
  const [items, setItems] = useState<UpdateRow[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const headers = { Authorization: `Bearer ${adminToken}` };

  const load = async () => {
    const url = isSuperAdmin ? "/api/updates?all=1" : "/api/updates";
    const res = await fetch(url, { headers });
    const data = await res.json();
    const list: UpdateRow[] = Array.isArray(data) ? data : [];
    const unread = list.filter((u) => u.published && !u.read).map((u) => u.id);
    if (unread.length) {
      await fetch("/api/updates/read", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unread }),
      });
      list.forEach((u) => { if (unread.includes(u.id)) u.read = 1; });
    }
    setItems(list);
    onUnreadChange?.(list.filter((u) => u.published && !u.read).length);
  };

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen]);

  const publish = async () => {
    if (!title.trim() || !body.trim()) {
      toastError("Title and body required");
      return;
    }
    const res = await fetch("/api/updates", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body: body.trim(), published: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      toastError(data.error || "Failed to publish");
      return;
    }
    setTitle("");
    setBody("");
    setComposing(false);
    success("Update published");
    void load();
  };

  const unpublish = async (id: string) => {
    const res = await fetch(`/api/updates/${id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ published: false }),
    });
    if (!res.ok) {
      toastError("Failed to unpublish");
      return;
    }
    success("Unpublished");
    void load();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[200] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/70" onClick={onClose} />
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-blue-400" /> What's new
              </h2>
              <p className="text-xs text-zinc-500 mt-1">Product updates for agency staff. Clients never see this.</p>
            </div>
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          {isSuperAdmin && (
            <div className="mb-5">
              {!composing ? (
                <button onClick={() => setComposing(true)} className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> New update
                </button>
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                    placeholder="Title"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                  />
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={8000}
                    rows={5}
                    placeholder="What changed for the team…"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white resize-y"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => void publish()} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold">Publish</button>
                    <button onClick={() => { setComposing(false); setTitle(""); setBody(""); }} className="px-3 py-1.5 rounded-lg text-zinc-400 text-xs font-bold">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {items.filter((u) => u.published || isSuperAdmin).length === 0 && (
              <p className="text-sm text-zinc-600">No updates yet.</p>
            )}
            {items.filter((u) => u.published || isSuperAdmin).map((u) => (
              <article key={u.id} className={`rounded-xl border px-4 py-3 ${u.published ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-800/60 bg-zinc-950 opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">{u.title}</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {u.authorName || "Agency"} · {u.createdAt.slice(0, 10)}
                      {!u.published ? " · draft" : ""}
                    </p>
                  </div>
                  {isSuperAdmin && u.published ? (
                    <button onClick={() => void unpublish(u.id)} className="p-1.5 text-zinc-600 hover:text-red-400" title="Unpublish">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
                <p className="text-sm text-zinc-300 mt-2 whitespace-pre-wrap leading-relaxed">{u.body}</p>
              </article>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
