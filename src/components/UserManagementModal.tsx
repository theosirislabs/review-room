import { useState, useEffect } from "react";
import { X, Plus, Trash2, Shield, Edit3 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import { Button } from "./ui/Button";
import Dialog from "./ui/Dialog";
import { useToast } from "./Toast";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  "super-admin": { label: "Super Admin", color: "bg-blue-100 text-blue-700" },
  "graphic-designer": { label: "Graphic Designer", color: "bg-emerald-100 text-emerald-700" },
  "marketing-team": { label: "Marketing Team", color: "bg-cyan-100 text-cyan-700" },
  reviewer: { label: "Reviewer", color: "bg-amber-100 text-amber-700" },
  user: { label: "User (default)", color: "bg-zinc-100 text-zinc-600" },
};

interface TenantOption {
  id: string;
  name: string;
}

interface AgencyUser {
  id: string;
  username: string;
  role: string;
  createdAt?: string;
  hasPassword?: boolean;
  tenantIds?: string[];
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
  const [availableTenants, setAvailableTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "graphic-designer", tenantIds: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string>("graphic-designer");
  const [editPassword, setEditPassword] = useState("");
  const [editTenantIds, setEditTenantIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string; username: string }>({ open: false, id: "", username: "" });

  useEffect(() => {
    if (!isOpen || !adminToken) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${adminToken}` };
    Promise.all([
      fetch("/api/agency-users", { headers }).then(async (response) => {
        if (!response.ok) throw new Error("Could not load agency users");
        return response.json();
      }),
      fetch("/api/tenants", { headers }).then(async (response) => {
        if (!response.ok) throw new Error("Could not load client workspaces");
        return response.json();
      }),
    ])
      .then(([userData, tenantData]) => {
        setUsers(Array.isArray(userData) ? userData : []);
        setAvailableTenants(Array.isArray(tenantData) ? tenantData : []);
      })
      .catch((reason: unknown) => toastError(reason instanceof Error ? reason.message : "Could not load agency users"))
      .finally(() => setLoading(false));
  }, [adminToken, isOpen]);

  const saveNew = async () => {
    if (!form.username.trim()) return toastError("Email / username is required");
    if (form.role !== "super-admin" && form.tenantIds.length === 0) return toastError("Assign at least one client workspace");
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
      setForm({ username: "", password: "", role: "graphic-designer", tenantIds: [] });
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
    if (editRole !== "super-admin" && editTenantIds.length === 0) return toastError("Assign at least one client workspace");
    const body: { role?: string; password?: string; tenantIds?: string[] } = { role: editRole, tenantIds: editTenantIds };
    if (editPassword.trim()) {
      if (editPassword.trim().length < 8) return toastError("Password must be at least 8 characters");
      body.password = editPassword;
    }
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
    const res = await fetch(`/api/agency-users/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError(data.error || "Failed to remove user");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    success("User removed");
    setConfirmDelete({ open: false, id: "", username: "" });
    onRefresh?.();
  };

  if (!isOpen) return null;

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title="User management"
        description="Manage agency login accounts, roles, and client access."
        size="lg"
      >
        <div className="space-y-3">
            {loading ? (
              <div className="text-center py-8 text-zinc-400">Loading...</div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-zinc-400 text-sm">No agency users yet.</div>
            ) : (
              users.map((u) => (
                <div key={u.id} className="flex items-center gap-4 p-4 bg-zinc-50 rounded-xl border border-zinc-100 group">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm shrink-0">
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-zinc-900 text-sm truncate">{u.username}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${ROLE_LABELS[u.role]?.color || "bg-zinc-100 text-zinc-600"}`}>
                      {ROLE_LABELS[u.role]?.label || u.role}
                    </span>
                     <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-500">
                       {u.hasPassword ? "Password" : "SSO"}
                     </span>
                     <span className="text-[9px] font-semibold text-zinc-500">
                       {u.role === "super-admin" ? "All workspaces" : `${u.tenantIds?.length || 0} workspace${u.tenantIds?.length === 1 ? "" : "s"}`}
                     </span>
                    </div>
                  </div>
                  {editingId === u.id ? (
                    <div className="flex flex-col gap-2">
                      <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="text-xs border border-zinc-200 rounded-lg px-2 py-1 outline-none bg-white text-zinc-900">
                        <option value="super-admin">Super Admin</option>
                        <option value="graphic-designer">Graphic Designer</option>
                        <option value="marketing-team">Marketing Team</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="user">User (read-only)</option>
                      </select>
                       <input
                         type="password"
                         placeholder="New password (optional)"
                         value={editPassword}
                         onChange={(e) => setEditPassword(e.target.value)}
                         className="text-xs border border-zinc-200 rounded-lg px-2 py-1 outline-none w-36 bg-white text-zinc-900 placeholder:text-zinc-400"
                       />
                       {editRole !== "super-admin" && (
                         <fieldset className="rounded-lg border border-zinc-200 bg-white p-2">
                           <legend className="px-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Client access</legend>
                           <div className="grid max-h-24 gap-1 overflow-y-auto">
                             {availableTenants.map((tenant) => (
                               <label key={tenant.id} className="flex items-center gap-2 text-xs text-zinc-700">
                                 <input type="checkbox" checked={editTenantIds.includes(tenant.id)} onChange={() => setEditTenantIds((prev) => prev.includes(tenant.id) ? prev.filter((id) => id !== tenant.id) : [...prev, tenant.id])} />
                                 <span>{tenant.name}</span>
                               </label>
                             ))}
                           </div>
                         </fieldset>
                       )}
                       <div className="flex gap-1">
                         <Button size="sm" onClick={() => updateUser(u.id)}>Save</Button>
                         <button type="button" aria-label="Cancel editing" onClick={() => { setEditingId(null); setEditPassword(""); }} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-0.5">
                       <button type="button" aria-label={`Edit ${u.username}`} onClick={() => { setEditingId(u.id); setEditRole(u.role); setEditPassword(""); setEditTenantIds(u.tenantIds || []); }} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                       <button type="button" aria-label={`Remove ${u.username}`} onClick={() => setConfirmDelete({ open: true, id: u.id, username: u.username })} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}

            {adding ? (
              <div className="p-5 bg-blue-50 rounded-xl border border-blue-100 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-blue-700">Add User</h3>
                <input className="w-full px-3 py-2.5 bg-white border border-blue-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-400 outline-none" placeholder="Email (for SSO) *" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
                <input className="w-full px-3 py-2.5 bg-white border border-blue-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-400 outline-none" placeholder="Password (optional — leave blank for SSO only)" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
                 <select className="w-full px-3 py-2.5 bg-white border border-blue-200 rounded-xl text-sm text-zinc-900 focus:ring-2 focus:ring-blue-400 outline-none" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
                   <option value="super-admin">Super Admin</option>
                   <option value="graphic-designer">Graphic Designer</option>
                   <option value="marketing-team">Marketing Team</option>
                   <option value="reviewer">Reviewer</option>
                   <option value="user">User (read-only)</option>
                 </select>
                 {form.role !== "super-admin" && (
                   <fieldset className="rounded-xl border border-blue-100 bg-white p-3">
                     <legend className="px-1 text-[10px] font-bold uppercase tracking-widest text-blue-700">Client access</legend>
                     <div className="grid gap-2 sm:grid-cols-2">
                       {availableTenants.map((tenant) => (
                         <label key={tenant.id} className="flex items-center gap-2 text-xs text-zinc-700">
                           <input type="checkbox" checked={form.tenantIds.includes(tenant.id)} onChange={() => setForm((p) => ({ ...p, tenantIds: p.tenantIds.includes(tenant.id) ? p.tenantIds.filter((id) => id !== tenant.id) : [...p.tenantIds, tenant.id] }))} />
                           <span>{tenant.name}</span>
                         </label>
                       ))}
                     </div>
                   </fieldset>
                 )}
                 <div className="flex gap-2">
                   <Button variant="secondary" className="flex-1" onClick={() => setAdding(false)}>Cancel</Button>
                   <Button className="flex-[2]" onClick={saveNew} disabled={saving}>
                     {saving ? "Adding..." : "Add User"}
                   </Button>
                 </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-zinc-200 hover:border-blue-400 hover:text-blue-600 text-zinc-400 rounded-xl text-sm font-bold transition-all">
                <Plus className="w-4 h-4" /> Add User
              </button>
            )}
          </div>

          <div className="mt-5 flex items-center gap-2 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
            <Shield className="h-3.5 w-3.5" />
            <span>New users start with no client access until a Super Admin assigns it. Super Admin accounts can see all workspaces.</span>
          </div>
      </Dialog>

      <ConfirmDialog
        isOpen={confirmDelete.open}
        title={`Remove ${confirmDelete.username}?`}
        message="This will revoke their login access. They will no longer be able to sign in."
        confirmLabel="Remove"
        destructive
        onConfirm={() => { deleteUser(confirmDelete.id); setConfirmDelete({ open: false, id: "", username: "" }); }}
        onCancel={() => setConfirmDelete({ open: false, id: "", username: "" })}
      />
    </>
  );
}
