import { useEffect, useState, type FormEvent } from "react";
import { decryptShare, shareNeedsPassword, sharePasswordVerifier, shareVerifier, type ShareContent } from "@outray/share-crypto";
import { entriesAsEnv, entriesAsJson, type NamedEntry } from "../lib/export-entries";
import { ShareExportButton } from "./ShareExportButton";

const controlClasses = "min-h-[43px] w-full rounded-[11px] border border-[#303036] bg-[#0c0c0f] px-[13px] py-[10px] text-[#f0f0f3] outline-none placeholder:text-[#62626b] focus:border-[#9b82d9] focus:shadow-[0_0_0_2px_#8367c72b]";
const primaryButtonClasses = "min-h-[43px] rounded-[11px] border border-[#f0eff4] bg-[#f0eff4] px-[19px] text-[13px] font-semibold text-[#101013] hover:bg-[#d8d5e0]";
const secondaryButtonClasses = "min-h-10 rounded-[10px] border border-[#3a3a42] bg-[#1b1b20] px-[14px] text-[13px] text-[#dddde2] hover:bg-[#28272d]";

export default function ShareReveal({ id }: { id: string }) {
  const [content, setContent] = useState<ShareContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [password, setPassword] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setPasswordProtected(shareNeedsPassword(window.location.hash.slice(1)));
    } catch {
      setError("This share link is incomplete or invalid.");
    }
  }, []);

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

  return <div className="mt-9 w-full max-w-[760px] overflow-visible rounded-[20px] border border-[#2d2d32] bg-[#101013] max-[900px]:max-w-[660px]">
    <div className="flex items-start justify-between gap-4 border-b border-[#26262b] px-7 py-6 max-[640px]:flex-wrap max-[640px]:px-[18px]">
      <div className="min-w-0 max-[640px]:[flex:1_1_200px]"><h2 className="mb-[5px] text-lg font-medium tracking-[-0.025em]">{content ? "Shared with you" : "Ready when you are"}</h2><p className="m-0 text-[13px] leading-normal text-[#8d8d95]">{content ? "This content is visible only in this browser session." : "The content stays hidden until you choose to reveal it."}</p></div>
      {content?.type === "bundle" && <div className="flex-none">
        <ShareExportButton onExport={(format) => downloadEntries(format, content.entries)} />
      </div>}
    </div>
    <div className="px-7 pt-[27px] pb-[30px] max-[640px]:px-[18px]">
      {!content ? <form onSubmit={(event) => void reveal(event)}>
        {passwordProtected && <div className="mb-[22px] max-w-[420px]"><label className="mb-[9px] block text-[13px] text-[#d7d7dd]" htmlFor="reveal-password">Password</label><input id="reveal-password" className={controlClasses} type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>}
        <button className={primaryButtonClasses} type="submit" disabled={busy}>{busy ? "Opening…" : "Reveal secret"}</button>
      </form> : content.type === "text" ? (
        <><div className="whitespace-pre-wrap rounded-[11px] border border-[#303036] bg-[#0b0b0e] p-[17px] font-mono text-[13px] leading-[1.65] [overflow-wrap:anywhere]">{content.text}</div><button className={`${secondaryButtonClasses} mt-[14px]`} onClick={() => void navigator.clipboard.writeText(content.text).then(() => setCopied("text"))}>{copied === "text" ? "Copied" : "Copy text"}</button></>
      ) : <div>
        {exportError && <p className="mb-[15px] text-xs leading-normal text-[#ffc5ce]" role="alert">{exportError}</p>}
        <div className="overflow-hidden rounded-[11px] border border-[#303036]" role="list" aria-label="Shared secrets">
          <div className="grid grid-cols-[minmax(110px,.85fr)_minmax(0,1.65fr)_55px] gap-x-4 border-b border-[#303036] bg-[#18181b] px-4 py-[10px] text-[11px] text-[#85858f] max-[640px]:hidden" aria-hidden="true"><span>Key</span><span>Value</span></div>
          {content.entries.map((entry, index) => <div className={`grid grid-cols-[minmax(110px,.85fr)_minmax(0,1.65fr)_55px] items-start gap-x-4 border-[#29292e] bg-[#0c0c0f] px-4 py-[13px] max-[640px]:grid-cols-[minmax(0,1fr)_auto] max-[640px]:gap-x-3 max-[640px]:gap-y-[5px] ${index === 0 ? "border-t-0" : "border-t"}`} role="listitem" key={index}>
            <div className="min-w-0 whitespace-pre-wrap font-mono text-xs leading-[1.65] text-[#bda7e3] [overflow-wrap:anywhere] max-[640px]:col-start-1 max-[640px]:row-start-1">{entry.key}</div>
            <div className="min-w-0 whitespace-pre-wrap font-mono text-xs leading-[1.65] text-[#e7e7ea] [overflow-wrap:anywhere] max-[640px]:col-span-full max-[640px]:col-start-1 max-[640px]:row-start-2">{entry.value}</div>
            <button className="min-h-[22px] justify-self-end border-0 bg-transparent py-px text-[11px] text-[#95959e] hover:text-[#f5f5f6] max-[640px]:col-start-2 max-[640px]:row-start-1" type="button" aria-label={`Copy value for ${entry.key}`} onClick={() => void navigator.clipboard.writeText(entry.value).then(() => setCopied(String(index)))}>
              {copied === String(index) ? "Copied" : "Copy"}
            </button>
          </div>)}
        </div>
      </div>}
      {error && <p className="mt-4 rounded-[10px] border border-[#a24152] bg-[#3a151d] px-[13px] py-[10px] text-[13px] text-[#ffc5ce]" role="alert">{error}</p>}
    </div>
  </div>;
}
