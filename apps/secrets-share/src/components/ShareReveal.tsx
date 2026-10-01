import { useEffect, useRef, useState, type FormEvent } from "react";
import { decryptShare, shareNeedsPassword, sharePasswordVerifier, shareVerifier, type ShareContent } from "@outray/share-crypto";
import { entriesAsEnv, entriesAsJson, type NamedEntry } from "../lib/export-entries";

export default function ShareReveal({ id }: { id: string }) {
  const [content, setContent] = useState<ShareContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [password, setPassword] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportControlRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      setPasswordProtected(shareNeedsPassword(window.location.hash.slice(1)));
    } catch {
      setError("This share link is incomplete or invalid.");
    }
  }, []);

  useEffect(() => {
    if (!exportOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!exportControlRef.current?.contains(event.target as Node)) setExportOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setExportOpen(false);
      exportButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [exportOpen]);

  const reveal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const key = window.location.hash.slice(1);
      if (!key) throw new Error("This link is missing its decryption key.");
      const requiresPassword = shareNeedsPassword(key);
      if (requiresPassword && !password) throw new Error("Enter the password to reveal this secret.");
      const verifier = await shareVerifier(key);
      const passwordVerifier = requiresPassword ? await sharePasswordVerifier(key, password) : undefined;
      const response = await fetch(`/v1/shares/${encodeURIComponent(id)}/reveal`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifier, passwordVerifier }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The share service is unavailable. Please try again later.");
      }
      const encrypted = await response.json();
      if (!response.ok) throw new Error(requiresPassword && response.status === 404
        ? "Incorrect password or this link is unavailable." : encrypted.error || "This link is unavailable.");
      setContent(await decryptShare(encrypted, key, requiresPassword ? password : undefined));
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This link is unavailable.");
    } finally {
      setBusy(false);
    }
  };

  const downloadEntries = (format: "env" | "json", entries: NamedEntry[]) => {
    setExportOpen(false);
    setExportError(null);
    try {
      const body = format === "env" ? entriesAsEnv(entries) : entriesAsJson(entries);
      const file = new Blob([body], { type: format === "env" ? "text/plain;charset=utf-8" : "application/json;charset=utf-8" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = format === "env" ? "outray-secrets.env" : "outray-secrets.json";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Could not export these secrets.");
    }
  };

  return <div className="share-card reveal-card">
    <div className="card-top reveal-card-top">
      <div><h2>{content ? "Shared with you" : "Ready when you are"}</h2><p>{content ? "This content is visible only in this browser session." : "The content stays hidden until you choose to reveal it."}</p></div>
      {content?.type === "bundle" && <div className="export-control" ref={exportControlRef} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setExportOpen(false);
      }}>
        <button className="export-trigger" ref={exportButtonRef} type="button" aria-expanded={exportOpen} aria-controls="share-export-options" onClick={() => setExportOpen((open) => !open)}>
          Export <svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {exportOpen && <div className="export-dropdown" id="share-export-options">
          <button type="button" onClick={() => downloadEntries("env", content.entries)}><span>Download .env</span><small>Environment variables</small></button>
          <button type="button" onClick={() => downloadEntries("json", content.entries)}><span>Download JSON</span><small>Key/value object</small></button>
          <p>Files contain unencrypted secrets.</p>
        </div>}
      </div>}
    </div>
    <div className="card-body">
      {!content ? <form onSubmit={(event) => void reveal(event)}>
        {passwordProtected && <div className="form-field"><label className="field-label" htmlFor="reveal-password">Password</label><input id="reveal-password" className="control" type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Opening…" : "Reveal secret"}</button>
      </form> : content.type === "text" ? (
        <><div className="revealed-text">{content.text}</div><button className="secondary-button" style={{ marginTop: 14 }} onClick={() => void navigator.clipboard.writeText(content.text).then(() => setCopied("text"))}>{copied === "text" ? "Copied" : "Copy text"}</button></>
      ) : <div>
        {exportError && <p className="paste-error export-error" role="alert">{exportError}</p>}
        <div className="secret-list" role="list" aria-label="Shared secrets">
          <div className="secret-list-heading" aria-hidden="true"><span>Key</span><span>Value</span></div>
          {content.entries.map((entry, index) => <div className="secret-row" role="listitem" key={index}>
            <div className="secret-key">{entry.key}</div>
            <div className="secret-value">{entry.value}</div>
            <button className="secret-copy" type="button" aria-label={`Copy value for ${entry.key}`} onClick={() => void navigator.clipboard.writeText(entry.value).then(() => setCopied(String(index)))}>
              {copied === String(index) ? "Copied" : "Copy"}
            </button>
          </div>)}
        </div>
      </div>}
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  </div>;
}
