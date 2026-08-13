"use client";

import { useEffect, useState } from "react";

function GlassCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: "rgba(11,26,59,0.55)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}
    >
      {children}
    </div>
  );
}

const inputStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
};

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * AdminUsersPanel — list, add, and remove admins.
 *
 * Two kinds of admins exist:
 *  • "env"  — hardcoded via ADMIN_EMAILS. Shown with a lock badge and
 *             not removable from the UI (must edit env vars).
 *  • "db"   — added through this panel via /api/admin/admins. Removable.
 */
export default function AdminUsersPanel({ apiFetch, onError, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState([]);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingEmail, setRemovingEmail] = useState(null);
  const [confirmRemoveEmail, setConfirmRemoveEmail] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/admin/admins");
      setAdmins(Array.isArray(data?.admins) ? data.admins : []);
      setCurrentUserEmail(data?.current_user_email || null);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!email.endsWith("@umich.edu")) {
      onError?.("Admins must have a @umich.edu email.");
      return;
    }
    setAdding(true);
    try {
      await apiFetch("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      onSuccess?.(`Added ${email} as an admin.`);
      setNewEmail("");
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (email) => {
    setRemovingEmail(email);
    try {
      await apiFetch("/api/admin/admins", {
        method: "DELETE",
        body: JSON.stringify({ email }),
      });
      onSuccess?.(`Removed ${email} from admins.`);
      setConfirmRemoveEmail(null);
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setRemovingEmail(null);
    }
  };

  const dbCount = admins.filter((a) => a.source === "db").length;
  const envCount = admins.filter((a) => a.source === "env").length;

  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Administrators</h2>
          <p className="text-xs text-white/40 mt-0.5">
            Grant admin access to additional @umich.edu accounts. The ones marked{" "}
            <span className="text-white/60">Env</span> are hardcoded via{" "}
            <code className="text-white/60">ADMIN_EMAILS</code> and can only be
            removed by editing the environment.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] text-white/40">
          <span>{envCount} env</span>
          <span className="text-white/20">·</span>
          <span>{dbCount} added</span>
        </div>
      </div>

      {/* Add new admin */}
      <form
        onSubmit={handleAdd}
        className="flex flex-col sm:flex-row gap-2 mb-5"
      >
        <input
          type="email"
          placeholder="uniqname@umich.edu"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          disabled={adding}
          className="flex-1 px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:border-maize"
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={adding || !newEmail.trim()}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
          style={{ background: "#FFCB05" }}
        >
          {adding ? "Adding..." : "Add admin"}
        </button>
      </form>

      {/* List */}
      {loading ? (
        <p className="text-white/40 text-sm">Loading admins...</p>
      ) : admins.length === 0 ? (
        <p className="text-white/40 text-sm italic">No admins configured.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {admins.map((a) => {
            const isEnv = a.source === "env";
            const isSelf = currentUserEmail && a.email === currentUserEmail;
            const canRemove = a.removable && !isSelf;
            const confirming = confirmRemoveEmail === a.email;
            return (
              <li
                key={a.email}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-white truncate">{a.email}</span>
                    {isEnv && (
                      <span
                        className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.6)",
                        }}
                        title="Set via ADMIN_EMAILS environment variable"
                      >
                        Env
                      </span>
                    )}
                    {isSelf && (
                      <span
                        className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
                        style={{
                          background: "rgba(255,203,5,0.15)",
                          color: "#FFCB05",
                        }}
                      >
                        You
                      </span>
                    )}
                  </div>
                  {a.source === "db" && (a.added_by || a.created_at) && (
                    <p className="text-[11px] text-white/35 mt-0.5">
                      {a.added_by ? `Added by ${a.added_by}` : "Added"}
                      {a.created_at ? ` · ${formatDate(a.created_at)}` : ""}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {confirming ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveEmail(null)}
                        disabled={removingEmail === a.email}
                        className="px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(a.email)}
                        disabled={removingEmail === a.email}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-40"
                        style={{
                          background: "rgba(239,68,68,0.25)",
                          border: "1px solid rgba(239,68,68,0.4)",
                        }}
                      >
                        {removingEmail === a.email ? "Removing..." : "Confirm remove"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => canRemove && setConfirmRemoveEmail(a.email)}
                      disabled={!canRemove}
                      title={
                        isEnv
                          ? "Set via ADMIN_EMAILS — edit the environment to remove."
                          : isSelf
                          ? "You can't remove your own admin access."
                          : "Remove admin"
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:cursor-not-allowed"
                      style={{
                        color: canRemove ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "transparent",
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
