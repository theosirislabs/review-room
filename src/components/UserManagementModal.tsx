import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Trash2, Shield, Edit3 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  "super-admin": { label: "Super Admin", color: "bg-indigo-100 text-indigo-700" },
  "graphic-designer": { label: "Graphic Designer", color: "bg-emerald-100 text-emerald-700" },
  "marketing-team": { label: "Marketing Team", color: "bg-purple-100 text-purple-700" },
  reviewer: { label: "Reviewer", color: "bg-amber-100 text-amber-700" },
};

interface AgencyUser {
  id: string;
  username: string;
  role: string;
  createdAt?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  adminToken: string;
  onRefresh?: () => void;
}

export default function UserManagementModal({ isOpen, onClose, adminToken, onRefresh }: Props) {
  const { success, error: toastError } = useToast();
  const [users, setUsers] = useState<AgencyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "graphic-designer" });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string>("graphic-designer");
  const [editPassword, setEditPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string; username: string }>({ open: false, id: "", username: "" });

  useEffect(() => {
    if (isOpen && adminToken) {
      setLoading(true);
      fetch("/api/agency-users", { headers: { Authorization: `Bearer ${adminToken}` } })
        .then((r) => r.json())
        .then((data) => setUsers(Array.isArray(data) ? data : []))
        .catch(() => setUsers([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, adminToken]);

  const saveNew = async () => {
    if (!form.username.trim() || !form.password.trim()) return toastError("Username and password are required");
    setSaving(true);
    try {
      const res = await fetch("/api/agency-users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add user");
      success(`${form.username} added`);
      setForm({ username: "", password: "", role: "graphic-designer" });
      setAdding(false);
      setUsers((prev) => [...prev, data]);
      onRefresh?.();
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (id: string) => {
    const body: { role?: string; password?: string } = { role: editRole };
    if (editPassword.trim()) body.password = editPassword;
    const res = await fetch(`/api/agency-users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toastError(data.error || "Failed to update");
      return;
    }
    const updated = await res.json();
    setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    setEditingId(null);
    setEditPassword("");
    success("User updated");
    onRefresh?.();
  };

  const deleteUser = async (id: string) => {
    await fetch(`/api/agency-users/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
    setUsers((prev) => prev.filter((u) => u.id !== id));
    success("User removed");
    setConfirmDelete({ open: false, id: "", username: "" });
    onRefresh?.();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 20, opacity: 0 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-zinc-900">User Management</h2>
              <p className="text-sm text-zinc-400 mt-0.5">Agency login accounts and roles</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-xl transition-colors">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {loading ? (
              <div className="text-center py-8 text-zinc-400">Loading...</div>
            ) : (
              users.map((u) => (
                <div key={u.id} className="flex items-center gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-zinc-900 text-sm truncate">{u.username}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${ROLE_LABELS[u.role]?.color || "bg-zinc-100 text-zinc-600"}`}>
                      {ROLE_LABELS[u.role]?.label || u.role}
                    </span>
                  </div>
                  {editingId === u.id ? (
                    <div className="flex flex-col gap-2">
                      <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="text-xs border border-zinc-200 rounded-lg px-2 py-1 outline-none bg-white text-zinc-900">
                        <option value="super-admin">Super Admin</option>
                        <option value="graphic-designer">Graphic Designer</option>
                        <option value="marketing-team">Marketing Team</option>
                        <option value="reviewer">Reviewer</option>
                      </select>
                      <input
                        type="password"
                        placeholder="New password (optional)"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        className="text-xs border border-zinc-200 rounded-lg px-2 py-1 outline-none w-36 bg-white text-zinc-900 placeholder:text-zinc-400"
                      />
                      <div className="flex gap-1">
                        <button onClick={() => updateUser(u.id)} className="text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg font-bold">Save</button>
                        <button onClick={() => { setEditingId(null); setEditPassword(""); }} className="text-xs text-zinc-400 px-2 py-1">✕</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingId(u.id); setEditRole(u.role); setEditPassword(""); }} className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors text-zinc-300">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDelete({ open: true, id: u.id, username: u.username })} className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-zinc-300">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}

            {adding ? (
              <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-indigo-700">Add User</h3>
                <input className="w-full px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-400 outline-none" placeholder="Username *" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
                <input className="w-full px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-400 outline-none" placeholder="Password *" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
                <select className="w-full px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm text-zinc-900 focus:ring-2 focus:ring-indigo-400 outline-none" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
                  <option value="super-admin">Super Admin</option>
                  <option value="graphic-designer">Graphic Designer</option>
                  <option value="marketing-team">Marketing Team</option>
                  <option value="reviewer">Reviewer</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={() => setAdding(false)} className="flex-1 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl transition-colors">Cancel</button>
                  <button onClick={saveNew} disabled={saving} className="flex-[2] py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors disabled:opacity-50">
                    {saving ? "Adding..." : "Add User"}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-zinc-200 hover:border-indigo-400 hover:text-indigo-600 text-zinc-400 rounded-2xl text-sm font-bold transition-all">
                <Plus className="w-4 h-4" /> Add User
              </button>
            )}
          </div>

          <div className="px-6 py-4 border-t border-zinc-100 flex items-center gap-2 text-xs text-zinc-400">
            <Shield className="w-3.5 h-3.5" />
            <span>Super Admin: full access · Graphic Designer: create/edit content · Marketing: schedule/post · Reviewer: QA & approve</span>
          </div>
        </motion.div>
      </motion.div>

      <ConfirmDialog
        isOpen={confirmDelete.open}
        title={`Remove ${confirmDelete.username}?`}
        message="This will revoke their login access. They will no longer be able to sign in."
        confirmLabel="Remove"
        destructive
        onConfirm={() => { deleteUser(confirmDelete.id); setConfirmDelete({ open: false, id: "", username: "" }); }}
        onCancel={() => setConfirmDelete({ open: false, id: "", username: "" })}
      />
    </AnimatePresence>
  );
}
