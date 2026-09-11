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
  CornerUpLeft,
  Pin,
  X,
  BookOpen,
} from "lucide-react";
import {
  COMMUNITY_LIMIT,
  COMMUNITY_REACTIONS,
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
  onGuidelines?: () => void;
  onSendReply?: (text: string, replyTo: string | null) => Promise<boolean>;
  myReactions?: Record<string, string>;
  reacting?: boolean;
  onReact?: (message: CommunityMessage, emoji: string | null) => void;
  onPin?: (message: CommunityMessage) => void;
};
export function CommunityRoom(props: CommunityRoomProps) {
  const { session, messages, loading, sending } = props;
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<CommunityMessage | null>(null);
  const [newMessages, setNewMessages] = useState(false);
  const pane = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastId = useRef<string>();
  const olderHeight = useRef<number | null>(null);
  const composing = useRef(false);
  const scrollAfterSend = useRef(false);
  const safe = filterCommunityText(draft);
  const enabled =
    !!session?.enabled && !session.muted && session.rules_accepted === true;
  const messageIndex = new Map(
    messages.map((message) => [message.id, message]),
  );
  const replyTarget = reply ? messageIndex.get(reply.id) || reply : null;
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
    if (
      !enabled ||
      sending ||
      replyTarget?.removed ||
      !validCommunityDraft(draft)
    )
      return;
    scrollAfterSend.current = true;
    const sent = await (props.onSendReply
      ? props.onSendReply(draft, reply?.id || null)
      : props.onSend(draft));
    if (sent) {
      setDraft("");
      setReply(null);
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
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-700 sm:flex">
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
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          {props.onGuidelines && (
            <button
              type="button"
              onClick={props.onGuidelines}
              className="flex min-h-8 items-center gap-1.5 text-xs font-semibold text-ink-700"
            >
              <BookOpen className="h-3.5 w-3.5" /> Community guidelines
            </button>
          )}
        </div>
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
              title="Choose how new messages are signed. Previous messages stay unchanged."
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
      {session?.pinned_message && !session.pinned_message.removed && (
        <details className="community-pin shrink-0 border-b border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-700 sm:px-5">
          <summary className="cursor-pointer list-none">
            <span className="flex items-center gap-2">
              <Pin className="h-3.5 w-3.5 shrink-0 text-ink-700" />
              <span className="truncate">
                <strong>Pinned by moderators</strong> ·{" "}
                {session.pinned_message.body}
              </span>
            </span>
          </summary>
          <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-words leading-5 [overflow-wrap:anywhere]">
            {session.pinned_message.body}
          </p>
        </details>
      )}
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
            {enabled && (
              <div className="mt-4 flex flex-col gap-2">
                {[
                  "What’s your best car-care tip?",
                  "How do you agree on servicing with your working partner?",
                  "What helped you get started as a driver?",
                ].map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    className="btn-secondary text-xs"
                    onClick={() => setDraft(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
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
                id={`community-message-${message.id}`}
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
                  {!message.removed && message.reply_to && (
                    <div className="mb-2 rounded-lg border-l-2 border-ink-400 bg-ink-50 px-3 py-2 text-xs text-ink-600">
                      <span className="flex items-center gap-1 font-semibold">
                        <CornerUpLeft className="h-3 w-3" />
                        {messageIndex.get(message.reply_to)?.member_role ===
                        "admin"
                          ? `Official ${props.siteName} Support`
                          : messageIndex.get(message.reply_to)?.alias ||
                            "Earlier community message"}
                      </span>
                      <p className="mt-1 line-clamp-2 break-words">
                        {messageIndex.get(message.reply_to)?.body ||
                          "Load earlier messages to read the original."}
                      </p>
                    </div>
                  )}
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
                  {enabled && !message.removed && props.onSendReply && (
                    <button
                      type="button"
                      className="inline-flex min-h-8 items-center gap-1 px-2 text-ink-700"
                      onClick={() => {
                        setReply(message);
                        pane.current
                          ?.closest("section")
                          ?.querySelector<HTMLTextAreaElement>("textarea")
                          ?.focus();
                      }}
                    >
                      <CornerUpLeft className="h-3 w-3" />
                      Reply
                    </button>
                  )}
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
                  {(props.onModerate || props.onPin) && !message.removed && (
                    <details className="rounded-lg border border-ink-100 px-2">
                      <summary className="cursor-pointer py-2 font-semibold text-ink-700">
                        Moderate
                      </summary>
                      <div className="flex flex-wrap gap-1 pb-1">
                        {props.onModerate && (
                          <>
                            <button
                              type="button"
                              className="min-h-8 px-2 text-danger"
                              onClick={() =>
                                props.onModerate?.("remove", message)
                              }
                            >
                              Remove
                            </button>
                            {!moderator && !mine && (
                              <button
                                type="button"
                                className="min-h-8 px-2 text-ink-700"
                                onClick={() =>
                                  props.onModerate?.("mute", message)
                                }
                              >
                                Ban from community
                              </button>
                            )}
                          </>
                        )}
                        {props.onPin && !message.removed && (
                          <button
                            type="button"
                            className="inline-flex min-h-8 items-center gap-1 px-2 text-ink-700"
                            onClick={() => props.onPin?.(message)}
                          >
                            <Pin className="h-3 w-3" />
                            {message.pinned ? "Unpin" : "Pin"}
                          </button>
                        )}
                      </div>
                    </details>
                  )}
                </div>
                {!message.removed && props.onReact && (
                  <div
                    className={cn(
                      "mt-1 flex flex-wrap gap-1",
                      mine && "justify-end",
                    )}
                    aria-label={`Reactions to message from ${message.alias}`}
                  >
                    {COMMUNITY_REACTIONS.map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        aria-label={`React ${emoji} to message from ${message.alias}`}
                        aria-pressed={props.myReactions?.[message.id] === emoji}
                        disabled={!enabled || props.reacting}
                        onClick={() =>
                          props.onReact?.(
                            message,
                            props.myReactions?.[message.id] === emoji
                              ? null
                              : emoji,
                          )
                        }
                        className={cn(
                          "community-reaction flex min-h-8 min-w-9 items-center justify-center gap-1 rounded-md border px-2 text-xs",
                          props.myReactions?.[message.id] === emoji
                            ? "border-ink-400 bg-ink-100 text-ink-900"
                            : "border-transparent text-ink-600 hover:border-ink-200 hover:bg-ink-50",
                        )}
                      >
                        <span className="text-sm">{emoji}</span>
                        {!!message.reactions?.[emoji] && (
                          <span>{message.reactions[emoji]}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
      {newMessages && (
        <button
          type="button"
          onClick={scrollBottom}
          className="flex shrink-0 items-center justify-center gap-2 border-t border-ink-200 bg-ink-50 py-2 text-xs font-semibold text-ink-700"
        >
          <ArrowDown className="h-4 w-4" />
          New messages — jump to latest
        </button>
      )}
      <footer className="shrink-0 border-t border-ink-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        {props.notice && (
          <p role="status" className="mb-2 text-xs text-ink-700">
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
        ) : !session.rules_accepted ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-ink-600">
              <strong className="block text-sm text-ink-900">
                Welcome to the conversation 👋
              </strong>
              Read the guidelines before posting or reacting.
            </div>
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={props.onGuidelines}
            >
              Read & accept guidelines
            </button>
          </div>
        ) : (
          <>
            {replyTarget && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border-l-2 border-ink-400 bg-ink-50 p-2 text-xs text-ink-700">
                <CornerUpLeft className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <strong>
                    Replying to{" "}
                    {replyTarget.member_role === "admin"
                      ? "Official Support"
                      : replyTarget.alias}
                  </strong>
                  <p className="line-clamp-2 break-words">
                    {replyTarget.removed
                      ? "This message was removed. Cancel this reply to continue."
                      : replyTarget.body}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Cancel reply"
                  className="flex h-8 w-8 shrink-0 items-center justify-center"
                  onClick={() => setReply(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {safe !== draft.trim() && (
              <div
                role="status"
                className="mb-2 rounded-lg border border-ink-200 bg-ink-50 p-2 text-xs text-ink-700"
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
                disabled={
                  sending ||
                  !enabled ||
                  !!replyTarget?.removed ||
                  !validCommunityDraft(draft)
                }
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
