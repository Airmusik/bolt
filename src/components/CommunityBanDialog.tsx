import { useState } from "react";
import { Modal } from "./Modal";

export function CommunityBanDialog({
  alias,
  onClose,
  onBan,
}: {
  alias: string;
  onClose: () => void;
  onBan: (hours: number | null, reason: string) => Promise<boolean>;
}) {
  const [hours, setHours] = useState("24");
  const [reason, setReason] = useState("Community rules violation");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      if (await onBan(hours === "indefinite" ? null : Number(hours), reason))
        onClose();
      else
        setError(
          "The ban was not applied. Check the error in the room and try again.",
        );
    } catch {
      setError("Could not apply the ban. Please try again.");
    } finally {
      setWorking(false);
    }
  };
  return (
    <Modal
      title="Ban from community?"
      onClose={() => {
        if (!working) onClose();
      }}
    >
      <p className="text-sm leading-6 text-ink-700">
        <strong>{alias}</strong> will be unable to post in the community. They
        can still read its history. Private chats and their rating will not
        change.
      </p>
      <label className="label mt-4" htmlFor="community-ban-duration">
        Ban duration
      </label>
      <select
        id="community-ban-duration"
        className="input"
        value={hours}
        disabled={working}
        onChange={(event) => setHours(event.target.value)}
      >
        <option value="1">1 hour</option>
        <option value="24">24 hours</option>
        <option value="168">7 days</option>
        <option value="720">30 days</option>
        <option value="indefinite">Until manually unbanned</option>
      </select>
      <p className="mt-1 text-xs text-ink-500">
        Timed bans end automatically. You can unban the member earlier in
        Community controls.
      </p>
      <label className="label mt-4" htmlFor="community-ban-reason">
        Reason shown to the member
      </label>
      <select
        id="community-ban-reason"
        className="input"
        value={reason}
        disabled={working}
        onChange={(event) => setReason(event.target.value)}
      >
        {[
          "Community rules violation",
          "Spam or scams",
          "Abusive or threatening messages",
          "Sharing personal contact details",
          "Repeated community rule violations",
        ].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={working}
          onClick={onClose}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={working}
          onClick={() => void submit()}
          className="btn bg-danger text-white hover:bg-red-700"
        >
          {working ? "Applying ban…" : "Confirm ban"}
        </button>
      </div>
    </Modal>
  );
}
