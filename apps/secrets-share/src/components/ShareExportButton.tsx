import { Download, FileJson, FileKey } from "lucide-react";
import { SplitButton } from "./arc/split-button/split-button";

export type ShareExportFormat = "env" | "json";

export function ShareExportButton({ onExport }: { onExport: (format: ShareExportFormat) => void }) {
  return <SplitButton
    label="Export .env"
    icon={<Download size={15} aria-hidden="true" />}
    variant="secondary"
    onClick={() => onExport("env")}
    actions={[
      { label: "Download .env", icon: <FileKey size={16} />, onSelect: () => onExport("env") },
      { label: "Download JSON", icon: <FileJson size={16} />, onSelect: () => onExport("json") },
    ]}
    menuFooter={<p className="mx-[5px] mt-[5px] mb-[3px] border-t border-[#34343b] px-[5px] pt-[9px] pb-0.5 text-[11px] leading-normal text-[#a2a2aa]">Files contain unencrypted secrets.</p>}
  />;
}
