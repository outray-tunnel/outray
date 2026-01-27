import { Link } from "@tanstack/react-router";
import { Navbar } from "../navbar";
import { Footer } from "../shared";

export const TermsPage = () => {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-accent/30">
      <Navbar />

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Terms of Service
          </h1>
          <p className="text-white/40 mb-12">Last updated: January 24, 2026</p>

          <div className="prose prose-invert prose-lg max-w-none">
            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                1. Acceptance of Terms
              </h2>
              <p className="text-white/60 leading-relaxed">
                By accessing or using OutRay's services, website, CLI tools, or
                plugins (collectively, the "Service"), you agree to be bound by
                these Terms of Service. If you do not agree to these terms, do
                not use the Service.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                2. Description of Service
              </h2>
              <p className="text-white/60 leading-relaxed">
                OutRay provides secure tunneling services that allow developers
                to expose local development servers to the internet. This
                includes our CLI application, web dashboard, framework plugins,
                and related documentation.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                3. Account Registration
              </h2>
              <p className="text-white/60 leading-relaxed mb-4">
                To use certain features of the Service, you must create an
                account. You agree to:
              </p>
              <ul className="list-disc list-inside text-white/60 space-y-2">
                <li>Provide accurate and complete registration information</li>
                <li>Maintain the security of your account credentials</li>
                <li>
                  Accept responsibility for all activities under your account
                </li>
                <li>Notify us immediately of any unauthorized use</li>
              </ul>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                4. Acceptable Use
              </h2>
              <p className="text-white/60 leading-relaxed mb-4">
                You agree not to use the Service to:
              </p>
              <ul className="list-disc list-inside text-white/60 space-y-2">
                <li>Violate any applicable laws or regulations</li>
                <li>Transmit malware, viruses, or harmful code</li>
                <li>Engage in phishing, fraud, or deceptive practices</li>
                <li>
                  Host or distribute illegal content, including pirated material
                </li>
                <li>Attempt to gain unauthorized access to other systems</li>
                <li>
                  Conduct denial-of-service attacks or network abuse
                </li>
                <li>Infringe on intellectual property rights</li>
                <li>Harass, abuse, or harm others</li>
              </ul>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                5. Service Availability
              </h2>
              <p className="text-white/60 leading-relaxed">
                We strive to maintain high availability but do not guarantee
                uninterrupted access. The Service may be temporarily unavailable
                due to maintenance, updates, or circumstances beyond our
                control. We reserve the right to modify, suspend, or discontinue
                any part of the Service at any time.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                6. Intellectual Property
              </h2>
              <p className="text-white/60 leading-relaxed">
                The Service, including its design, code, logos, and content, is
                owned by OutRay and protected by intellectual property laws. You
                retain ownership of any content you transmit through the
                Service. You grant us a limited license to process your traffic
                solely to provide the Service.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                7. Payment and Billing
              </h2>
              <p className="text-white/60 leading-relaxed">
                Paid plans are billed in advance on a monthly or annual basis.
                All fees are non-refundable except as required by law. We
                reserve the right to change pricing with 30 days notice. Failure
                to pay may result in service suspension.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                8. Limitation of Liability
              </h2>
              <p className="text-white/60 leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUTRAY SHALL NOT BE
                LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
                PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL,
                ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY SHALL
                NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE
                CLAIM.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                9. Indemnification
              </h2>
              <p className="text-white/60 leading-relaxed">
                You agree to indemnify and hold harmless OutRay, its officers,
                directors, employees, and agents from any claims, damages, or
                expenses arising from your use of the Service or violation of
                these Terms.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                10. Termination
              </h2>
              <p className="text-white/60 leading-relaxed">
                We may terminate or suspend your access to the Service at any
                time for violation of these Terms or for any other reason at our
                discretion. You may terminate your account at any time through
                your dashboard settings.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                11. Changes to Terms
              </h2>
              <p className="text-white/60 leading-relaxed">
                We may update these Terms from time to time. We will notify you
                of material changes by posting the new Terms on our website.
                Your continued use of the Service after changes constitutes
                acceptance of the new Terms.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-white mb-4">
                12. Contact
              </h2>
              <p className="text-white/60 leading-relaxed">
                If you have questions about these Terms, please contact us at{" "}
                <a
                  href="mailto:legal@outray.dev"
                  className="text-accent hover:underline"
                >
                  legal@outray.dev
                </a>
                .
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-white/10">
            <Link
              to="/privacy"
              className="text-accent hover:underline"
            >
              View our Privacy Policy →
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};
