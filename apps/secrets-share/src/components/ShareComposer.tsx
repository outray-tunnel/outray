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

const cardClasses = "w-full max-w-[760px] rounded-[20px] border border-[#2d2d32] bg-[#101013] max-[900px]:max-w-[660px]";
const controlClasses = "min-h-[43px] w-full rounded-[11px] border border-[#303036] bg-[#0c0c0f] px-[13px] py-[10px] text-[#f0f0f3] outline-none placeholder:text-[#62626b] focus:border-[#9b82d9] focus:shadow-[0_0_0_2px_#8367c72b]";
const fieldLabelClasses = "mb-[9px] block text-[13px] text-[#d7d7dd]";
const primaryButtonClasses = "min-h-[43px] rounded-[11px] border border-[#f0eff4] bg-[#f0eff4] px-[19px] text-[13px] font-semibold text-[#101013] hover:bg-[#d8d5e0]";
const secondaryButtonClasses = "min-h-10 rounded-[10px] border border-[#3a3a42] bg-[#1b1b20] px-[14px] text-[13px] text-[#dddde2] hover:bg-[#28272d]";

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
    <div className={`${cardClasses} overflow-hidden`}>
      <div className="border-b border-[#26262b] px-7 py-6 max-[640px]:px-[18px]"><h2 className="mb-[5px] text-lg font-medium tracking-[-0.025em]">Your link is ready</h2><p className="m-0 text-[13px] leading-normal text-[#8d8d95]">Copy it now. OutRay cannot recover the complete link later.</p></div>
      <div className="px-7 pt-[27px] pb-[30px] max-[640px]:px-[18px]">
        <div className="rounded-[13px] border border-[#3f6355] bg-[#10231b] p-[18px]">
          <h3 className="mb-2 text-[17px] font-medium">Encrypted and ready to send</h3>
          <p className="text-[13px] leading-[1.55] text-[#b7cabd]">Only someone with this complete link can decrypt the content. The link stops working when its time or reveal limit is reached.</p>
          <div className="mt-[15px] flex gap-2 max-[640px]:flex-col">
            <input className={`${controlClasses} font-mono text-xs`} aria-label="Complete share link" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
            <button className={primaryButtonClasses} onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</button>
          </div>
        </div>
        <button className={`${secondaryButtonClasses} mt-[22px]`} onClick={() => { setLink(null); setCopied(false); }}>Share another</button>
      </div>
    </div>
  );

  return (
    <form className={`${cardClasses} overflow-visible`} onSubmit={(event) => void submit(event)}>
      <div className="p-[26px] max-[640px]:px-[18px]">
        <div className="mb-[22px]"><div className="mb-[6px] flex items-center gap-[9px]"><svg className="size-[19px] flex-none text-[#c2acd9]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.5" y="10" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg><h2 className="text-[19px] leading-tight font-medium tracking-[-0.025em]">Share a secret</h2></div><p className="text-[13px] leading-normal text-[#8d8d95]">Create an encrypted link that expires on your terms.</p></div>
        <div className="mb-[18px] flex items-center justify-between gap-4 max-[640px]:flex-col max-[640px]:items-start max-[640px]:gap-[9px]"><span className="block text-[13px] text-[#d7d7dd]">Content format</span><div className="inline-flex gap-[3px] rounded-[11px] border border-[#303036] bg-[#18181d] p-1" role="group" aria-label="Content format"><button className="rounded-lg border-0 bg-transparent px-[15px] py-2 text-[13px] text-[#8e8e96] aria-pressed:bg-[#313038] aria-pressed:text-white" type="button" aria-pressed={mode === "text"} onClick={() => setMode("text")}>Text</button><button className="rounded-lg border-0 bg-transparent px-[15px] py-2 text-[13px] text-[#8e8e96] aria-pressed:bg-[#313038] aria-pressed:text-white" type="button" aria-pressed={mode === "bundle"} onClick={() => setMode("bundle")}>Named secrets</button></div></div>
        {mode === "text" ? (
          <div className="mb-[22px]"><label className={fieldLabelClasses} htmlFor="share-text">Secret value</label>
            <textarea id="share-text" className={`${controlClasses} min-h-[118px] resize-y leading-relaxed`} placeholder="Paste a password, API key, or private note…" value={plainText} onChange={(event) => setPlainText(event.target.value)} required />
          </div>
        ) : (
          <div className="mb-[22px]"><span className={fieldLabelClasses}>Named secrets</span><p className="mt-[-3px] mb-3 text-xs leading-normal text-[#85858f]">Paste <code className="font-mono text-[11px] text-[#bfb0df]">KEY=VALUE</code> lines into a row to add them automatically.</p><div className="grid gap-[10px]">
            {entries.map((entry, index) => <div className="grid grid-cols-[minmax(130px,1fr)_minmax(170px,1.5fr)_auto] gap-[9px] max-[640px]:grid-cols-[1fr_auto]" key={index}>
              <input className={`${controlClasses} max-[640px]:col-start-1 max-[640px]:row-start-1`} aria-label={`Secret ${index + 1} name`} placeholder="NAME" value={entry.key} onChange={(event) => updateEntry(index, "key", event.target.value)} onPaste={(event) => pasteNamedEntries(event, index, "key")} required />
              <textarea className={`${controlClasses} min-h-[43px] resize-y leading-normal max-[640px]:col-start-1 max-[640px]:row-start-2`} aria-label={`Secret ${index + 1} value`} placeholder="Value" rows={Math.min(4, Math.max(1, entry.value.split("\n").length))} value={entry.value} onChange={(event) => updateEntry(index, "value", event.target.value)} onPaste={(event) => pasteNamedEntries(event, index, "value")} />
              <button className="min-w-[42px] rounded-[10px] border border-[#333339] bg-[#1d1d21] text-[#b3b3bb] max-[640px]:col-start-2 max-[640px]:row-span-2 max-[640px]:row-start-1" type="button" aria-label={`Remove secret ${index + 1}`} disabled={entries.length === 1} onClick={() => setEntries((current) => current.filter((_, position) => position !== index))}>×</button>
            </div>)}
          </div>{pasteError && <p className="mt-[10px] text-xs leading-normal text-[#ffc5ce]" role="alert">{pasteError}</p>}<button className={`${secondaryButtonClasses} mt-3`} type="button" disabled={entries.length >= MAX_SHARE_ENTRIES} onClick={() => setEntries((current) => [...current, { key: "", value: "" }])}>+ Add secret</button></div>
        )}
        <div className="mb-[22px]"><span className={fieldLabelClasses} id="share-expiry-label">Expires in</span><div className="relative" ref={expiryWrapRef} onKeyDown={onExpiryKeyDown}>
          <button ref={expiryTriggerRef} type="button" className={`${controlClasses} flex cursor-pointer items-center justify-between gap-3 text-left aria-expanded:border-[#9b82d9] aria-expanded:shadow-[0_0_0_2px_#8367c72b]`} aria-haspopup="listbox" aria-expanded={expiryOpen} aria-controls="share-expiry-options" aria-labelledby="share-expiry-label share-expiry-value" onClick={() => expiryOpen ? setExpiryOpen(false) : openExpiry()}>
            <span id="share-expiry-value">{expiryOptions.find((option) => option.value === expiry)?.label}</span>
            <svg className="pointer-events-none size-[18px] flex-none text-[#aaaab2]" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {expiryOpen && <div id="share-expiry-options" className="absolute top-[calc(100%+6px)] right-0 left-0 z-20 max-h-[280px] overflow-y-auto rounded-[11px] border border-[#383840] bg-[#1b1b20] p-[5px] shadow-[0_18px_45px_#0009]" role="listbox" aria-labelledby="share-expiry-label">
            {expiryOptions.map((option, index) => <button key={option.value} ref={(node) => { expiryOptionRefs.current[index] = node; }} type="button" className="flex min-h-9 w-full items-center justify-between gap-[10px] rounded-[7px] border-0 bg-transparent px-[10px] py-[7px] text-left text-[13px] text-[#c5c5cc] hover:bg-[#2b2535] hover:text-white focus-visible:bg-[#2b2535] focus-visible:text-white aria-selected:text-[#d9c7ff]" role="option" aria-selected={expiry === option.value} tabIndex={-1} onClick={() => chooseExpiry(option.value)}>{option.label}{expiry === option.value && <svg className="size-[18px] flex-none text-[#ad91e9]" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}</button>)}
          </div>}
        </div><p className="mt-2 text-xs leading-normal text-[#898991]">{previewNow === null ? "The link expires after the selected time." : `If created now, the link expires ${getExpiryPreview(previewNow, expiryOptions.find((option) => option.value === expiry)!)}.`}</p></div>
        <details className="group overflow-hidden rounded-[11px] border border-[#303036] bg-[#151518]"><summary className="flex min-h-[49px] cursor-pointer list-none items-center gap-[10px] px-[14px] text-[13px] text-[#dedee3] hover:bg-[#1c1c20] [&::-webkit-details-marker]:hidden"><svg className="size-[17px] flex-none text-[#8d8d95]" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-3 1v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg><span>More options</span><span className="ml-auto text-xs text-[#797983] max-[640px]:hidden">{maxViews} {maxViews === 1 ? "reveal" : "reveals"} · {password ? "Password set" : "No password"}</span><svg className="size-[17px] flex-none text-[#8d8d95] transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none max-[640px]:ml-auto" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
          <div className="border-t border-[#303036] px-[14px] pt-[18px] pb-0">
            <div className="mb-[22px]"><label className={fieldLabelClasses} htmlFor="share-views">Maximum reveals</label><input id="share-views" className={controlClasses} type="number" min="1" max="100" value={maxViews} onChange={(event) => setMaxViews(Number(event.target.value))} required /><p className="mt-2 text-xs leading-[1.55] text-[#85858f]">Opening the link does not use a reveal. The recipient must press Reveal.</p></div>
            <div className="mb-4"><label className={fieldLabelClasses} htmlFor="share-password">Password <span className="ml-[5px] font-normal text-[#85858f]">Optional</span></label><div className="relative"><input id="share-password" className={`${controlClasses} pr-[65px]`} type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={256} placeholder="Add a second layer of protection" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="absolute top-0 right-0 h-11 rounded-[7px] border-0 bg-transparent px-[11px] text-xs text-[#aaaab2] hover:bg-[#25252b] hover:text-white" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div><p className="mt-2 text-xs leading-[1.55] text-[#85858f]">At least 8 characters. Send it separately from the link.</p></div>
          </div>
        </details>
        {error && <p className="mt-4 rounded-[10px] border border-[#a24152] bg-[#3a151d] px-[13px] py-[10px] text-[13px] text-[#ffc5ce]" role="alert">{error}</p>}
        <div className="mt-[22px] flex items-center justify-between gap-[18px] max-[640px]:flex-col-reverse max-[640px]:items-stretch max-[640px]:gap-[14px]"><a className="inline-flex items-center gap-[7px] whitespace-nowrap text-xs text-[#898991] no-underline hover:text-[#e4e4e8] [&_img]:opacity-60 hover:[&_img]:opacity-100 max-[640px]:self-center" href="https://outray.co" target="_blank" rel="noopener noreferrer"><img className="brightness-0 invert" src="/outray-mark.svg" width="16" height="16" alt="" />Powered by OutRay</a><button className={`${primaryButtonClasses} flex-none max-[640px]:w-full`} type="submit" disabled={busy}>{busy ? "Encrypting…" : "Create share link"}</button></div>
      </div>
    </form>
  );
}
