import { useEffect, useState, useRef } from "react";
import { Menu, X, ChevronDown, Mail, Headphones, Activity, Bug, Copy, Download } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { SiGithub, SiVite, SiNextdotjs } from "react-icons/si";
import { GitHubButton } from "./github-button";

// SVG logo content for copying
const logoSvgLight = `<svg width="170" height="170" viewBox="0 0 170 170" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M2.54688 69.0371C34.9492 54.512 71.4883 58.7316 94.1689 82.6191C115.062 104.625 118.677 137.51 106.465 167.264C100.649 168.777 94.592 169.688 88.3623 169.931C103.925 145.463 102.096 113.376 82.0039 92.2148C60.6364 69.71 25.8588 67.1916 0 84.7705C0.0139808 79.4947 0.508598 74.3316 1.44238 69.3232C1.80382 69.2936 2.17561 69.2035 2.54688 69.0371ZM0.396484 93.2607C22.6416 86.6935 47.2006 92.139 63.7324 109.551C79.2799 125.926 83.8902 148.843 77.9697 169.71C73.0962 169.311 68.3394 168.5 63.7334 167.313C72.3879 150.763 70.0698 129.867 56.4922 115.566C42.278 100.596 20.2053 97.5726 2.82812 106.821C1.66514 102.43 0.843937 97.9001 0.396484 93.2607ZM5.04883 113.923C18.9587 111.941 33.5857 116.494 43.9971 127.46C53.8606 137.849 57.7793 151.718 55.8682 164.873C50.5667 162.939 45.5128 160.491 40.7646 157.592C42.2487 153.413 42.5813 148.771 41.4678 144.138C38.4078 131.407 25.606 123.567 12.875 126.627C12.2896 126.768 11.7145 126.928 11.1504 127.109C8.75847 122.924 6.71068 118.516 5.04883 113.923ZM84.999 0C131.943 0.000177301 169.998 38.0562 169.998 85C169.998 118.651 150.442 147.733 122.076 161.506C145.102 127.778 145.223 84.9804 119.838 58.2432C91.1585 28.0369 40.319 29.2765 3.70508 60.1006C14.3493 25.3058 46.7188 0 84.999 0Z" fill="white"/>
</svg>`;

const logoSvgDark = `<svg width="170" height="170" viewBox="0 0 170 170" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M2.54688 69.0371C34.9492 54.512 71.4883 58.7316 94.1689 82.6191C115.062 104.625 118.677 137.51 106.465 167.264C100.649 168.777 94.592 169.688 88.3623 169.931C103.925 145.463 102.096 113.376 82.0039 92.2148C60.6364 69.71 25.8588 67.1916 0 84.7705C0.0139808 79.4947 0.508598 74.3316 1.44238 69.3232C1.80382 69.2936 2.17561 69.2035 2.54688 69.0371ZM0.396484 93.2607C22.6416 86.6935 47.2006 92.139 63.7324 109.551C79.2799 125.926 83.8902 148.843 77.9697 169.71C73.0962 169.311 68.3394 168.5 63.7334 167.313C72.3879 150.763 70.0698 129.867 56.4922 115.566C42.278 100.596 20.2053 97.5726 2.82812 106.821C1.66514 102.43 0.843937 97.9001 0.396484 93.2607ZM5.04883 113.923C18.9587 111.941 33.5857 116.494 43.9971 127.46C53.8606 137.849 57.7793 151.718 55.8682 164.873C50.5667 162.939 45.5128 160.491 40.7646 157.592C42.2487 153.413 42.5813 148.771 41.4678 144.138C38.4078 131.407 25.606 123.567 12.875 126.627C12.2896 126.768 11.7145 126.928 11.1504 127.109C8.75847 122.924 6.71068 118.516 5.04883 113.923ZM84.999 0C131.943 0.000177301 169.998 38.0562 169.998 85C169.998 118.651 150.442 147.733 122.076 161.506C145.102 127.778 145.223 84.9804 119.838 58.2432C91.1585 28.0369 40.319 29.2765 3.70508 60.1006C14.3493 25.3058 46.7188 0 84.999 0Z" fill="black"/>
</svg>`;

