import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Trash2, Save, ShieldCheck, Upload } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";

interface Tenant {
    id: string;
    name: string;
    logoUrl: string;
    bio?: string;
    settings: any;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    tenants: Tenant[];
    onUpsert: (t: any) => void;
    onDelete: (id: string) => void;
    startMode?: "list" | "new";
}

export default function TenantManagerModal({ isOpen, onClose, tenants, onUpsert, onDelete, startMode = "list" }: Props) {
    const [editingId, setEditingId] = useState<string | null>(null);

    // Sync editingId with startMode when modal opens
    useEffect(() => {
        if (isOpen) {
            if (startMode === "new") {
                setEditingId("new");
                setForm({ id: "", name: "", logoUrl: "/logo.svg", bio: "", settings: {} });
            } else {
                setEditingId(null);
            }
        }
    }, [isOpen, startMode]);

    const [form, setForm] = useState({ id: "", name: "", logoUrl: "", bio: "", settings: {} });
    const [uploading, setUploading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string; name: string }>({
        open: false, id: "", name: "",
    });
    const { success, error: toastError } = useToast();

    const startNew = () => {
        setEditingId("new");
        setForm({ id: "", name: "", logoUrl: "/logo.svg", bio: "", settings: {} });
    };

    const startEdit = (t: Tenant) => {
        setEditingId(t.id);
        setForm({ id: t.id, name: t.name, logoUrl: t.logoUrl, bio: t.bio || "", settings: t.settings || {} });
    };

    const handleLogoUpload = async (file: File) => {
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Upload failed");
            }
            const data = await res.json();
            setForm(f => ({ ...f, logoUrl: data.url }));
            success("Logo uploaded successfully");
        } catch (err: any) {
            toastError(err.message || "Failed to upload logo");
        } finally {
            setUploading(false);
        }
    };

    const save = () => {
        if (!form.id.trim() || !form.name.trim()) {
            toastError("Unique Slug and Brand Name are required");
            return;
        }
        onUpsert(form);
        success("Brand settings saved");
        setEditingId(null);
    };

    const askDelete = (t: Tenant) => {
        setConfirmDelete({ open: true, id: t.id, name: t.name });
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-md"
                        onClick={onClose}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                                        <ShieldCheck className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-zinc-900">Client Management</h2>
                                        <p className="text-xs text-zinc-500">Configure client brands and workspaces</p>
                                    </div>
                                </div>
                                <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-zinc-400" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-auto p-6 flex gap-6">
                                {/* Tenants list */}
                                <div className="w-1/2 space-y-2">
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">All Clients</span>
                                        <button onClick={startNew} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> Add New
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        {tenants.map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => startEdit(t)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${editingId === t.id
                                                    ? "bg-indigo-50 border-indigo-100 shadow-sm"
                                                    : "bg-white border-zinc-100 hover:border-zinc-200"
                                                    }`}
                                            >
                                                <img
                                                    src={t.logoUrl}
                                                    alt={t.name}
                                                    className="w-8 h-8 rounded bg-zinc-100 object-cover shrink-0"
                                                    referrerPolicy="no-referrer"
                                                    onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${t.name}`; }}
                                                />
                                                <div className="text-left min-w-0">
                                                    <p className={`text-sm font-semibold truncate ${editingId === t.id ? "text-indigo-900" : "text-zinc-900"}`}>{t.name}</p>
                                                    <p className="text-[10px] text-zinc-400 font-mono truncate">{t.id}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Edit form */}
                                <div className="w-1/2 bg-zinc-50 rounded-2xl p-5 border border-zinc-100">
                                    {editingId ? (
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-bold text-zinc-900">
                                                {editingId === "new" ? "Create New Brand" : "Edit Brand Settings"}
                                            </h3>

                                            <div>
                                                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1.5 ml-1">Unique Slug (ID)</label>
                                                <input
                                                    disabled={editingId !== "new"}
                                                    value={form.id}
                                                    onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })}
                                                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-zinc-100"
                                                    placeholder="e.g. apple-inc"
                                                />
                                                {editingId === "new" && (
                                                    <p className="text-[10px] text-zinc-400 mt-1 ml-1">Lowercase letters, numbers, and hyphens only. Cannot be changed later.</p>
                                                )}
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1.5 ml-1">Brand Name</label>
                                                <input
                                                    value={form.name}
                                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-500"
                                                    placeholder="e.g. Apple Worldwide"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1.5 ml-1">Profile Picture (Logo)</label>
                                                <div className="flex items-start gap-4">
                                                    <img
                                                        src={form.logoUrl}
                                                        alt={`${form.name || "Brand"} logo`}
                                                        className="w-16 h-16 rounded-xl bg-zinc-100 object-cover border border-zinc-200 shadow-sm shrink-0"
                                                        referrerPolicy="no-referrer"
                                                        onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${form.name || "Brand"}`; }}
                                                    />
                                                    <div className="flex-1 space-y-2">
                                                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-zinc-800 transition-all active:scale-95 shadow-lg shadow-indigo-500/10 w-full justify-center">
                                                            <Plus className="w-4 h-4" />
                                                            {uploading ? "Uploading…" : "Change Logo"}
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                accept="image/*"
                                                                onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                                                            />
                                                        </label>
                                                        <p className="text-[10px] text-zinc-400 text-center px-2 font-medium">Click above to upload a new profile picture. Direct URL entry is disabled for security.</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1.5 ml-1">Client Bio</label>
                                                <textarea
                                                    value={form.bio}
                                                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                                                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-500 min-h-[80px] resize-none"
                                                    placeholder="Brief description of the client/brand…"
                                                />
                                            </div>

                                            <div className="pt-4 flex items-center gap-3 mt-auto">
                                                <button
                                                    onClick={save}
                                                    disabled={!form.id.trim() || !form.name.trim()}
                                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm active:scale-95"
                                                >
                                                    <Save className="w-4 h-4" /> Save Changes
                                                </button>
                                                {editingId !== "new" && (
                                                    <button
                                                        onClick={() => askDelete(tenants.find((t) => t.id === editingId)!)}
                                                        className="w-10 h-10 bg-red-50 text-red-600 border border-red-100 flex items-center justify-center rounded-xl hover:bg-red-200 transition-colors shadow-sm active:scale-95 shrink-0"
                                                        title="Delete this client"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-center p-4">
                                            <div className="w-12 h-12 rounded-full bg-zinc-200 flex items-center justify-center mb-3">
                                                <ShieldCheck className="w-6 h-6 text-zinc-400" />
                                            </div>
                                            <p className="text-sm font-semibold text-zinc-400">Select a client to manage their settings</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-3 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between text-[10px] text-zinc-400 font-medium">
                                <span>Dynamic Client Routing Active</span>
                                <div className="flex items-center gap-4">
                                    <span className="flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Database WAL-Sync
                                    </span>
                                    <span>v2.1.0-Admin</span>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Confirm Delete Dialog — replaces native confirm() */}
            <ConfirmDialog
                isOpen={confirmDelete.open}
                title={`Delete "${confirmDelete.name}"?`}
                message={`This will permanently delete this client and ALL their posts, comments, and tasks. This action cannot be undone.`}
                confirmLabel="Delete Client"
                destructive
                onConfirm={() => {
                    onDelete(confirmDelete.id);
                    setConfirmDelete({ open: false, id: "", name: "" });
                    setEditingId(null);
                }}
                onCancel={() => setConfirmDelete({ open: false, id: "", name: "" })}
            />
        </>
    );
}
