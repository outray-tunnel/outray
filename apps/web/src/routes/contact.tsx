import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/shared";
import { ArrowRight, CheckCircle2, Copy, Check, Mail, Handshake, Shield, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us - OutRay" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const copyToClipboard = (emailToCopy: string) => {
    navigator.clipboard.writeText(emailToCopy);
    setCopiedEmail(emailToCopy);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("https://api.formdrop.co/f/PrAcwz0j", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          message,
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

  const emails = [
    { label: "Support", email: "support@outray.dev", icon: Mail, description: "Questions & help" },
    { label: "Partnerships", email: "hey@outray.dev", icon: Handshake, description: "Business inquiries" },
    { label: "Security", email: "security@outray.dev", icon: Shield, description: "Report vulnerabilities" },
  ];

  return (
    <div className="min-h-screen bg-black text-white selection:bg-accent/30 font-sans">
      <Navbar />

      <div className="pt-32 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 mb-6">
              <MessageCircle className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              Get in touch
            </h1>
            <p className="text-lg text-white/60 max-w-xl mx-auto">
              Have a question or need help? We'd love to hear from you.
            </p>
          </div>

          {/* Email cards row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {emails.map((item) => (
              <div 
                key={item.email}
                className="bg-[#0c0c0c] border border-white/10 rounded-2xl p-4 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                  <item.icon size={18} className="text-white/50" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white/40">{item.description}</p>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`mailto:${item.email}`}
                      className="text-sm text-accent hover:text-accent/80 font-medium transition-colors truncate"
                    >
                      {item.email}
                    </a>
                    <button
                      onClick={() => copyToClipboard(item.email)}
                      className="p-1 text-white/30 hover:text-white hover:bg-white/10 rounded-md transition-all shrink-0"
                      title="Copy email"
                    >
                      {copiedEmail === item.email ? (
                        <Check size={12} className="text-green-400" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Form */}
          <div className="bg-[#0c0c0c] border border-white/10 rounded-3xl p-8 md:p-10">
            {isSubmitted ? (
              <div className="flex items-center gap-4 text-green-400 bg-green-400/10 border border-green-400/20 rounded-2xl p-6">
                <CheckCircle2 size={28} />
                <div>
                  <p className="font-bold text-lg">Message sent!</p>
                  <p className="text-sm text-green-400/70">
                    We'll get back to you as soon as possible.
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
                    Email address
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
                    How can we help?
                  </label>
                  <textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us about your question or issue..."
                    required
                    rows={6}
                    className="w-full px-4 py-3.5 bg-black/40 border border-white/5 rounded-2xl text-white placeholder:text-white/20 outline-none transition-all focus:border-accent/50 focus:bg-black/60 focus:ring-1 focus:ring-accent/50 resize-none"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  isLoading={isSubmitting}
                  rightIcon={!isSubmitting ? <ArrowRight size={18} /> : undefined}
                  className="w-full md:w-auto px-8 rounded-full"
                >
                  {isSubmitting ? "Sending..." : "Send Message"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