export const Navbar = () => {
  const { data: session } = authClient.useSession();
  const { data: organizations } = authClient.useListOrganizations();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [logoContextMenu, setLogoContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const logoContextMenuRef = useRef<HTMLDivElement>(null);

  const handleLogoRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setLogoContextMenu({ x: e.clientX, y: e.clientY });
  };

  const copyLogoAsSvg = async (variant: 'light' | 'dark') => {
    try {
      await navigator.clipboard.writeText(variant === 'light' ? logoSvgLight : logoSvgDark);
      setCopyFeedback(`${variant === 'light' ? 'Light' : 'Dark'} logo copied!`);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
    setLogoContextMenu(null);
  };

  const downloadLogoAsSvg = (variant: 'light' | 'dark') => {
    const svgContent = variant === 'light' ? logoSvgLight : logoSvgDark;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outray-logo-${variant}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setLogoContextMenu(null);
  };

  const downloadAllAssets = () => {
    const a = document.createElement('a');
    a.href = '/outray-brand-assets.zip';
    a.download = 'outray-brand-assets.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setLogoContextMenu(null);
  };

  // Close logo context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (logoContextMenuRef.current && !logoContextMenuRef.current.contains(e.target as Node)) {
        setLogoContextMenu(null);
      }
    };
    if (logoContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [logoContextMenu]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Check initial state
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#000000] border-b border-white/10 py-4"
          : "bg-transparent py-6"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" onContextMenu={handleLogoRightClick}>
          <img
            src="/logo.png"
            alt="OutRay Logo"
            className={`${scrolled ? "w-10" : "w-12"} transition-all`}
          />
        </Link>

        {/* Logo Context Menu */}
        {logoContextMenu && (
          <div
            ref={logoContextMenuRef}
            className="fixed z-[100] bg-black/70 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 min-w-[200px] animate-in fade-in zoom-in-95 duration-100"
            style={{ left: logoContextMenu.x, top: logoContextMenu.y }}
          >
            {/* Copy as SVG */}
            <div className="mb-2">
              <div className="flex items-center gap-2 px-2 py-1.5 text-white/50 text-xs font-medium">
                <Copy size={14} />
                Copy as SVG
              </div>
              <div className="flex gap-1 px-1">
                <button
                  onClick={() => copyLogoAsSvg('light')}
                  className="flex-1 px-3 py-1.5 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-all text-xs font-medium text-center"
                >
                  Light
                </button>
                <button
                  onClick={() => copyLogoAsSvg('dark')}
                  className="flex-1 px-3 py-1.5 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-all text-xs font-medium text-center"
                >
                  Dark
                </button>
              </div>
            </div>

            {/* Download */}
            <div className="mb-2">
              <div className="flex items-center gap-2 px-2 py-1.5 text-white/50 text-xs font-medium">
                <Download size={14} />
                Download SVG
              </div>
              <div className="flex gap-1 px-1">
                <button
                  onClick={() => downloadLogoAsSvg('light')}
                  className="flex-1 px-3 py-1.5 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-all text-xs font-medium text-center"
                >
                  Light
                </button>
                <button
                  onClick={() => downloadLogoAsSvg('dark')}
                  className="flex-1 px-3 py-1.5 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-all text-xs font-medium text-center"
                >
                  Dark
                </button>
              </div>
            </div>

            <div className="h-px bg-white/10 my-1" />

            {/* Download All */}
            <button
              onClick={downloadAllAssets}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-all text-xs font-medium"
            >
              <Download size={14} />
              Download All Assets
            </button>
          </div>
        )}

        {/* Copy Feedback Toast */}
        {copyFeedback && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-white text-black px-4 py-2 rounded-lg text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
            {copyFeedback}
          </div>
        )}

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
          <div 
            className="relative"
            onMouseEnter={() => setDocsOpen(true)}
            onMouseLeave={() => setDocsOpen(false)}
          >
            <button className="flex items-center gap-1 hover:text-white transition-colors">
              Docs
              <ChevronDown size={14} className={`transition-transform ${docsOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {docsOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-4">
                <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 min-w-[420px] shadow-2xl">
                  <div className="flex gap-8">
                    <div className="flex flex-col gap-3">
                      <Link 
                        to="/docs/$" 
                        params={{ _splat: "" }}
                        className="text-white/70 hover:text-white transition-colors text-base"
                      >
                        Getting Started
                      </Link>
                      <Link 
                        to="/docs/$" 
                        params={{ _splat: "cli-reference" }}
                        className="text-white/70 hover:text-white transition-colors text-base"
                      >
                        CLI Reference
                      </Link>
                      <Link 
                        to="/plugins"
                        className="text-white/70 hover:text-white transition-colors text-base"
                      >
                        Plugins
                      </Link>
                    </div>
                    
                    <div className="border-l border-white/10 pl-8">
                      <div className="grid grid-cols-2 gap-4">
                        <Link 
                          to="/vite" 
                          className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group"
                          title="Vite"
                        >
                          <SiVite className="w-6 h-6 text-white/50 group-hover:text-[#646CFF] transition-colors" />
                        </Link>
                        <Link 
                          to="/nextjs" 
                          className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group"
                          title="Next.js"
                        >
                          <SiNextdotjs className="w-6 h-6 text-white/50 group-hover:text-white transition-colors" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <Link to="/pricing" className="hover:text-white transition-colors">
            Pricing
          </Link>
          <Link to="/changelog" className="hover:text-white transition-colors">
            Changelog
          </Link>
          <div 
            className="relative"
            onMouseEnter={() => setHelpOpen(true)}
            onMouseLeave={() => setHelpOpen(false)}
          >
            <button className="flex items-center gap-1 hover:text-white transition-colors">
              Help
              <ChevronDown size={14} className={`transition-transform ${helpOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {helpOpen && (
              <div className="absolute top-full right-0 pt-4">
                <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-4 min-w-[200px] shadow-2xl">
                  <div className="flex flex-col gap-1">
                    <Link 
                      to="/contact"
                      className="flex items-center gap-3 px-3 py-2.5 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm"
                    >
                      <Mail size={16} />
                      Contact
                    </Link>
                    <Link 
                      to="/contact"
                      className="flex items-center gap-3 px-3 py-2.5 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm"
                    >
                      <Headphones size={16} />
                      Support
                    </Link>
                    <a 
                      href="https://status.outray.dev"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm"
                    >
                      <Activity size={16} />
                      Status
                    </a>
                    <Link 
                      to="/report-bug"
                      className="flex items-center gap-3 px-3 py-2.5 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm"
                    >
                      <Bug size={16} />
                      Report a Bug
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:block">
            <GitHubButton size="sm" />
          </div>
          {session ? (
            <Link
              to={organizations?.length ? "/$orgSlug" : "/select"}
              params={{
                orgSlug:
                  organizations && organizations.length
                    ? organizations[0].slug
                    : "",
              }}
              className="hidden md:flex px-5 py-2 bg-white/10 text-white border border-white/20 rounded-full font-medium hover:bg-white/15 transition-colors items-center gap-2 text-sm"
            >
              Dashboard
            </Link>
          ) : (
            <div className="hidden md:flex items-center gap-4">
              <Link
                to="/login"
                className="text-sm font-medium text-white/60 hover:text-white transition-colors"
              >
                Log In
              </Link>
              <Link
                to="/signup"
                className="px-5 py-2 bg-white/10 text-white border border-white/20 rounded-full font-medium hover:bg-white/15 transition-colors text-sm"
              >
                Get Started
              </Link>
            </div>
          )}

          {/* Mobile hamburger button */}
          {!mobileMenuOpen && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-white/60 hover:text-white transition-colors"
              aria-label="Open menu"
            >
              <Menu size={24} />
            </button>
          )}
        </div>
      </div>

      {/* Mobile menu - full height with animation */}
      <div
        className={`md:hidden fixed inset-0 bg-[#000000] z-[60] transition-all duration-300 ease-in-out ${
          mobileMenuOpen
            ? "opacity-100 translate-x-0"
            : "opacity-0 translate-x-full pointer-events-none"
        }`}
      >
        {/* Mobile menu header with logo and close button */}
        <div className="flex items-center justify-between px-6 py-6">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2"
          >
            <img src="/logo.png" alt="OutRay Logo" className="w-10" />
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 text-white/60 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col h-[calc(100%-80px)] px-6 pb-8">
          <div className="flex flex-col gap-2 flex-1">
            <Link
              to="/docs/$"
              onClick={() => setMobileMenuOpen(false)}
              className="text-white/80 hover:text-white transition-colors py-4 text-2xl font-medium border-b border-white/10"
            >
              Documentation
            </Link>
            <Link
              to="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="text-white/80 hover:text-white transition-colors py-4 text-2xl font-medium border-b border-white/10"
            >
              Pricing
            </Link>
            <a
              href="https://github.com/akinloluwami/outray"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 text-white/80 hover:text-white transition-colors py-4 text-2xl font-medium border-b border-white/10"
            >
              <SiGithub size={24} />
              GitHub
            </a>
            
            {/* Help section in mobile */}
            <div className="py-4 border-b border-white/10">
              <p className="text-white/40 text-sm font-medium mb-3">Help</p>
              <div className="flex flex-col gap-2 pl-2">
                <Link
                  to="/contact"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 text-white/70 hover:text-white transition-colors py-2 text-lg"
                >
                  <Mail size={20} />
                  Contact
                </Link>
                <Link
                  to="/contact"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 text-white/70 hover:text-white transition-colors py-2 text-lg"
                >
                  <Headphones size={20} />
                  Support
                </Link>
                <a
                  href="https://status.outray.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 text-white/70 hover:text-white transition-colors py-2 text-lg"
                >
                  <Activity size={20} />
                  Status
                </a>
                <a
                  href="https://github.com/akinloluwami/outray/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 text-white/70 hover:text-white transition-colors py-2 text-lg"
                >
                  <Bug size={20} />
                  Report a Bug
                </a>
              </div>
            </div>
          </div>

          {/* Dashboard/Login button at bottom */}
          <div className="mt-auto pt-6">
            {session ? (
              <Link
                to={organizations?.length ? "/$orgSlug" : "/select"}
                params={{
                  orgSlug:
                    organizations && organizations.length
                      ? organizations[0].slug
                      : "",
                }}
                onClick={() => setMobileMenuOpen(false)}
                className="w-full px-6 py-4 bg-white/10 text-white border border-white/20 rounded-full font-medium hover:bg-white/15 transition-colors flex items-center justify-center gap-2 text-lg"
              >
                Dashboard
              </Link>
            ) : (
              <div className="flex flex-col gap-3 w-full">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full px-6 py-4 text-white/60 hover:text-white font-medium transition-colors flex items-center justify-center text-lg"
                >
                  Log In
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full px-6 py-4 bg-white/10 text-white border border-white/20 rounded-full font-medium hover:bg-white/15 transition-colors flex items-center justify-center text-lg"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
