import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { organizationInitials, organizationLogo } from "../sidebar/organization-switcher-state";

export interface OrganizationLogoFeedback { message: string; error: boolean }
export interface OrganizationLogoUploadProps {
  orgSlug: string;
  name: string;
  image?: string | null;
  onUploaded: (url: string) => void;
  onFeedback: (feedback: OrganizationLogoFeedback | null) => void;
}

const maxLogoBytes = 256 * 1024;

export function OrganizationLogoUpload({ orgSlug, name, image, onUploaded, onFeedback }: OrganizationLogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const logo = organizationLogo(image);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // A failed upload can be retried by choosing the same file again.
    event.currentTarget.value = "";
    if (!file || pending.current || !mounted.current) return;
    onFeedback(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size === 0 || file.size > maxLogoBytes) {
      onFeedback({ message: "Choose a PNG, JPEG or WebP image up to 256 KB.", error: true });
      return;
    }
    pending.current = true;
    setUploading(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const body = new FormData();
      body.set("logo", file);
      const response = await fetch(`/api/${encodeURIComponent(orgSlug)}/organization/logo`, {
        method: "POST", credentials: "same-origin", body, signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as { logoUrl?: unknown; error?: unknown } | null;
      if (!mounted.current || controller.signal.aborted) return;
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Could not upload the organization logo.");
      const url = typeof payload?.logoUrl === "string" ? organizationLogo(payload.logoUrl) : null;
      if (!url || !url.startsWith("https://")) throw new Error("The upload did not return a valid logo URL. Try again.");
      onUploaded(url);
      onFeedback({ message: "Organization logo updated.", error: false });
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) {
        onFeedback({ message: error instanceof Error ? error.message : "Could not upload the organization logo.", error: true });
      }
    } finally {
      pending.current = false;
      if (request.current === controller) request.current = null;
      if (mounted.current) setUploading(false);
    }
  }

  return <>
    <button type="button" aria-label={logo ? "Change organization logo" : "Upload organization logo"}
      title="PNG, JPEG or WebP, up to 256 KB" aria-busy={uploading || undefined} disabled={uploading}
      onClick={() => { if (!pending.current) input.current?.click(); }}
      className="group relative grid size-11 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border border-white/[.09] bg-[#202020] text-sm font-medium text-zinc-300 transition-colors hover:border-white/25 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent disabled:cursor-wait motion-reduce:transition-none">
      {logo && failedImage !== logo ? <img src={logo} alt="" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFailedImage(logo)} /> : <span aria-hidden="true">{organizationInitials(name)}</span>}
      <span aria-hidden="true" className={`pointer-events-none absolute right-0.5 bottom-0.5 grid size-5 place-items-center rounded-md border border-white/15 bg-[#151515]/95 text-zinc-200 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100 motion-reduce:transition-none ${uploading ? "opacity-100" : "opacity-0"}`}>
        {uploading ? <LoaderCircle size={12} className="animate-spin motion-reduce:animate-none" /> : <ImagePlus size={12} />}
      </span>
    </button>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,.jpg,.jpeg" aria-label="Choose organization logo" hidden disabled={uploading} onChange={(event) => void upload(event)} />
  </>;
}
