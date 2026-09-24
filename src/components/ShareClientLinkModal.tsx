import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { Copy, Link2, Loader2, ShieldCheck, X } from "lucide-react";
import { useToast } from "./Toast";
import {
  normalizeReviewerName,
  readReviewerPreference,
  saveReviewerPreference,
  withReviewerFragment,
} from "../reviewerProfile";

interface Tenant {
  id: string;
  name: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
  adminToken: string;
  currentUser?: { id: string; username: string; role: string } | null;
  includeAgencyLink?: boolean;
}

interface InviteLinks {
  clientUrl?: string;
  agencyUrl?: string;
}

export default function ShareClientLinkModal({
  isOpen,
  onClose,
  tenant,
  adminToken,
  currentUser,
  includeAgencyLink = false,
}: Props) {
  const { success, error: toastError } = useToast();
  const [links, setLinks] = useState<InviteLinks | null>(null);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState<"client" | "agency" | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [rememberReviewer, setRememberReviewer] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const helperId = useId();

  const normalizedReviewerName = normalizeReviewerName(reviewerName);
  const clientLink = links?.clientUrl
    ? withReviewerFragment(links.clientUrl, normalizedReviewerName)
    : "";

  useEffect(() => {
    if (!isOpen) return;
    setLinks(null);
    setError("");
    setCopying(null);
    const preference = readReviewerPreference(currentUser?.id, tenant?.id);
    setReviewerName(preference.name);
    setRememberReviewer(preference.remember);
    setLoading(Boolean(tenant && adminToken));
    if (!tenant || !adminToken) return;

    let active = true;
    fetch(`/api/tenants/${tenant.id}/invite`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      credentials: "include",
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load client access links.");
        if (!active) return;
        setLinks(data as InviteLinks);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Could not load client access links.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [adminToken, currentUser?.id, isOpen, tenant?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !tenant) return null;

  const copyLink = async (type: "client" | "agency") => {
    const name = normalizedReviewerName;
    const url = type === "client"
      ? (name && links?.clientUrl ? withReviewerFragment(links.clientUrl, name) : "")
      : links?.agencyUrl || "";
    if (type === "client" && !name) {
      setError("Enter a reviewer's name before copying the client link.");
      inputRef.current?.focus();
      return;
    }
    if (!url) {
      setError("The link is not available yet. Try again in a moment.");
      return;
    }

    setCopying(type);
    setError("");
    try {
      await navigator.clipboard.writeText(url);
      if (type === "client") {
        saveReviewerPreference(currentUser?.id, tenant.id, { name, remember: rememberReviewer });
        success(`Client link copied for ${name}.`);
      } else {
        success("Agency link copied.");
      }
    } catch {
      setError("Could not copy the link. Check clipboard access and try again.");
      toastError("Could not copy the link.");
    } finally {
      setCopying(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-title`}
        aria-describedby={`${fieldId}-description`}
      >
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h2 id={`${fieldId}-title`} className="text-xl font-bold text-zinc-900">Share client review</h2>
            <p id={`${fieldId}-description`} className="text-xs text-zinc-500 mt-1">
              Give {tenant.name} a named review link. The name stays in the link fragment and is not stored by the server.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors" aria-label="Close share dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
            <label htmlFor={fieldId} className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Reviewer's name <span className="text-emerald-600">required</span>
            </label>
            <input
              ref={inputRef}
              id={fieldId}
              value={reviewerName}
              onChange={(event) => {
                setReviewerName(event.target.value);
                if (error) setError("");
              }}
              maxLength={80}
              autoComplete="name"
              placeholder="e.g. Jordan Lee"
              aria-describedby={helperId}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
            />
            <p id={helperId} className="text-[11px] text-zinc-500 leading-relaxed">
              Used to personalize the link and label feedback. It does not verify identity.
            </p>
            <label className="flex items-start gap-2 text-xs text-zinc-700 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberReviewer}
                onChange={(event) => {
                  setRememberReviewer(event.target.checked);
                  if (!event.target.checked) saveReviewerPreference(currentUser?.id, tenant.id, { name: normalizedReviewerName, remember: false });
                }}
                className="mt-0.5 accent-emerald-600"
              />
              <span>Remember this reviewer's name for {tenant.name} on this browser</span>
            </label>
          </div>

          {error && <p role="alert" className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
              <Link2 className="w-3.5 h-3.5" /> Client review link
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                value={loading ? "Loading secure link…" : clientLink || "Client link unavailable"}
                aria-label="Client review link"
                className="min-w-0 flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs font-mono text-emerald-700 truncate"
              />
              <button
                type="button"
                onClick={() => void copyLink("client")}
                disabled={loading || copying !== null || !normalizedReviewerName || !links?.clientUrl}
                aria-label="Copy client review link"
                className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors active:scale-95"
              >
                {copying === "client" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-emerald-800/80">The reviewer name is added only when you copy.</p>
          </div>

          {includeAgencyLink && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-700">
                <ShieldCheck className="w-3.5 h-3.5" /> Agency access link
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={loading ? "Loading secure link…" : links?.agencyUrl || "Agency link unavailable"}
                  aria-label="Agency access link"
                  className="min-w-0 flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-2 text-xs font-mono text-indigo-700 truncate"
                />
                <button
                  type="button"
                  onClick={() => void copyLink("agency")}
                  disabled={loading || copying !== null || !links?.agencyUrl}
                  aria-label="Copy agency access link"
                  className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors active:scale-95"
                >
                  {copying === "agency" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-zinc-500 leading-relaxed border border-zinc-100 rounded-xl p-3 bg-zinc-50/80">
            <span className="font-bold text-zinc-700">Single post?</span> Open a post in the client view and use its share button. The reviewer name is carried there too.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
