import { useState, useEffect } from "react";
import { Campaign, ContentPillar } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Trash2, Edit3, Calendar, Tag, Palette } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

const PRESET_COLORS = [
    "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b",
    "#10b981", "#3b82f6", "#14b8a6", "#f97316", "#84cc16",
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    tenantId: string;
    adminToken: string;
    emit: (event: string, data: any) => void;
    onRefresh?: () => void;
}

export default function CampaignManagerModal({ isOpen, onClose, tenantId, adminToken, emit }: Props) {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [pillars, setPillars] = useState<ContentPillar[]>([]);
    const [activeTab, setActiveTab] = useState<"campaigns" | "pillars">("campaigns");
    const [loading, setLoading] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<Partial<Campaign> | null>(null);
    const [newPillarName, setNewPillarName] = useState("");
    const [newPillarColor, setNewPillarColor] = useState("#6366f1");
    const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; label: string; onConfirm: () => void }>({
        open: false, label: "", onConfirm: () => { }
    });

    const loadData = () => {
        setLoading(true);
        Promise.all([
            fetch(`/api/campaigns?tenantId=${tenantId}`, { headers: { Authorization: `Bearer ${adminToken}` } }).then(r => r.json()),
            fetch(`/api/pillars?tenantId=${tenantId}`, { headers: { Authorization: `Bearer ${adminToken}` } }).then(r => r.json()),
        ]).then(([c, p]) => { setCampaigns(c); setPillars(p); }).finally(() => setLoading(false));
    };

    useEffect(() => { if (isOpen) loadData(); }, [isOpen, tenantId]);

    const saveCampaign = () => {
        if (!editingCampaign?.name) return;
        if (editingCampaign.id) {
            emit("update-campaign", { tenantId, campaign: editingCampaign, adminToken });
            setCampaigns(prev => prev.map(c => c.id === editingCampaign.id ? { ...c, ...editingCampaign } as Campaign : c));
        } else {
            emit("create-campaign", { tenantId, campaign: editingCampaign, adminToken });
            // Optimistic add
            const optimistic = { ...editingCampaign, id: `opt-${Date.now()}`, tenantId, createdAt: new Date().toISOString() } as Campaign;
            setCampaigns(prev => [...prev, optimistic]);
            setTimeout(loadData, 300); // reload to get real ID
        }
        setEditingCampaign(null);
    };

    const deleteCampaign = (id: string) => {
        emit("delete-campaign", { tenantId, campaignId: id, adminToken });
        setCampaigns(prev => prev.filter(c => c.id !== id));
    };

    const addPillar = () => {
        if (!newPillarName.trim()) return;
        emit("create-pillar", { tenantId, pillar: { name: newPillarName.trim(), color: newPillarColor }, adminToken });
        setPillars(prev => [...prev, { id: `opt-${Date.now()}`, tenantId, name: newPillarName.trim(), color: newPillarColor }]);
        setNewPillarName("");
        setTimeout(loadData, 300);
    };

    const deletePillar = (id: string) => {
        emit("delete-pillar", { tenantId, pillarId: id, adminToken });
        setPillars(prev => prev.filter(p => p.id !== id));
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
                    className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-black text-zinc-900">Campaign Manager</h2>
                            <p className="text-sm text-zinc-400 mt-0.5">Manage campaigns and content pillars for this workspace</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-xl transition-colors">
                            <X className="w-5 h-5 text-zinc-400" />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="px-6 pt-4 flex gap-1 bg-zinc-50">
                        {(["campaigns", "pillars"] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-t-xl text-sm font-bold transition-all capitalize ${activeTab === tab ? "bg-white text-zinc-900 shadow-sm border-t border-x border-zinc-200" : "text-zinc-400 hover:text-zinc-600"}`}
                            >
                                {tab === "campaigns" ? "Campaigns" : "Content Pillars"}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {loading ? (
                            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-zinc-100 rounded-2xl animate-pulse" />)}</div>
                        ) : activeTab === "campaigns" ? (
                            <div className="space-y-4">
                                {/* Campaign List */}
                                <div className="space-y-3">
                                    {campaigns.map(c => (
                                        <div key={c.id} className="flex items-center gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group">
                                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-zinc-900 text-sm truncate">{c.name}</p>
                                                    <span className="text-[10px] font-mono bg-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">{c.code}</span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-zinc-400">
                                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{c.startDate} → {c.endDate}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setEditingCampaign(c)} className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors text-zinc-400">
                                                    <Edit3 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDelete({ open: true, label: `Delete "${c.name}"?`, onConfirm: () => deleteCampaign(c.id) })}
                                                    className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-zinc-400"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Edit/Create Campaign Form */}
                                {editingCampaign && (
                                    <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-3">
                                        <h3 className="text-sm font-black text-indigo-900 uppercase tracking-wider">{editingCampaign.id ? "Edit Campaign" : "New Campaign"}</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <input className="col-span-2 px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-400 outline-none" placeholder="Campaign name *" value={editingCampaign.name || ""} onChange={e => setEditingCampaign(p => ({ ...p, name: e.target.value }))} />
                                            <input className="px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-400 outline-none uppercase" placeholder="Code (e.g. SPR26)" value={editingCampaign.code || ""} onChange={e => setEditingCampaign(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
                                            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-indigo-200 rounded-xl">
                                                <Palette className="w-4 h-4 text-zinc-400" />
                                                <div className="flex gap-1 flex-wrap">
                                                    {PRESET_COLORS.map(color => (
                                                        <button key={color} onClick={() => setEditingCampaign(p => ({ ...p, color }))} className={`w-4 h-4 rounded-full transition-transform ${editingCampaign.color === color ? "scale-125 ring-2 ring-offset-1 ring-zinc-400" : "hover:scale-110"}`} style={{ backgroundColor: color }} />
                                                    ))}
                                                </div>
                                            </div>
                                            <input type="date" className="px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 outline-none" value={editingCampaign.startDate || ""} onChange={e => setEditingCampaign(p => ({ ...p, startDate: e.target.value }))} />
                                            <input type="date" className="px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 outline-none" value={editingCampaign.endDate || ""} onChange={e => setEditingCampaign(p => ({ ...p, endDate: e.target.value }))} />
                                            <input className="col-span-2 px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 outline-none" placeholder="Description (optional)" value={editingCampaign.description || ""} onChange={e => setEditingCampaign(p => ({ ...p, description: e.target.value }))} />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setEditingCampaign(null)} className="flex-1 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl transition-colors">Cancel</button>
                                            <button onClick={saveCampaign} className="flex-[2] py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors">Save Campaign</button>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => setEditingCampaign({ color: "#6366f1" })}
                                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-zinc-200 hover:border-indigo-400 hover:text-indigo-600 text-zinc-400 rounded-2xl text-sm font-bold transition-all"
                                >
                                    <Plus className="w-4 h-4" /> New Campaign
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    {pillars.map(p => (
                                        <div key={p.id} className="flex items-center gap-3 px-4 py-3 bg-zinc-50 rounded-2xl border border-zinc-100 group">
                                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                                            <span className="text-sm font-semibold text-zinc-800 flex-1">{p.name}</span>
                                            <button
                                                onClick={() => setConfirmDelete({ open: true, label: `Delete "${p.name}" pillar?`, onConfirm: () => deletePillar(p.id) })}
                                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all text-zinc-400"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-3">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Add Pillar</h3>
                                    <input className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-400 outline-none" placeholder="Pillar name (e.g. Education)" value={newPillarName} onChange={e => setNewPillarName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPillar()} />
                                    <div className="flex items-center gap-2">
                                        <Tag className="w-4 h-4 text-zinc-400" />
                                        <div className="flex gap-1.5 flex-wrap">
                                            {PRESET_COLORS.map(color => (
                                                <button key={color} onClick={() => setNewPillarColor(color)} className={`w-5 h-5 rounded-full transition-transform ${newPillarColor === color ? "scale-125 ring-2 ring-offset-1 ring-zinc-400" : "hover:scale-110"}`} style={{ backgroundColor: color }} />
                                            ))}
                                        </div>
                                        <button onClick={addPillar} disabled={!newPillarName.trim()} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-40">
                                            <Plus className="w-3.5 h-3.5" /> Add
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>

            <ConfirmDialog
                isOpen={confirmDelete.open}
                title="Confirm Delete"
                message={confirmDelete.label}
                confirmLabel="Delete"
                destructive
                onConfirm={() => { confirmDelete.onConfirm(); setConfirmDelete(p => ({ ...p, open: false })); }}
                onCancel={() => setConfirmDelete(p => ({ ...p, open: false }))}
            />
        </AnimatePresence>
    );
}
