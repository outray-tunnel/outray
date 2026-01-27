import { Link } from "@tanstack/react-router";

export const Footer = () => {
  return (
    <footer className="border-t border-white/10 py-12 bg-black">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-6 gap-8 mb-12">
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <img src="/logo.png" alt="OutRay Logo" className="w-10" />
              <span className="font-bold text-white">OutRay</span>
            </Link>
            <p className="text-white/40 text-sm mb-4">
              Open-source tunneling for developers.
            </p>
            <p className="text-white/30 text-xs">
              © {new Date().getFullYear()} OutRay. All rights reserved.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4 text-sm">Documentation</h4>
            <ul className="space-y-2 text-sm text-white/40">
              <li>
                <Link to="/docs/$" params={{ _splat: "" }} className="hover:text-white transition-colors">
                  Getting Started
                </Link>
              </li>
              <li>
                <Link to="/docs/$" params={{ _splat: "cli-reference" }} className="hover:text-white transition-colors">
                  CLI Reference
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4 text-sm">Resources</h4>
            <ul className="space-y-2 text-sm text-white/40">
              <li>
                <Link to="/changelog" className="hover:text-white transition-colors">
                  Changelog
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-white transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/akinloluwami/outray"
                  target="_blank"
                  className="hover:text-white transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4 text-sm">Plugins</h4>
            <ul className="space-y-2 text-sm text-white/40">
              <li>
                <Link to="/vite" className="hover:text-white transition-colors">
                  Vite
                </Link>
              </li>
              <li>
                <Link to="/nextjs" className="hover:text-white transition-colors">
                  Next.js
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4 text-sm">Legal</h4>
            <ul className="space-y-2 text-sm text-white/40">
              <li>
                <Link to="/terms" className="hover:text-white transition-colors">
                  Terms
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-white transition-colors">
                  Privacy
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};
