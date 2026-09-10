import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  HeartHandshake,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Modal } from "./Modal";

export function CommunityGuidelines({
  siteName,
  accepted,
  onAccept,
  onClose,
}: {
  siteName: string;
  accepted: boolean;
  onAccept: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="Community guidelines"
      onClose={() => {
        if (!working) onClose();
      }}
    >
      <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-ink-800">
        <BookOpen className="mb-2 h-6 w-6 text-brand-700" />
        <h2 className="font-bold">Good advice. Respectful conversations.</h2>
        <p className="mt-1 text-sm leading-6">
          Welcome to the {siteName} lounge—a shared space for drivers and car
          owners to learn from each other.
        </p>
      </div>
      <div className="mt-4 space-y-4 text-sm leading-6 text-ink-700">
        <section>
          <h3 className="flex items-center gap-2 font-bold text-ink-900">
            <HeartHandshake className="h-4 w-4" /> Be respectful
          </h3>
          <p>
            Discuss ideas, not people. No harassment, hate, threats, sexual
            content, impersonation, or public accusations against identifiable
            members. Keep advice relevant to driving and vehicle ownership.
          </p>
        </section>
        <section>
          <h3 className="flex items-center gap-2 font-bold text-ink-900">
            <LockKeyhole className="h-4 w-4" /> Protect everyone’s privacy
          </h3>
          <p>
            Use your assigned alias. Do not share phone numbers, email
            addresses, links, full names, number plates, precise home locations,
            or private documents. Do not split or disguise contact details to
            bypass filtering.
          </p>
        </section>
        <section>
          <h3 className="flex items-center gap-2 font-bold text-ink-900">
            <ShieldCheck className="h-4 w-4" /> Keep it safe and useful
          </h3>
          <p>
            No scams, spam, repeated adverts, payment requests, or instructions
            for illegal or dangerous conduct. Verify advice independently.
            Community posts and reactions are not endorsements, identity checks,
            or profile ratings.
          </p>
        </section>
        <section>
          <h3 className="font-bold text-ink-900">Understand moderation</h3>
          <p>
            Your alias hides your identity from other members, not authorised
            moderators. Messages and moderation records are saved. Admins can
            remove messages or ban community posting temporarily or
            indefinitely. Bans do not change private chats or ratings.
          </p>
          <p className="mt-1">
            Use Report for a concern. For a private dispute or to appeal a ban,{" "}
            <Link to="/contact" className="font-semibold underline">
              contact Support
            </Link>
            ; don’t post personal evidence here.
          </p>
        </section>
      </div>
      {!accepted && (
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-ink-100 p-3 text-sm text-ink-800">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
            checked={checked}
            disabled={working}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>
            I have read and agree to follow these community guidelines.
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={working}
          onClick={onClose}
        >
          {accepted ? "Close guidelines" : "Read only for now"}
        </button>
        {!accepted && (
          <button
            type="button"
            className="btn-primary"
            disabled={!checked || working}
            onClick={async () => {
              setWorking(true);
              setError("");
              try {
                if (await onAccept()) onClose();
                else
                  setError("Could not save your agreement. Please try again.");
              } catch {
                setError("Could not save your agreement. Please try again.");
              } finally {
                setWorking(false);
              }
            }}
          >
            {working ? "Saving…" : "Agree & join the conversation"}
          </button>
        )}
      </div>
    </Modal>
  );
}
