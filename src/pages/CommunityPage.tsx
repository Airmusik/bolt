import { useCallback, useEffect, useRef, useState } from "react";
import { Power, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { useSiteSettings } from "@/lib/siteSettings";
import {
  communityError,
  mergeCommunityMessages,
  type CommunityMessage,
  type CommunityModeration,
  type CommunitySession,
} from "@/lib/community";
import { CommunityRoom } from "@/components/CommunityRoom";
import { CommunityFrame } from "@/components/CommunityFrame";
import { CommunityBanDialog } from "@/components/CommunityBanDialog";
import { useCommunitySound } from "@/lib/useCommunitySound";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import "@/styles/community.css";

export function CommunityPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  return (
    <CommunityPageContent key={user?.id || "signed-out"} embedded={embedded} />
  );
}

function CommunityPageContent({ embedded }: { embedded: boolean }) {
  const { user, profile } = useAuth();
  const { settings, refreshSettings } = useSiteSettings();
  const [session, setSession] = useState<CommunitySession | null>(null);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [asSupport, setAsSupport] = useState(true);
  const sound = useCommunitySound(
    messages,
    loading,
    session?.member_alias || session?.alias,
  );
  const [connection, setConnection] = useState("Connecting…");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [older, setOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [moderation, setModeration] = useState<CommunityModeration>({
    reports: [],
    muted: [],
  });
  const [reporting, setReporting] = useState<CommunityMessage | null>(null);
  const [reason, setReason] = useState("spam");
  const [reportError, setReportError] = useState("");
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: string;
    message?: CommunityMessage;
    alias?: string;
  } | null>(null);
  const alive = useRef(false);
  const refreshing = useRef(false);
  const pending = useRef<{
    body: string;
    id: string;
    asSupport: boolean;
  } | null>(null);
  const isAdmin = profile?.role === "admin";
  const userId = user?.id;
  const firstPage = useRef(true);
  const load = useCallback(async () => {
    if (!userId || refreshing.current) return;
    refreshing.current = true;
    try {
      const result = await supabase.rpc("community_session");
      if (result.error) throw result.error;
      const next = result.data as CommunitySession;
      if (!alive.current) return;
      setSession(next);
      if (!next.enabled && !isAdmin) {
        setMessages([]);
        setOlder(false);
        firstPage.current = true;
        setLoadError("");
        return;
      }
      const page = await supabase.rpc("community_page");
      if (page.error) throw page.error;
      if (!alive.current) return;
      const rows = (page.data || []) as CommunityMessage[];
      setMessages((previous) => mergeCommunityMessages(previous, rows));
      if (firstPage.current) {
        setOlder(rows.length === 50);
        firstPage.current = false;
      }
      setLoadError("");
      if (isAdmin) {
        const admin = await supabase.rpc("admin_community_overview");
        if (admin.error) throw admin.error;
        if (alive.current) setModeration(admin.data as CommunityModeration);
      }
    } catch (failure) {
      if (alive.current) {
        setLoadError(communityError(failure));
        setConnection("Reconnecting…");
      }
    } finally {
      refreshing.current = false;
      if (alive.current) setLoading(false);
    }
  }, [userId, isAdmin]);
  useEffect(() => {
    alive.current = true;
    setMessages([]);
    setSession(null);
    setLoading(true);
    pending.current = null;
    firstPage.current = true;
    void load();
    const channel = supabase
      .channel(`community-room-${user?.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages" },
        (event) => {
          if (alive.current)
            setMessages((previous) =>
              mergeCommunityMessages(previous, [event.new as CommunityMessage]),
            );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "community_messages" },
        (event) => {
          if (alive.current)
            setMessages((previous) =>
              mergeCommunityMessages(previous, [event.new as CommunityMessage]),
            );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "site_settings",
          filter: "key=eq.community_enabled",
        },
        () => {
          void load();
        },
      )
      .subscribe((status) => {
        if (!alive.current) return;
        setConnection(status === "SUBSCRIBED" ? "Live" : "Reconnecting…");
        if (status === "SUBSCRIBED") void load();
      });
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      void supabase.removeChannel(channel);
    };
  }, [load, user?.id]);
  useEffect(() => {
    if (settings.community_enabled !== "true" && !isAdmin) {
      setMessages([]);
      setSession((current) =>
        current ? { ...current, enabled: false } : current,
      );
    }
    void load();
  }, [settings.community_enabled, isAdmin, load]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await supabase.rpc("community_page", {
        p_before: first.created_at,
        p_before_id: first.id,
      });
      if (result.error) throw result.error;
      setMessages((current) =>
        mergeCommunityMessages(current, result.data || []),
      );
      setOlder(result.data?.length === 50);
    } catch (failure) {
      setError(communityError(failure));
    } finally {
      setLoadingOlder(false);
    }
  };
  const send = async (body: string) => {
    if (sending) return false;
    setSending(true);
    setError("");
    setNotice("");
    if (
      pending.current?.body !== body ||
      pending.current.asSupport !== asSupport
    )
      pending.current = { body, id: crypto.randomUUID(), asSupport };
    sound.rememberOwn(pending.current.id);
    try {
      const result = await supabase.rpc("community_send", {
        p_body: body,
        p_client_id: pending.current.id,
        p_as_support: asSupport,
      });
      if (result.error) throw result.error;
      setMessages((current) =>
        mergeCommunityMessages(current, [result.data as CommunityMessage]),
      );
      pending.current = null;
      setNotice(
        result.data.filtered
          ? "Sent. Contact details were removed before publishing."
          : "Message sent.",
      );
      return true;
    } catch (failure) {
      setError(communityError(failure));
      void load();
      return false;
    } finally {
      setSending(false);
    }
  };
  const action = async (
    hours: number | null = null,
    reason: string | null = null,
  ) => {
    if (!confirm) return false;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await supabase.rpc("admin_community_action", {
        p_action: confirm.action,
        p_message_id: confirm.message?.id || null,
        p_alias: confirm.alias || null,
        p_duration_hours: hours,
        p_reason: reason,
      });
      if (result.error) throw result.error;
      setNotice("Community updated.");
      await refreshSettings();
      await load();
      return true;
    } catch (failure) {
      setError(communityError(failure));
      return false;
    } finally {
      setWorking(false);
    }
  };
  const report = async () => {
    if (!reporting || working) return;
    setReportError("");
    setWorking(true);
    try {
      const result = await supabase.rpc("community_report", {
        p_message_id: reporting.id,
        p_reason: reason,
      });
      if (result.error) throw result.error;
      setReporting(null);
      setNotice(
        "Report received. A moderator can review it; your identity is not shown to other members.",
      );
    } catch (failure) {
      setReportError(communityError(failure));
    } finally {
      setWorking(false);
    }
  };
  return (
    <CommunityFrame embedded={embedded}>
      {isAdmin && embedded && (
        <section className="card mb-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-bold text-ink-900">
                <ShieldCheck className="h-5 w-5 text-brand-600" />
                Community controls
              </h2>
              <p className="mt-1 max-w-xl text-xs leading-5 text-ink-500">
                One shared anonymous room. Turning it off hides it from members
                and blocks new messages immediately. Saved history stays
                available to moderators.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={loading || working}
              onClick={() =>
                setConfirm({ action: session?.enabled ? "disable" : "enable" })
              }
            >
              <Power className="h-4 w-4" />
              {session?.enabled ? "Turn community off" : "Turn community on"}
            </button>
          </div>
          <Link to="/community" className="btn-secondary mt-3">
            Open full-page community chat
          </Link>
          {(error || loadError) && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error || loadError}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => {
                  setError("");
                  void load();
                }}
              >
                Retry connection
              </button>
            </p>
          )}
          {notice && (
            <p role="status" className="mt-3 text-sm text-brand-700">
              {notice}
            </p>
          )}
          {!!moderation.reports.length && (
            <div className="mt-4 border-t border-ink-100 pt-4">
              <h3 className="text-sm font-bold text-ink-900">
                Messages needing review ({moderation.reports.length})
              </h3>
              <div className="mt-2 space-y-2">
                {moderation.reports.map((row) => (
                  <article
                    key={row.id}
                    className="rounded-lg border border-ink-100 p-3"
                  >
                    <p className="text-xs text-ink-500">
                      {row.alias} · {row.reports} report(s) ·{" "}
                      {row.reasons.join(", ").replace(/_/g, " ")}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-800 [overflow-wrap:anywhere]">
                      {row.body}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["remove", "mute", "resolve"].map((value) => (
                        <button
                          type="button"
                          key={value}
                          className="btn-secondary text-xs"
                          disabled={working}
                          onClick={() =>
                            setConfirm({ action: value, message: row })
                          }
                        >
                          {value === "remove"
                            ? "Remove message"
                            : value === "mute"
                              ? "Ban from community"
                              : "Dismiss report"}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
          {!!moderation.muted.length && (
            <div className="mt-4 border-t border-ink-100 pt-4">
              <h3 className="text-sm font-bold text-ink-900">Community bans</h3>
              {moderation.muted.map((member) => (
                <div
                  key={member.alias}
                  className="mt-2 flex items-center justify-between gap-3 text-xs text-ink-700"
                >
                  <span className="min-w-0">
                    <strong>{member.alias}</strong>
                    <span className="mt-1 block text-ink-500">
                      {member.muted_until
                        ? `Until ${new Date(member.muted_until).toLocaleString()}`
                        : "Until manually unbanned"}
                      {member.muted_reason ? ` · ${member.muted_reason}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={working}
                    onClick={() =>
                      setConfirm({ action: "unmute", alias: member.alias })
                    }
                  >
                    Unban
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <CommunityRoom
        key={userId}
        siteName={settings.site_name}
        session={session}
        messages={messages}
        loading={loading}
        sending={sending}
        connection={connection}
        backTo={
          !embedded
            ? isAdmin
              ? "/admin?tab=community"
              : "/dashboard"
            : undefined
        }
        soundEnabled={sound.enabled}
        onToggleSound={sound.toggle}
        asSupport={asSupport}
        onIdentityChange={isAdmin ? setAsSupport : undefined}
        error={embedded ? "" : error || loadError}
        notice={embedded ? "" : notice}
        hasOlder={older}
        loadingOlder={loadingOlder}
        onOlder={() => void loadOlder()}
        onRetry={() => {
          setError("");
          void load();
        }}
        onSend={send}
        onReport={(message) => {
          setReason("spam");
          setReportError("");
          setReporting(message);
        }}
        onModerate={
          isAdmin
            ? (value, message) => setConfirm({ action: value, message })
            : undefined
        }
      />
      {reporting && (
        <Modal
          title="Report community message"
          onClose={() => {
            if (!working) setReporting(null);
          }}
        >
          <p className="text-sm text-ink-600">
            Tell moderators what’s wrong. This does not automatically change
            anyone’s rating.
          </p>
          {reportError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {reportError}
            </p>
          )}
          <label className="label mt-4" htmlFor="community-report-reason">
            Reason
          </label>
          <select
            id="community-report-reason"
            className="input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option value="spam">Spam or scam</option>
            <option value="abuse">Abusive or threatening</option>
            <option value="personal_details">Personal details shared</option>
            <option value="other">Other community concern</option>
          </select>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={working}
              className="btn-secondary"
              onClick={() => setReporting(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={working}
              className="btn-primary"
              onClick={() => void report()}
            >
              {working ? "Submitting…" : "Send report"}
            </button>
          </div>
        </Modal>
      )}
      {confirm?.action === "mute" ? (
        <CommunityBanDialog
          alias={confirm.message?.alias || "This member"}
          onBan={action}
          onClose={() => setConfirm(null)}
        />
      ) : (
        confirm && (
          <ConfirmDialog
            title={
              confirm.action === "disable"
                ? "Pause community chat?"
                : confirm.action === "enable"
                  ? "Open community chat?"
                  : "Confirm moderation action"
            }
            message={
              confirm.action === "disable"
                ? "Members will no longer see this room or send messages. History is preserved."
                : confirm.action === "enable"
                  ? "Registered drivers and owners will be able to join. Please keep an eye on reports."
                  : confirm.action === "remove"
                    ? "This message will be replaced with a moderator removal notice. A private moderation record will be kept."
                    : confirm.action === "unmute"
                      ? "Unban this member and allow them to post in the community again?"
                      : "Mark reports on this message as reviewed without changing the member’s rating?"
            }
            confirmLabel={
              confirm.action === "enable"
                ? "Open community"
                : confirm.action === "disable"
                  ? "Pause community"
                  : "Confirm"
            }
            danger={["remove", "mute", "disable"].includes(confirm.action)}
            onConfirm={async () => {
              await action();
            }}
            onClose={() => setConfirm(null)}
          />
        )
      )}
    </CommunityFrame>
  );
}
