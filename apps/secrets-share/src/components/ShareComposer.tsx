import { useState, type FormEvent } from "react";
import { completeShareUrl, encryptShare, type ShareContent } from "@outray/share-crypto";

type Entry = { key: string; value: string };

export default function ShareComposer() {
  const [mode, setMode] = useState<"text" | "bundle">("text");
  const [plainText, setPlainText] = useState("");
  const [entries, setEntries] = useState<Entry[]>([{ key: "", value: "" }]);
  const [durationValue, setDurationValue] = useState(7);
  const [durationUnit, setDurationUnit] = useState<"days" | "months">("days");
  const [maxViews, setMaxViews] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const updateEntry = (index: number, field: keyof Entry, value: string) => {
    setEntries((current) => current.map((entry, position) => position === index ? { ...entry, [field]: value } : entry));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const content: ShareContent = mode === "text"
        ? { type: "text", text: plainText }
        : { type: "bundle", entries: entries.map(({ key, value }) => ({ key: key.trim(), value })) };
      const encrypted = await encryptShare(content);
      const response = await fetch("/v1/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          verifier: encrypted.verifier,
          contentFormat: content.type,
          durationValue,
          durationUnit,
          maxViews,
        }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The share service is unavailable. Please try again later.");
      }
      const result = await response.json();
      if (!response.ok || typeof result.id !== "string") throw new Error(result.error || "Could not create share");
      setLink(completeShareUrl(window.location.origin, result.id, encrypted.key));
      setPlainText("");
      setEntries([{ key: "", value: "" }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create share");
    } finally {
      setBusy(false);
    }
  };

  if (link) return (
    <div className="share-card">
      <div className="card-top"><h2>Your link is ready</h2><p>Copy it now. OutRay cannot recover the complete link later.</p></div>
      <div className="card-body">
        <div className="success-box">
          <h3>Encrypted and ready to send</h3>
          <p>Only someone with this complete link can decrypt the content. The link stops working when its time or reveal limit is reached.</p>
          <div className="link-row">
            <input className="control" aria-label="Complete share link" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
            <button className="primary-button" onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</button>
          </div>
        </div>
        <button className="secondary-button" style={{ marginTop: 22 }} onClick={() => { setLink(null); setCopied(false); }}>Share another</button>
      </div>
    </div>
  );

  return (
    <form className="share-card" onSubmit={(event) => void submit(event)}>
      <div className="card-top"><h2>Create a private link</h2><p>No signup. No plaintext stored. Set the limits, then send the link yourself.</p></div>
      <div className="card-body">
        <div className="mode-switch" role="group" aria-label="Content type">
          <button type="button" aria-pressed={mode === "text"} onClick={() => setMode("text")}>Text</button>
          <button type="button" aria-pressed={mode === "bundle"} onClick={() => setMode("bundle")}>Named secrets</button>
        </div>
        {mode === "text" ? (
          <div><label className="field-label" htmlFor="share-text">What would you like to share?</label>
            <textarea id="share-text" className="control" placeholder="Paste a password, private note, or other sensitive text…" value={plainText} onChange={(event) => setPlainText(event.target.value)} required />
          </div>
        ) : (
          <div><span className="field-label">Secrets</span><div className="entries">
            {entries.map((entry, index) => <div className="entry-row" key={index}>
              <input className="control" aria-label={`Secret ${index + 1} name`} placeholder="NAME" value={entry.key} onChange={(event) => updateEntry(index, "key", event.target.value)} required />
              <input className="control" aria-label={`Secret ${index + 1} value`} placeholder="Value" value={entry.value} onChange={(event) => updateEntry(index, "value", event.target.value)} />
              <button type="button" aria-label={`Remove secret ${index + 1}`} disabled={entries.length === 1} onClick={() => setEntries((current) => current.filter((_, position) => position !== index))}>×</button>
            </div>)}
          </div><button className="secondary-button" type="button" style={{ marginTop: 12 }} disabled={entries.length >= 50} onClick={() => setEntries((current) => [...current, { key: "", value: "" }])}>+ Add secret</button></div>
        )}
        <p className="field-note">Names and values are encrypted together in your browser. Maximum 50 secrets or 256 KiB.</p>
        <div className="limits">
          <div><label className="field-label" htmlFor="share-duration">Expires after</label><div className="duration-controls">
            <input id="share-duration" className="control" type="number" min="1" max={durationUnit === "days" ? "90" : "3"} value={durationValue} onChange={(event) => setDurationValue(Number(event.target.value))} required />
            <select className="control" aria-label="Expiry unit" value={durationUnit} onChange={(event) => { const unit = event.target.value as "days" | "months"; setDurationUnit(unit); setDurationValue(unit === "months" ? 1 : 7); }}><option value="days">Days</option><option value="months">Months</option></select>
          </div></div>
          <div><label className="field-label" htmlFor="share-views">Or after this many reveals</label><input id="share-views" className="control" type="number" min="1" max="100" value={maxViews} onChange={(event) => setMaxViews(Number(event.target.value))} required /></div>
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="action-row"><p>Whichever limit is reached first closes the link. Opening the page alone does not use a reveal.</p><button className="primary-button" type="submit" disabled={busy}>{busy ? "Encrypting…" : "Create share link"}</button></div>
      </div>
    </form>
  );
}
