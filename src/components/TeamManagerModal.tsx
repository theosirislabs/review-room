import { useState } from "react";
import { TeamMember } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Trash2, Shield, Edit3 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
    admin: { label: "Admin", color: "bg-indigo-100 text-indigo-700" },
    editor: { label: "Editor", color: "bg-emerald-100 text-emerald-700" },
    viewer: { label: "Viewer", color: "bg-zinc-100 text-zinc-600" },
};

interface Props {
    isOpen: boolean;
    onClose: () => void;
    adminToken: string;
    members: TeamMember[];
    onRefresh: () => void;
    canManage?: boolean;
}

export default function TeamManagerModal({ isOpen, onClose, adminToken, members, onRefresh, canManage = true }: Props) {
    const { success, error: toastError } = useToast();
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", role: "editor" });
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editRole, setEditRole] = useState<string>("editor");
    const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: "", name: "" });

    const saveNew = async () => {
        if (!form.name.trim() || !form.email.trim()) return toastError("Name and email are required");
        setSaving(true);
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                body: JSON.stringify(form),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            success(`${form.name} added to the team`);
            setForm({ name: "", email: "", role: "editor" });
            setAdding(false);
            onRefresh();
        } catch (e: any) { toastError(e.message); } finally { setSaving(false); }
    };

    const updateRole = async (id: string) => {
        await fetch(`/api/users/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ role: editRole }),
        });
        success("Role updated");
        setEditingId(null);
        onRefresh();
    };

    const deleteMember = async (id: string) => {
        await fetch(`/api/users/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
        success("Team member removed");
        onRefresh();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, y: 20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.95, y: 20, opacity: 0 }}
                    className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-black text-zinc-900">Team Members</h2>
                            <p className="text-sm text-zinc-400 mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""} in this workspace</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-xl transition-colors">
                            <X className="w-5 h-5 text-zinc-400" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-3">
                        {members.map(m => (
                            <div key={m.id} className="flex items-center gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group">
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                                    {m.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-zinc-900 text-sm truncate">{m.name}</p>
                                    <p className="text-xs text-zinc-400 truncate">{m.email}</p>
                                </div>
                                {canManage && editingId === m.id ? (
                                    <div className="flex items-center gap-2">
                                        <select value={editRole} onChange={e => setEditRole(e.target.value)} className="text-xs border border-zinc-200 rounded-lg px-2 py-1 outline-none bg-white text-zinc-900">
                                            <option value="admin">Admin</option>
                                            <option value="editor">Editor</option>
                                            <option value="viewer">Viewer</option>
                                        </select>
                                        <button onClick={() => updateRole(m.id)} className="text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg font-bold">Save</button>
                                        <button onClick={() => setEditingId(null)} className="text-xs text-zinc-400 px-2 py-1">✕</button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${ROLE_LABELS[m.role]?.color}`}>
                                            {ROLE_LABELS[m.role]?.label}
                                        </span>
                                        {canManage && (
                                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setEditingId(m.id); setEditRole(m.role); }} className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors text-zinc-300">
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => setConfirmDelete({ open: true, id: m.id, name: m.name })} className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-zinc-300">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {canManage && adding ? (
                            <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-3">
                                <h3 className="text-xs font-black uppercase tracking-widest text-indigo-700">Add Team Member</h3>
                                <input className="w-full px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-400 outline-none" placeholder="Full name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                                <input className="w-full px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-400 outline-none" placeholder="Email address *" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                                <select className="w-full px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm text-zinc-900 focus:ring-2 focus:ring-indigo-400 outline-none" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                                    <option value="admin">Admin — full access</option>
                                    <option value="editor">Editor — can create & edit posts</option>
                                    <option value="viewer">Viewer — read only</option>
                                </select>
                                <div className="flex gap-2">
                                    <button onClick={() => setAdding(false)} className="flex-1 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl transition-colors">Cancel</button>
                                    <button onClick={saveNew} disabled={saving} className="flex-[2] py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors disabled:opacity-50">
                                        {saving ? "Adding..." : "Add Member"}
                                    </button>
                                </div>
                            </div>
                        ) : canManage ? (
                            <button onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-zinc-200 hover:border-indigo-400 hover:text-indigo-600 text-zinc-400 rounded-2xl text-sm font-bold transition-all">
                                <Plus className="w-4 h-4" /> Add Team Member
                            </button>
                        ) : null}
                    </div>

                    <div className="px-6 py-4 border-t border-zinc-100 flex items-center gap-2 text-xs text-zinc-400">
                        <Shield className="w-3.5 h-3.5" />
                        <span>Role permissions: Admin can manage clients & team · Editor can manage posts · Viewer is read-only</span>
                    </div>
                </motion.div>
            </motion.div>

            <ConfirmDialog
                isOpen={confirmDelete.open}
                title={`Remove ${confirmDelete.name}?`}
                message="This will remove them from the team. They will lose access to all workspaces."
                confirmLabel="Remove"
                destructive
                onConfirm={() => { deleteMember(confirmDelete.id); setConfirmDelete(p => ({ ...p, open: false })); }}
                onCancel={() => setConfirmDelete(p => ({ ...p, open: false }))}
            />
        </AnimatePresence>
    );
}
