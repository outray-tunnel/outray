import { Download, FileJson, FileKey } from "lucide-react";
import { SplitButton } from "./arc/split-button/split-button";
import styles from "./ShareExportButton.module.css";

export type ShareExportFormat = "env" | "json";

export function ShareExportButton({ onExport }: { onExport: (format: ShareExportFormat) => void }) {
  return <SplitButton
    label="Export .env"
    icon={<Download size={15} aria-hidden="true" />}
    variant="secondary"
    className={styles.theme}
    menuClassName={styles.theme}
    onClick={() => onExport("env")}
    actions={[
      { label: "Download .env", icon: <FileKey size={16} />, onSelect: () => onExport("env") },
      { label: "Download JSON", icon: <FileJson size={16} />, onSelect: () => onExport("json") },
    ]}
    menuFooter={<p className={styles.warning}>Files contain unencrypted secrets.</p>}
  />;
}
