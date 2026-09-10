import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  Flag,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  COMMUNITY_LIMIT,
  filterCommunityText,
  validCommunityDraft,
  type CommunityMessage,
  type CommunitySession,
} from "@/lib/community";
import { cn } from "@/lib/utils";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

export type CommunityRoomProps = {
  siteName: string;
  session: CommunitySession | null;
  messages: CommunityMessage[];
  loading: boolean;
  sending: boolean;
  connection: string;
  error: string;
  notice: string;
  hasOlder: boolean;
  loadingOlder: boolean;
  onOlder: () => void;
  onRetry: () => void;
  onSend: (text: string) => Promise<boolean>;
  onReport: (message: CommunityMessage) => void;
  onModerate?: (action: "remove" | "mute", message: CommunityMessage) => void;
  backTo?: string;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  asSupport?: boolean;
  onIdentityChange?: (support: boolean) => void;
};
export function CommunityRoom(props: CommunityRoomProps) {
  const { session, messages, loading, sending } = props;
  const [draft, setDraft] = useState("");
  const [newMessages, setNewMessages] = useState(false);
  const pane = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastId = useRef<string>();
  const olderHeight = useRef<number | null>(null);
  const composing = useRef(false);
  const scrollAfterSend = useRef(false);
  const safe = filterCommunityText(draft);
  const enabled = !!session?.enabled && !session.muted;
  const scrollBottom = () => {
    if (pane.current) pane.current.scrollTop = pane.current.scrollHeight;
    atBottom.current = true;
    setNewMessages(false);
  };
  useLayoutEffect(() => {
    if (!pane.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) scrollBottom();
    });
    observer.observe(pane.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!pane.current) return;
    const latest = messages[messages.length - 1]?.id;
    if (scrollAfterSend.current && !sending) {
      scrollAfterSend.current = false;
      lastId.current = latest;
      scrollBottom();
      return;
    }
    if (olderHeight.current !== null && !props.loadingOlder) {
      pane.current.scrollTop += pane.current.scrollHeight - olderHeight.current;
      olderHeight.current = null;
      return;
    }
    if (latest !== lastId.current) {
      if (atBottom.current || !lastId.current) scrollBottom();
      else setNewMessages(true);
      lastId.current = latest;
    }
  }, [messages, props.loadingOlder, sending]);
  const send = async () => {
    if (!enabled || sending || !validCommunityDraft(draft)) return;
    scrollAfterSend.current = true;
    const sent = await props.onSend(draft);
    if (sent) {
      setDraft("");
      atBottom.current = true;
      scrollBottom();
    } else {
      scrollAfterSend.current = false;
    }
  };
  return (
    <section
      aria-label="Anonymous community chat"
      className="community-room card flex min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <header className="shrink-0 border-b border-ink-100 bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            {props.backTo && (
              <Link
                to={props.backTo}
                aria-label="Back from community"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-800 hover:bg-ink-50"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
            )}
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 sm:flex">
              <Users className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-bold text-ink-900 sm:text-2xl">
                Community lounge
              </h1>
              <p className="mt-1 text-xs text-ink-500">
                Drivers & car owners · {props.siteName}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {props.onToggleSound && (
              <button
                type="button"
                aria-label={
                  props.soundEnabled
                    ? "Mute community sounds"
                    : "Enable community sounds"
                }
                aria-pressed={props.soundEnabled}
                title="New messages sound after you interact with this page"
                onClick={props.onToggleSound}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-50"
              >
                {props.soundEnabled ? (
                  <Volume2 className="h-5 w-5" />
                ) : (
                  <VolumeX className="h-5 w-5" />
                )}
              </button>
            )}
            <span
              role="status"
              className="flex shrink-0 items-center gap-1.5 pt-1 text-[11px] text-ink-600"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  session?.enabled ? "bg-emerald-500" : "bg-ink-400",
                )}
              />
              {session?.enabled ? props.connection : "Paused"}
            </span>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-ink-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <span>
            Anonymous to members, not authorised moderators. Phone numbers,
            email addresses and links are filtered.
          </span>
        </p>
        <details className="mt-1 text-xs leading-5 text-ink-600">
          <summary className="cursor-pointer font-medium">
            Privacy & room rules
          </summary>
          <p className="mt-1">
            Only your alias and role are shown, not your name, photo or profile
            link. Messages are saved. Don’t share personal details or try to
            bypass filtering. Report anything missed; moderators can remove
            messages and pause posting.
          </p>
        </details>
        {session?.role === "admin" && props.onIdentityChange ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <label
              htmlFor="community-post-identity"
              className="font-medium text-ink-700"
            >
              Post as
            </label>
            <select
              id="community-post-identity"
              className="input !h-9 !w-auto min-w-0 max-w-full !py-1 text-xs"
              value={props.asSupport ? "support" : "alias"}
              disabled={sending || !session.member_alias}
              onChange={(event) =>
                props.onIdentityChange?.(event.target.value === "support")
              }
            >
              <option value="support">Official {props.siteName} Support</option>
              <option value="alias">
                My alias · {session.member_alias || "Loading…"}
              </option>
            </select>
            <span className="text-ink-500">New messages only</span>
          </div>
        ) : (
          session && (
            <p className="mt-2 text-xs text-ink-600">
              Posting as{" "}
              <span className="font-semibold text-ink-900">
                {session.alias}
              </span>{" "}
              ·{" "}
              {session.role === "owner"
                ? "Car owner"
                : session.role === "admin"
                  ? "Official moderator"
                  : "Driver"}
            </p>
          )
        )}
      </header>
      {props.error && (
        <div
          role="alert"
          className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800"
        >
          {props.error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={props.onRetry}
          >
            Retry connection
          </button>
        </div>
      )}
      <div
        ref={pane}
        role="region"
        aria-label="Community message history"
        tabIndex={0}
        onScroll={() => {
          const el = pane.current;
          if (el) {
            atBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 70;
            if (atBottom.current) setNewMessages(false);
          }
        }}
        className="community-history min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-5"
      >
        {props.hasOlder && (
          <div className="text-center">
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={props.loadingOlder}
              onClick={() => {
                olderHeight.current = pane.current?.scrollHeight ?? null;
                props.onOlder();
              }}
            >
              {props.loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {loading ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 p-8 text-sm text-ink-500"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening community…
          </p>
        ) : !session?.enabled && session?.role !== "admin" ? (
          <div className="mx-auto max-w-sm py-10 text-center">
            <Users className="mx-auto h-10 w-10 text-brand-600" />
            <h2 className="mt-3 text-lg font-bold text-ink-900">
              The lounge is currently paused
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              An administrator will reopen it when it’s ready. Your private
              chats are still separate.
            </p>
          </div>
        ) : !messages.length ? (
          <div className="mx-auto max-w-sm py-10 text-center">
            <Sparkles className="mx-auto h-9 w-9 text-brand-600" />
            <h2 className="mt-3 text-lg font-bold text-ink-900">
              A good conversation starts here
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Share driving tips, ask a question or say hello. Keep it kind,
              useful and free of contact details.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const moderator = message.member_role === "admin";
            const mine =
              !moderator &&
              message.alias === (session?.member_alias || session?.alias);
            return (
              <article
                key={message.id}
                className={cn(
                  "community-message max-w-[92%] sm:max-w-[78%]",
                  mine && "ml-auto",
                )}
              >
                <div
                  className={cn(
                    "mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]",
                    mine && "justify-end",
                  )}
                >
                  <span className="font-bold text-ink-700">
                    {moderator
                      ? `Official ${props.siteName} Support`
                      : message.alias}
                    {mine ? " · You" : ""}
                  </span>
                  <span className="text-ink-500">
                    {moderator
                      ? "Support"
                      : message.member_role === "owner"
                        ? "Car owner"
                        : message.member_role === "member"
                          ? "Member"
                          : "Driver"}
                  </span>
                </div>
                <div
                  className={cn(
                    "community-bubble rounded-2xl border px-3.5 py-3 text-sm leading-6 shadow-sm",
                    mine
                      ? "community-bubble-own rounded-tr-sm border-brand-200 bg-brand-50 text-ink-900"
                      : "rounded-tl-sm border-ink-100 bg-white text-ink-800",
                    message.removed && "italic text-ink-500",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {message.body}
                  </p>
                </div>
                <div
                  className={cn(
                    "mt-1 flex flex-wrap items-center gap-2 text-[10px] text-ink-500",
                    mine && "justify-end",
                  )}
                >
                  <time dateTime={message.created_at}>
                    {new Date(message.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  {!message.removed &&
                    !mine &&
                    !moderator &&
                    session?.role !== "admin" && (
                      <button
                        type="button"
                        aria-label={`Report message from ${message.alias}`}
                        className="inline-flex min-h-8 items-center gap-1 px-2 hover:text-ink-900"
                        onClick={() => props.onReport(message)}
                      >
                        <Flag className="h-3 w-3" />
                        Report
                      </button>
                    )}
                  {props.onModerate && !message.removed && (
                    <>
                      <button
                        type="button"
                        className="min-h-8 px-2 text-danger"
                        onClick={() => props.onModerate?.("remove", message)}
                      >
                        Remove
                      </button>
                      {!moderator && !mine && (
                        <button
                          type="button"
                          className="min-h-8 px-2 text-ink-700"
                          onClick={() => props.onModerate?.("mute", message)}
                        >
                          Ban from community
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
      {newMessages && (
        <button
          type="button"
          onClick={scrollBottom}
          className="flex shrink-0 items-center justify-center gap-2 border-t border-brand-100 bg-brand-50 py-2 text-xs font-semibold text-brand-700"
        >
          <ArrowDown className="h-4 w-4" />
          New messages — jump to latest
        </button>
      )}
      <footer className="shrink-0 border-t border-ink-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        {props.notice && (
          <p role="status" className="mb-2 text-xs text-brand-700">
            {props.notice}
          </p>
        )}
        {session?.muted ? (
          <p className="text-sm text-ink-700">
            You are banned from posting in the community
            {session.muted_until
              ? ` until ${new Date(session.muted_until).toLocaleString()}`
              : " until a moderator unbans you"}
            .{session.muted_reason ? ` Reason: ${session.muted_reason}.` : ""}{" "}
            <Link to="/contact" className="underline">
              Contact support
            </Link>
            .
          </p>
        ) : !session?.enabled ? (
          <p className="text-xs text-ink-500">
            Posting is off while the community is paused.
          </p>
        ) : (
          <>
            {safe !== draft.trim() && (
              <div
                role="status"
                className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
              >
                Contact details won’t be shared. Preview:{" "}
                <span className="break-words [overflow-wrap:anywhere]">
                  {safe}
                </span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <AutoGrowTextarea
                aria-label="Community message"
                placeholder="Share a thought, tip or question…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={COMMUNITY_LIMIT}
                disabled={sending || !enabled}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !composing.current &&
                    !event.nativeEvent.isComposing &&
                    window.matchMedia("(pointer:fine)").matches
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
                className="input min-h-11 min-w-0 flex-1 !rounded-xl py-3"
              />
              <button
                type="button"
                aria-label="Send community message"
                onClick={() => void send()}
                disabled={sending || !enabled || !validCommunityDraft(draft)}
                className="btn-primary h-12 w-12 shrink-0 !rounded-xl p-0"
              >
                {sending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="flex gap-1">
                {["👋", "🚘", "💡", "👏"].map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    aria-label={`Add ${emoji}`}
                    disabled={
                      sending || draft.length + emoji.length > COMMUNITY_LIMIT
                    }
                    onClick={() => setDraft((current) => current + emoji)}
                    className="h-9 w-9 rounded-lg text-lg transition-transform hover:bg-ink-50 motion-safe:hover:-translate-y-0.5"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-ink-500">
                {draft.length}/{COMMUNITY_LIMIT} · Text only
              </span>
            </div>
          </>
        )}
      </footer>
    </section>
  );
}

export function CommunityBackLink({ admin = false }: { admin?: boolean }) {
  return (
    <Link
      to={admin ? "/admin" : "/dashboard"}
      className="mb-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900"
    >
      <ArrowLeft className="h-4 w-4" />
      {admin ? "Back to admin" : "Back to dashboard"}
    </Link>
  );
}
