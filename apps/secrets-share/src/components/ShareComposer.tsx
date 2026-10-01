import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { completeShareUrl, encryptShare, MAX_SHARE_ENTRIES, type ShareContent } from "@outray/share-crypto";
import { isEnvPasteCandidate, mergeEnvEntries, parseEnvPaste } from "../lib/env-paste";

type Entry = { key: string; value: string };

const expiryOptions = [
  { value: "5m", label: "5 minutes", durationValue: 5, durationUnit: "minutes" },
  { value: "15m", label: "15 minutes", durationValue: 15, durationUnit: "minutes" },
  { value: "1h", label: "1 hour", durationValue: 1, durationUnit: "hours" },
  { value: "6h", label: "6 hours", durationValue: 6, durationUnit: "hours" },
  { value: "1d", label: "1 day", durationValue: 1, durationUnit: "days" },
  { value: "7d", label: "7 days", durationValue: 7, durationUnit: "days" },
  { value: "30d", label: "30 days", durationValue: 30, durationUnit: "days" },
  { value: "3mo", label: "3 months", durationValue: 3, durationUnit: "months" },
] as const;

function getExpiryPreview(now: number, selected: (typeof expiryOptions)[number]) {
  const expiresAt = new Date(now);
  if (selected.durationUnit === "minutes") expiresAt.setTime(expiresAt.getTime() + selected.durationValue * 60_000);
  else if (selected.durationUnit === "hours") expiresAt.setTime(expiresAt.getTime() + selected.durationValue * 3_600_000);
  else if (selected.durationUnit === "days") expiresAt.setUTCDate(expiresAt.getUTCDate() + selected.durationValue);
  else {
    const day = expiresAt.getUTCDate();
    expiresAt.setUTCDate(1);
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + selected.durationValue);
    const lastDay = new Date(Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth() + 1, 0)).getUTCDate();
    expiresAt.setUTCDate(Math.min(day, lastDay));
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(expiresAt);
}

