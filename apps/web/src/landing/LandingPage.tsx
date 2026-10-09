import { useEffect } from "react";
import { FinalCta } from "./FinalCta";
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { Navigation } from "./Navigation";
import { OpenSource } from "./OpenSource";
import { ProductStories } from "./ProductStories";
import { initLandingInteractions } from "./home";

const links = {
  signup: "/signup",
  login: "/login",
  docs: "/docs",
  privacy: "/privacy",
  terms: "/terms",
  github: "https://github.com/outray-tunnel/outray",
  status: "https://status.outray.dev",
} as const;

export function LandingPage() {
  useEffect(() => initLandingInteractions(), []);

  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Navigation
        loginUrl={links.login}
        signupUrl={links.signup}
        docsUrl={links.docs}
        githubUrl={links.github}
      />
      <main className="site-main" id="main-content">
        <Hero signupUrl={links.signup} githubUrl={links.github} />
        <ProductStories docsUrl={links.docs} />
        <OpenSource githubUrl={links.github} />
        <FinalCta signupUrl={links.signup} />
      </main>
      <Footer
        docsUrl={links.docs}
        statusUrl={links.status}
        loginUrl={links.login}
        privacyUrl={links.privacy}
        termsUrl={links.terms}
        githubUrl={links.github}
      />
    </div>
  );
}
