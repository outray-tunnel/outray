import { useState } from "react";
import { decryptShare, shareVerifier, type ShareContent } from "@outray/share-crypto";

export default function ShareReveal({ id }: { id: string }) {
  const [content, setContent] = useState<ShareContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = window.location.hash.slice(1);
      if (!key) throw new Error("This link is missing its decryption key.");
      const verifier = await shareVerifier(key);
      const response = await fetch(`/v1/shares/${encodeURIComponent(id)}/reveal`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifier }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The share service is unavailable. Please try again later.");
      }
      const encrypted = await response.json();
      if (!response.ok) throw new Error(encrypted.error || "This link is unavailable.");
      setContent(await decryptShare(encrypted, key));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This link is unavailable.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="share-card">
    <div className="card-top"><h2>{content ? "Shared with you" : "Ready when you are"}</h2><p>{content ? "This content is visible only in this browser session." : "The content stays hidden until you choose to reveal it."}</p></div>
    <div className="card-body">
      {!content ? <button className="primary-button" onClick={() => void reveal()} disabled={busy}>{busy ? "Opening…" : "Reveal secret"}</button> : content.type === "text" ? (
        <><div className="revealed-text">{content.text}</div><button className="secondary-button" style={{ marginTop: 14 }} onClick={() => void navigator.clipboard.writeText(content.text).then(() => setCopied("text"))}>{copied === "text" ? "Copied" : "Copy text"}</button></>
      ) : <div>{content.entries.map((entry, index) => <div className="revealed-entry" key={index}>
        <strong>{entry.key}</strong><div className="revealed-text">{entry.value}</div><button className="secondary-button" style={{ marginTop: 9 }} onClick={() => void navigator.clipboard.writeText(entry.value).then(() => setCopied(String(index)))}>{copied === String(index) ? "Copied" : "Copy value"}</button>
      </div>)}</div>}
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  </div>;
}
