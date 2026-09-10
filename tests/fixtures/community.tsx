// Development-only UI fixture. Uses the real room and dialogs, but never
// connects to Supabase or sends messages to real members.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { CommunityRoom } from "../../src/components/CommunityRoom";
import { CommunityFrame } from "../../src/components/CommunityFrame";
import { CommunityBanDialog } from "../../src/components/CommunityBanDialog";
import { CommunityGuidelines } from "../../src/components/CommunityGuidelines";
import { useCommunitySound } from "../../src/lib/useCommunitySound";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { Modal } from "../../src/components/Modal";
import {
  filterCommunityText,
  mergeCommunityMessages,
  type CommunityMessage,
  type CommunitySession,
} from "../../src/lib/community";
import "../../src/index.css";
import "../../src/styles/site-palette.css";
import "../../src/styles/community.css";

const sample = (index: number): CommunityMessage => ({
  id: `sample-${index}`,
  alias: index % 2 ? "Member f329a146bf" : "Member 20cab190ef",
  member_role: index % 2 ? "owner" : "driver",
  body:
    index % 2
      ? "A clear agreement about servicing helps both the owner and driver. 🚘"
      : "What is your favourite tip for keeping a car in good condition? 💡",
  created_at: new Date(Date.now() - (30 - index) * 60000).toISOString(),
  removed: false,
  filtered: false,
});
export function Fixture() {
  const [role, setRole] = useState<CommunitySession["role"]>(() =>
    new URLSearchParams(location.search).get("role") === "admin"
      ? "admin"
      : "driver",
  );
  const [asSupport, setAsSupport] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [guidelines, setGuidelines] = useState(false);
  const [myReactions, setMyReactions] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState(
    Array.from({ length: 20 }, (_, i) => sample(i + 10)),
  );
  const [sending, setSending] = useState(false);
  const [older, setOlder] = useState(true);
  const [notice, setNotice] = useState("");
  const [report, setReport] = useState<CommunityMessage | null>(null);
  const [confirm, setConfirm] = useState<{
    action: string;
    message?: CommunityMessage;
  } | null>(null);
  const session: CommunitySession = {
    role,
    enabled,
    muted,
    rules_accepted: accepted,
    pinned_message:
      messages.find((message) => message.pinned && !message.removed) || null,
    alias:
      role === "admin"
        ? "Community moderator"
        : role === "driver"
          ? "Member 20cab190ef"
          : "Member f329a146bf",
    member_alias:
      role === "admin"
        ? "Member abcde12345"
        : role === "driver"
          ? "Member 20cab190ef"
          : "Member f329a146bf",
  };
  const sound = useCommunitySound(messages, false, session.member_alias);
  const send = async (body: string, replyTo: string | null = null) => {
    const id = crypto.randomUUID();
    sound.rememberOwn(id);
    setSending(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    const safe = filterCommunityText(body);
    setMessages((current) =>
      mergeCommunityMessages(current, [
        {
          id,
          alias:
            role === "admin" && !asSupport
              ? session.member_alias!
              : session.alias,
          member_role: role === "admin" && !asSupport ? "member" : role,
          body: safe,
          filtered: safe !== body,
          created_at: new Date().toISOString(),
          removed: false,
          reply_to: replyTo,
        },
      ]),
    );
    setSending(false);
    setNotice("Message sent.");
    return true;
  };
  return (
    <BrowserRouter>
      <div
        style={{ display: "flex", gap: 8, padding: 8, flexWrap: "wrap" }}
        aria-label="Local test controls"
      >
        <select
          aria-label="Test role"
          value={role}
          onChange={(e) => setRole(e.target.value as CommunitySession["role"])}
        >
          <option>driver</option>
          <option>owner</option>
          <option>admin</option>
        </select>
        <button
          className="btn-secondary"
          onClick={() => document.documentElement.classList.toggle("dark")}
        >
          Theme
        </button>
        <button
          className="btn-secondary"
          onClick={() => setConfirm({ action: "toggle" })}
        >
          {enabled ? "Pause test room" : "Open test room"}
        </button>
        <button
          className="btn-secondary"
          onClick={() =>
            setMessages((current) =>
              mergeCommunityMessages(current, [
                {
                  ...sample(31),
                  id: crypto.randomUUID(),
                  body: "New incoming message 👋",
                  created_at: new Date().toISOString(),
                },
              ]),
            )
          }
        >
          Incoming message
        </button>
        <button className="btn-secondary" onClick={() => setMuted(false)}>
          Unmute test member
        </button>
      </div>
      <CommunityFrame>
        <CommunityRoom
          key={role}
          siteName="11Drive"
          session={session}
          messages={messages}
          loading={false}
          sending={sending}
          connection="Live"
          backTo="/tests/fixtures/community.html"
          soundEnabled={sound.enabled}
          onToggleSound={sound.toggle}
          asSupport={asSupport}
          onIdentityChange={role === "admin" ? setAsSupport : undefined}
          onGuidelines={() => setGuidelines(true)}
          onSendReply={send}
          myReactions={myReactions}
          onReact={(message, emoji) => {
            setMessages((current) =>
              current.map((row) => {
                if (row.id !== message.id) return row;
                const counts = { ...row.reactions };
                const old = myReactions[row.id];
                if (old) counts[old] = Math.max(0, (counts[old] || 0) - 1);
                if (emoji) counts[emoji] = (counts[emoji] || 0) + 1;
                return { ...row, reactions: counts };
              }),
            );
            setMyReactions((current) => {
              const next = { ...current };
              if (emoji) next[message.id] = emoji;
              else delete next[message.id];
              return next;
            });
          }}
          onPin={
            role === "admin"
              ? (message) =>
                  setMessages((current) =>
                    current.map((row) => ({
                      ...row,
                      pinned: row.id === message.id && !message.pinned,
                    })),
                  )
              : undefined
          }
          error=""
          notice={notice}
          hasOlder={older}
          loadingOlder={false}
          onOlder={() => {
            setMessages((current) =>
              mergeCommunityMessages(
                current,
                Array.from({ length: 10 }, (_, i) => sample(i)),
              ),
            );
            setOlder(false);
          }}
          onRetry={() => {}}
          onReport={setReport}
          onModerate={
            role === "admin"
              ? (action, message) => setConfirm({ action, message })
              : undefined
          }
          onSend={send}
        />
      </CommunityFrame>
      {guidelines && (
        <CommunityGuidelines
          siteName="11Drive"
          accepted={accepted}
          onAccept={async () => {
            setAccepted(true);
            return true;
          }}
          onClose={() => setGuidelines(false)}
        />
      )}
      {report && (
        <Modal title="Report community message" onClose={() => setReport(null)}>
          <p className="text-sm text-ink-600">
            Tell moderators what’s wrong. This does not automatically change
            anyone’s rating.
          </p>
          <label className="label mt-4" htmlFor="reason">
            Reason
          </label>
          <select id="reason" className="input">
            <option>Spam or scam</option>
            <option>Personal details shared</option>
          </select>
          <button
            className="btn-primary mt-4"
            onClick={() => {
              setReport(null);
              setNotice("Report received. A moderator can review it.");
            }}
          >
            Send report
          </button>
        </Modal>
      )}
      {confirm?.action === "mute" ? (
        <CommunityBanDialog
          alias={confirm.message?.alias || "Member"}
          onClose={() => setConfirm(null)}
          onBan={async (hours, reason) => {
            setNotice(
              `Test ban applied: ${hours ?? "indefinite"} hours · ${reason}`,
            );
            return true;
          }}
        />
      ) : (
        confirm && (
          <ConfirmDialog
            title="Confirm community action"
            message={
              confirm.action === "toggle"
                ? "Change whether members can view and post in the room?"
                : "Apply this moderation action? Private chats and ratings stay unchanged."
            }
            confirmLabel="Confirm"
            onClose={() => setConfirm(null)}
            onConfirm={async () => {
              if (confirm.action === "toggle") setEnabled(!enabled);
              if (confirm.action === "mute") setMuted(true);
              if (confirm.action === "remove")
                setMessages((current) =>
                  current.map((row) =>
                    row.id === confirm.message?.id
                      ? {
                          ...row,
                          removed: true,
                          body: "Message removed by a moderator.",
                        }
                      : row,
                  ),
                );
              setNotice("Community updated.");
            }}
          />
        )
      )}
    </BrowserRouter>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
