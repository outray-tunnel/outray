import { Link } from "@tanstack/react-router";
import { Navbar } from "../navbar";
import { Footer } from "../shared";

export const PrivacyPage = () => {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-accent/30">
      <Navbar />

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Privacy Policy
          </h1>
          <p className="text-white/40 mb-12">Last updated: January 24, 2026</p>

          <div className="prose prose-invert prose-lg max-w-none">
            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                1. Introduction
              </h2>
              <p className="text-white/60 leading-relaxed">
                OutRay ("we", "our", or "us") is committed to protecting your
                privacy. This Privacy Policy explains how we collect, use,
                disclose, and safeguard your information when you use our
                tunneling service, website, CLI tools, and plugins.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                2. Information We Collect
              </h2>

              <h3 className="text-xl font-medium text-white/80 mt-6 mb-3">
                Account Information
              </h3>
              <p className="text-white/60 leading-relaxed mb-4">
                When you create an account, we collect:
              </p>
              <ul className="list-disc list-inside text-white/60 space-y-2 mb-6">
                <li>Email address</li>
                <li>Name (if provided)</li>
                <li>Profile picture (if using OAuth)</li>
                <li>Organization and team information</li>
              </ul>

              <h3 className="text-xl font-medium text-white/80 mt-6 mb-3">
                Usage Information
              </h3>
              <p className="text-white/60 leading-relaxed mb-4">
                When you use our Service, we automatically collect:
              </p>
              <ul className="list-disc list-inside text-white/60 space-y-2 mb-6">
                <li>Tunnel connection metadata (timestamps, duration)</li>
                <li>Request counts and bandwidth usage</li>
                <li>IP addresses and geographic location</li>
                <li>Device and browser information</li>
                <li>CLI and plugin versions</li>
              </ul>

              <h3 className="text-xl font-medium text-white/80 mt-6 mb-3">
                Traffic Data
              </h3>
              <p className="text-white/60 leading-relaxed">
                <strong className="text-white">
                  We do not inspect, store, or log the content of your HTTP/TCP/UDP traffic.
                </strong>{" "}
                Traffic passes through our servers in real-time and is not
                retained. We only collect metadata necessary for billing,
                debugging, and abuse prevention.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                3. How We Use Your Information
              </h2>
              <p className="text-white/60 leading-relaxed mb-4">
                We use the collected information to:
              </p>
              <ul className="list-disc list-inside text-white/60 space-y-2">
                <li>Provide and maintain the Service</li>
                <li>Process payments and manage subscriptions</li>
                <li>Send service-related communications</li>
                <li>Monitor and improve performance</li>
                <li>Detect and prevent abuse or fraud</li>
                <li>Comply with legal obligations</li>
                <li>Provide customer support</li>
              </ul>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                4. Information Sharing
              </h2>
              <p className="text-white/60 leading-relaxed mb-4">
                We do not sell your personal information. We may share
                information with:
              </p>
              <ul className="list-disc list-inside text-white/60 space-y-2">
                <li>
                  <strong className="text-white/80">Service Providers:</strong>{" "}
                  Third parties that help us operate (hosting, payment
                  processing, analytics)
                </li>
                <li>
                  <strong className="text-white/80">Legal Requirements:</strong>{" "}
                  When required by law or to protect our rights
                </li>
                <li>
                  <strong className="text-white/80">Business Transfers:</strong>{" "}
                  In connection with a merger, acquisition, or sale of assets
                </li>
                <li>
                  <strong className="text-white/80">With Your Consent:</strong>{" "}
                  When you explicitly authorize sharing
                </li>
              </ul>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                5. Data Security
              </h2>
              <p className="text-white/60 leading-relaxed">
                We implement industry-standard security measures including
                encryption in transit (TLS), encryption at rest, access
                controls, and regular security audits. However, no method of
                transmission over the internet is 100% secure, and we cannot
                guarantee absolute security.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                6. Data Retention
              </h2>
              <p className="text-white/60 leading-relaxed">
                We retain your account information for as long as your account
                is active. Usage logs and analytics are retained for up to 90
                days. You may request deletion of your data at any time by
                contacting us or deleting your account.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                7. Your Rights
              </h2>
              <p className="text-white/60 leading-relaxed mb-4">
                Depending on your location, you may have the right to:
              </p>
              <ul className="list-disc list-inside text-white/60 space-y-2">
                <li>Access your personal data</li>
                <li>Correct inaccurate data</li>
                <li>Delete your data</li>
                <li>Export your data in a portable format</li>
                <li>Object to or restrict processing</li>
                <li>Withdraw consent</li>
              </ul>
              <p className="text-white/60 leading-relaxed mt-4">
                To exercise these rights, contact us at{" "}
                <a
                  href="mailto:privacy@outray.dev"
                  className="text-accent hover:underline"
                >
                  privacy@outray.dev
                </a>
                .
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                8. Cookies
              </h2>
              <p className="text-white/60 leading-relaxed">
                We use essential cookies for authentication and session
                management. We may use analytics cookies to understand how you
                use our website. You can control cookie preferences through your
                browser settings.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                9. International Transfers
              </h2>
              <p className="text-white/60 leading-relaxed">
                Your information may be transferred to and processed in
                countries other than your own. We ensure appropriate safeguards
                are in place, including standard contractual clauses where
                required.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                10. Children's Privacy
              </h2>
              <p className="text-white/60 leading-relaxed">
                The Service is not intended for users under 16 years of age. We
                do not knowingly collect information from children. If you
                believe we have collected information from a child, please
                contact us immediately.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                11. Changes to This Policy
              </h2>
              <p className="text-white/60 leading-relaxed">
                We may update this Privacy Policy from time to time. We will
                notify you of material changes by posting the new policy on our
                website and updating the "Last updated" date. Your continued use
                of the Service constitutes acceptance of the updated policy.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                12. Contact Us
              </h2>
              <p className="text-white/60 leading-relaxed">
                If you have questions about this Privacy Policy or our data
                practices, contact us at{" "}
                <a
                  href="mailto:privacy@outray.dev"
                  className="text-accent hover:underline"
                >
                  privacy@outray.dev
                </a>
                .
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-white/10">
            <Link to="/terms" className="text-accent hover:underline">
              View our Terms of Service →
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};
