import { Link } from "@tanstack/react-router";

export const ViteFooter = () => {
  return (
    <footer className="border-t border-white/10 py-12 bg-black">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-6 gap-8 mb-12">
          {/* Logo and info */}
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

          {/* Documentation */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm">Documentation</h4>
            <ul className="space-y-2 text-sm text-white/40">
              <li>
                <Link to="/docs/$" params={{ _splat: "" }} className="hover:text-white transition-colors">
                  Getting Started
                </Link>
              </li>
              <li>
                <Link to="/docs/$" params={{ _splat: "vite-plugin" }} className="hover:text-white transition-colors">
                  Vite Plugin
                </Link>
              </li>
              <li>
                <Link to="/docs/$" params={{ _splat: "cli-reference" }} className="hover:text-white transition-colors">
                  CLI Reference
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm">Resources</h4>
            <ul className="space-y-2 text-sm text-white/40">
              <li>
                <a
                  href="https://github.com/akinloluwami/outray/blob/main/CHANGELOG.md"
                  target="_blank"
                  className="hover:text-white transition-colors"
                >
                  Changelog
                </a>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-white transition-colors">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm">Company</h4>
            <ul className="space-y-2 text-sm text-white/40">
              <li>
                <a
                  href="https://github.com/akinloluwami/outray"
                  target="_blank"
                  className="hover:text-white transition-colors"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://twitter.com/outraytunnel"
                  target="_blank"
                  className="hover:text-white transition-colors"
                >
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="https://discord.gg/DncjGcCHDg"
                  target="_blank"
                  className="hover:text-white transition-colors"
                >
                  Discord
                </a>
              </li>
            </ul>
          </div>

          {/* Help */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm">Help</h4>
            <ul className="space-y-2 text-sm text-white/40">
              <li>
                <a
                  href="https://discord.gg/DncjGcCHDg"
                  target="_blank"
                  className="hover:text-white transition-colors"
                >
                  Support
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/akinloluwami/outray/issues"
                  target="_blank"
                  className="hover:text-white transition-colors"
                >
                  Report a Bug
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};
