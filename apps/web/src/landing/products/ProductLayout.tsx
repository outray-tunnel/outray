import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { Footer } from "../Footer";
import { Navigation } from "../Navigation";
import { initLandingInteractions } from "../home";

export function ProductLayout() {
  useEffect(() => initLandingInteractions(), []);

  return (
    <div className="landing-page product-pages">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Navigation loginUrl="/login" signupUrl="/signup" docsUrl="/docs" githubUrl="https://github.com/outray-tunnel/outray" />
      <main className="site-main pd-main" id="main-content"><Outlet /></main>
      <Footer docsUrl="/docs" statusUrl="https://status.outray.dev" loginUrl="/login" privacyUrl="/privacy" termsUrl="/terms" githubUrl="https://github.com/outray-tunnel/outray" />
    </div>
  );
}
