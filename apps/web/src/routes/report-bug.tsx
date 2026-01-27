import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/shared";
import { ArrowRight, CheckCircle2, Loader2, Bug } from "lucide-react";

export const Route = createFileRoute("/report-bug")({
  head: () => ({
    meta: [
      { title: "Report a Bug - OutRay" },
    ],
  }),
  component: ReportBugPage,
});

function ReportBugPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("https://api.formdrop.co/f/P4AObh0E", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          message,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit");
      }

      setIsSubmitted(true);
      setEmail("");
      setMessage("");
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-accent/30 font-sans">
      <Navbar />

      <div className="pt-32 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-6">
              <Bug className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              Report a Bug
            </h1>
            <p className="text-lg text-white/60 max-w-xl mx-auto">
              Found something that's not working right? Let us know and we'll fix it as soon as possible.
            </p>
          </div>

          <div className="bg-[#0c0c0c] border border-white/10 rounded-3xl p-8 md:p-10">
            {isSubmitted ? (
              <div className="flex items-center gap-4 text-green-400 bg-green-400/10 border border-green-400/20 rounded-2xl p-6">
                <CheckCircle2 size={28} />
                <div>
                  <p className="font-bold text-lg">Bug report submitted!</p>
                  <p className="text-sm text-green-400/70">
                    Thank you for helping us improve OutRay. We'll investigate this issue.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-white/50 mb-2"
                  >
                    Your email (so we can follow up)
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-4 py-3.5 bg-black/40 border border-white/5 rounded-2xl text-white placeholder:text-white/20 outline-none transition-all focus:border-accent/50 focus:bg-black/60 focus:ring-1 focus:ring-accent/50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="message"
                    className="block text-sm font-medium text-white/50 mb-2"
                  >
                    Describe the issue
                  </label>
                  <textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Please describe the bug you encountered. Include steps to reproduce if possible..."
                    required
                    rows={8}
                    className="w-full px-4 py-3.5 bg-black/40 border border-white/5 rounded-2xl text-white placeholder:text-white/20 outline-none transition-all focus:border-accent/50 focus:bg-black/60 focus:ring-1 focus:ring-accent/50 resize-none"
                  />
                </div>

                <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                  <p className="text-sm text-white/40">
                    <span className="text-white/60 font-medium">Tip:</span> The more details you provide, the faster we can fix the issue. Include what you expected to happen vs what actually happened.
                  </p>
                </div>

                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-white text-black font-medium rounded-full hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      Submit Report
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
