import { useEffect, useRef, type RefObject } from "react";
import { useAgentChat } from "@/components/agent/agent-chat-context";

interface RequestExplanationPreviewSheetProps {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/** Older preview launchers hand off to the shared agent without opening a second sheet. */
export function RequestExplanationPreviewSheet({ open, onClose }: RequestExplanationPreviewSheetProps) {
  const { startThread } = useAgentChat();
  const forwarded = useRef(false);

  useEffect(() => {
    if (!open) {
      forwarded.current = false;
      return;
    }
    if (forwarded.current) return;
    forwarded.current = true;
    startThread();
    onClose();
  }, [open, onClose, startThread]);

  return null;
}
