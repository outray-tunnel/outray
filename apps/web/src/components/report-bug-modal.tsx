import { X, Bug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Modal, ModalHeader, ModalContent, Button, Label, IconButton } from "@/components/ui";

interface ReportBugModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  userName?: string;
}

export function ReportBugModal({
  isOpen,
  onClose,
  userEmail,
  userName,
}: ReportBugModalProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("https://api.formdrop.co/f/P4AObh0E", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: userName || "Anonymous",
          email: userEmail || "anonymous@example.com",
          message: message,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });

      if (response.ok) {
        toast.success("Bug report sent successfully! We'll look into it.");
        setMessage("");
        onClose();
      } else {
        throw new Error("Failed to send report");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to send bug report. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader
        icon={<Bug className="w-6 h-6" />}
        iconClassName="bg-red-500/10 text-red-400 border border-red-500/20"
        title="Report a Bug"
        description="Found an issue? Let us know so we can fix it."
        onClose={onClose}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="message">Describe the issue</Label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please describe the bug you encountered. Include steps to reproduce if possible..."
              className="mt-2 w-full h-64 bg-black/40 border border-white/10 rounded-xl p-4 text-base text-white placeholder:text-white/20 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 resize-none transition-all"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !message.trim()}
              isLoading={isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Send Report"}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
