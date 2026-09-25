import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Copy, Bot, Trash2 } from "lucide-react";
import { useToast } from "./Toast";

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  role: string;
  username?: string;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revoked: number;
  userId: string;
};

type AgencyUser = { id: string; username: string; role: string };

const MCP_URL = "https://review-room.theosirislabs.com/mcp";

function hermesYaml(token: string) {
  return `mcp_servers:
  review-room:
    url: "${MCP_URL}"
    headers:
      Authorization: "Bearer ${token}"
    timeout: 120
    connect_timeout: 30`;
}

function cursorJson(token: string) {
  return JSON.stringify({
    mcpServers: {
      "review-room": {
        url: MCP_URL,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  }, null, 2);
}

function claudeJson(token: string) {
  return cursorJson(token);
}

export default function McpKeysModal({
  isOpen,
  onClose,
  adminToken,
}: {
  isOpen: boolean;
  onClose: () => void;
  adminToken: string;
}) {
  const { success, error: toastError } = useToast();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [users, setUsers] = useState<AgencyUser[]>([]);
  const [name, setName] = useState("Hermes");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [revealed, setRevealed] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${adminToken}` };

  const load = async () => {
    const [k, u] = await Promise.all([
      fetch("/api/mcp-tokens", { headers }).then((r) => r.json()),
      fetch("/api/agency-users", { headers }).then((r) => r.json()),
    ]);
    setKeys(Array.isArray(k) ? k : []);
    const list = Array.isArray(u) ? u : [];
    setUsers(list);
    if (!userId && list[0]?.id) setUserId(list[0].id);
  };

  useEffect(() => {
    if (isOpen) {
      setRevealed(null);
      void load();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const mint = async () => {
    if (!name.trim() || !userId) {
      toastError("Label and user required");
      return;
    }
    const res = await fetch("/api/mcp-tokens", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), userId, role: role || undefined, expiresInDays }),
    });
    const data = await res.json();
    if (!res.ok) {
      toastError(data.error || "Failed to create key");
      return;
    }
    setRevealed(data.token);
    success("Key created — copy it now. It will not be shown again.");
    void load();
  };

  const revoke = async (id: string) => {
    const res = await fetch(`/api/mcp-tokens/${id}`, { method: "DELETE", headers });
    if (!res.ok) {
      toastError("Failed to revoke");
      return;
    }
    success("Key revoked");
    void load();
  };

  const copy = async (label: string, text: string) => {
    if (!text || text.includes("PLACEHOLDER")) {
      toastError("Empty token — will not copy a placeholder");
      return;
    }
    await navigator.clipboard.writeText(text);
    success(`Copied ${label}`);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[200] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/70" onClick={onClose} />
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2"><Bot className="w-5 h-5 text-blue-400" /> Agent MCP</h2>
              <p className="text-xs text-zinc-500 mt-1">Mint a key, paste it into Hermes / Cursor / Claude, then start a <span className="text-zinc-300">new session</span>. Empty token = silent fail.</p>
            </div>
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          {revealed && (
            <div className="mb-5 rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">Shown once</p>
              <code className="block text-[11px] text-zinc-200 break-all bg-black/40 rounded-lg p-2">{revealed}</code>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => copy("token", revealed)} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-bold text-white flex items-center gap-1"><Copy className="w-3 h-3" /> Token</button>
                <button onClick={() => copy("Hermes YAML", hermesYaml(revealed))} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-bold text-white">Hermes YAML</button>
                <button onClick={() => copy("Cursor JSON", cursorJson(revealed))} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-bold text-white">Cursor JSON</button>
                <button onClick={() => copy("Claude JSON", claudeJson(revealed))} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-bold text-white">Claude JSON</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Label" className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white" />
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white">
              {users.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
            </select>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white">
              <option value="">Same as user</option>
              <option value="super-admin">super-admin</option>
              <option value="graphic-designer">graphic-designer</option>
              <option value="reviewer">reviewer</option>
              <option value="marketing-team">marketing-team</option>
              <option value="user">user (read-only)</option>
            </select>
            <select value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white">
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>365 days</option>
            </select>
            <button onClick={() => void mint()} className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-3 py-2 flex items-center justify-center gap-1">
              <Plus className="w-4 h-4" /> Generate
            </button>
          </div>

          <div className="space-y-2">
            {keys.filter((k) => !k.revoked).length === 0 && <p className="text-xs text-zinc-600">No active keys.</p>}
            {keys.filter((k) => !k.revoked).map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{k.name} <span className="text-zinc-500 font-mono text-[11px]">{k.prefix}…</span></p>
                  <p className="text-[10px] text-zinc-500">{k.username} · {k.role} · exp {k.expiresAt ? k.expiresAt.slice(0, 10) : "—"}</p>
                </div>
                <button onClick={() => void revoke(k.id)} className="p-2 text-zinc-500 hover:text-red-400" title="Revoke"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