export default function ShareComposer() {
  const [mode, setMode] = useState<"text" | "bundle">("text");
  const [plainText, setPlainText] = useState("");
  const [entries, setEntries] = useState<Entry[]>([{ key: "", value: "" }]);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<(typeof expiryOptions)[number]["value"]>("7d");
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [focusedExpiry, setFocusedExpiry] = useState(0);
  const expiryWrapRef = useRef<HTMLDivElement>(null);
  const expiryTriggerRef = useRef<HTMLButtonElement>(null);
  const expiryOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [maxViews, setMaxViews] = useState(10);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewNow, setPreviewNow] = useState<number | null>(null);

  useEffect(() => {
    setPreviewNow(Date.now());
    const timer = window.setInterval(() => setPreviewNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!expiryOpen) return;
    expiryOptionRefs.current[focusedExpiry]?.focus();
  }, [expiryOpen, focusedExpiry]);

  useEffect(() => {
    if (!expiryOpen) return;
    const closeIfOutside = (event: Event) => {
      if (!expiryWrapRef.current?.contains(event.target as Node)) setExpiryOpen(false);
    };
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("focusin", closeIfOutside);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("focusin", closeIfOutside);
    };
  }, [expiryOpen]);

  const openExpiry = (index = expiryOptions.findIndex((option) => option.value === expiry)) => {
    setFocusedExpiry(index);
    setExpiryOpen(true);
  };

  const chooseExpiry = (value: (typeof expiryOptions)[number]["value"]) => {
    setExpiry(value);
    setPreviewNow(Date.now());
    setExpiryOpen(false);
    expiryTriggerRef.current?.focus();
  };

  const onExpiryKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setExpiryOpen(false);
      expiryTriggerRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!expiryOpen) openExpiry();
      else setFocusedExpiry((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + expiryOptions.length) % expiryOptions.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!expiryOpen) openExpiry(event.key === "Home" ? 0 : expiryOptions.length - 1);
      else setFocusedExpiry(event.key === "Home" ? 0 : expiryOptions.length - 1);
    } else if (event.key === "Tab") {
      setExpiryOpen(false);
    }
  };

  const updateEntry = (index: number, field: keyof Entry, value: string) => {
    setEntries((current) => current.map((entry, position) => position === index ? { ...entry, [field]: value } : entry));
  };

  const pasteNamedEntries = (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, index: number, field: keyof Entry) => {
    const pasted = event.clipboardData.getData("text");
    if (!isEnvPasteCandidate(pasted)) return;
    // A single KEY=VALUE string may itself be the intended value of an existing secret.
    if (field === "value" && !/[\r\n]/.test(pasted) && entries[index]?.key) return;
    event.preventDefault();
    try {
      const imported = parseEnvPaste(pasted);
      setEntries(mergeEnvEntries(entries, index, imported, MAX_SHARE_ENTRIES));
      setPasteError(null);
    } catch (cause) {
      setPasteError(cause instanceof Error ? cause.message : "Could not read pasted .env values.");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const content: ShareContent = mode === "text"
        ? { type: "text", text: plainText }
        : { type: "bundle", entries: entries.map(({ key, value }) => ({ key: key.trim(), value })) };
      const encrypted = await encryptShare(content, password || undefined);
      const selectedExpiry = expiryOptions.find((option) => option.value === expiry)!;
      const response = await fetch("/v1/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          verifier: encrypted.verifier,
          passwordSalt: encrypted.passwordSalt,
          passwordVerifier: encrypted.passwordVerifier,
          contentFormat: content.type,
          durationValue: selectedExpiry.durationValue,
          durationUnit: selectedExpiry.durationUnit,
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
      setPassword("");
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
    <form className="share-card composer-card" onSubmit={(event) => void submit(event)}>
      <div className="card-body">
        <div className="form-heading"><div className="form-title"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.5" y="10" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg><h2>Share a secret</h2></div><p>Create an encrypted link that expires on your terms.</p></div>
        <div className="format-row"><span className="field-label">Content format</span><div className="mode-switch" role="group" aria-label="Content format"><button type="button" aria-pressed={mode === "text"} onClick={() => setMode("text")}>Text</button><button type="button" aria-pressed={mode === "bundle"} onClick={() => setMode("bundle")}>Named secrets</button></div></div>
        {mode === "text" ? (
          <div className="form-field secret-field"><label className="field-label" htmlFor="share-text">Secret value</label>
            <textarea id="share-text" className="control" placeholder="Paste a password, API key, or private note…" value={plainText} onChange={(event) => setPlainText(event.target.value)} required />
          </div>
        ) : (
          <div className="form-field"><span className="field-label">Named secrets</span><p className="env-paste-hint">Paste <code>KEY=VALUE</code> lines into a row to add them automatically.</p><div className="entries">
            {entries.map((entry, index) => <div className="entry-row" key={index}>
              <input className="control" aria-label={`Secret ${index + 1} name`} placeholder="NAME" value={entry.key} onChange={(event) => updateEntry(index, "key", event.target.value)} onPaste={(event) => pasteNamedEntries(event, index, "key")} required />
              <textarea className="control entry-value" aria-label={`Secret ${index + 1} value`} placeholder="Value" rows={Math.min(4, Math.max(1, entry.value.split("\n").length))} value={entry.value} onChange={(event) => updateEntry(index, "value", event.target.value)} onPaste={(event) => pasteNamedEntries(event, index, "value")} />
              <button type="button" aria-label={`Remove secret ${index + 1}`} disabled={entries.length === 1} onClick={() => setEntries((current) => current.filter((_, position) => position !== index))}>×</button>
            </div>)}
          </div>{pasteError && <p className="paste-error" role="alert">{pasteError}</p>}<button className="secondary-button" type="button" style={{ marginTop: 12 }} disabled={entries.length >= MAX_SHARE_ENTRIES} onClick={() => setEntries((current) => [...current, { key: "", value: "" }])}>+ Add secret</button></div>
        )}
        <div className="form-field expiry-field"><span className="field-label" id="share-expiry-label">Expires in</span><div className="select-wrap" ref={expiryWrapRef} onKeyDown={onExpiryKeyDown}>
          <button ref={expiryTriggerRef} type="button" className="control expiry-trigger" aria-haspopup="listbox" aria-expanded={expiryOpen} aria-controls="share-expiry-options" aria-labelledby="share-expiry-label share-expiry-value" onClick={() => expiryOpen ? setExpiryOpen(false) : openExpiry()}>
            <span id="share-expiry-value">{expiryOptions.find((option) => option.value === expiry)?.label}</span>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {expiryOpen && <div id="share-expiry-options" className="expiry-menu" role="listbox" aria-labelledby="share-expiry-label">
            {expiryOptions.map((option, index) => <button key={option.value} ref={(node) => { expiryOptionRefs.current[index] = node; }} type="button" className="expiry-option" role="option" aria-selected={expiry === option.value} tabIndex={-1} onClick={() => chooseExpiry(option.value)}>{option.label}{expiry === option.value && <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}</button>)}
          </div>}
        </div><p className="expiry-hint">{previewNow === null ? "The link expires after the selected time." : `If created now, the link expires ${getExpiryPreview(previewNow, expiryOptions.find((option) => option.value === expiry)!)}.`}</p></div>
        <details className="advanced-options"><summary><svg className="options-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-3 1v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg><span>More options</span><span className="summary-hint">{maxViews} {maxViews === 1 ? "reveal" : "reveals"} · {password ? "Password set" : "No password"}</span><svg className="options-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
          <div className="advanced-body">
            <div className="form-field"><label className="field-label" htmlFor="share-views">Maximum reveals</label><input id="share-views" className="control" type="number" min="1" max="100" value={maxViews} onChange={(event) => setMaxViews(Number(event.target.value))} required /><p className="field-note">Opening the link does not use a reveal. The recipient must press Reveal.</p></div>
            <div className="form-field"><label className="field-label" htmlFor="share-password">Password <span className="optional-label">Optional</span></label><div className="password-control"><input id="share-password" className="control" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={256} placeholder="Add a second layer of protection" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div><p className="field-note">At least 8 characters. Send it separately from the link.</p></div>
          </div>
        </details>
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="action-row"><a className="powered-by" href="https://outray.co" target="_blank" rel="noopener noreferrer"><img src="/outray-mark.svg" width="16" height="16" alt="" />Powered by OutRay</a><button className="primary-button" type="submit" disabled={busy}>{busy ? "Encrypting…" : "Create share link"}</button></div>
      </div>
    </form>
  );
}
