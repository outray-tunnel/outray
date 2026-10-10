import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import Cone01Icon from "@outray/icons/stroke/Cone01Icon";
import Pulse02Icon from "@outray/icons/stroke/Pulse02Icon";
import LockPasswordIcon from "@outray/icons/stroke/LockPasswordIcon";
import HeartPulseIcon from "@outray/icons/stroke/HeartPulseIcon";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import type { LoginProvider } from "../../lib/login";
import { Button } from "../arc/button/button";
import "../outray-arc-theme.css";
import styles from "./auth-page.module.css";
import { useInstance, type PublicInstanceConfig } from "@/lib/instance-context";

const products = [
  { name: "Tunnels", description: "Bring your local services online.", icon: Cone01Icon },
  { name: "Observability", description: "Explore requests, logs, and traces.", icon: Pulse02Icon },
  { name: "Secrets", description: "Manage configuration across environments.", icon: LockPasswordIcon },
  { name: "Uptime", description: "Monitor availability and keep people informed.", icon: HeartPulseIcon },
];

interface AuthPageProps {
  mode?: "login" | "signup";
  loading: LoginProvider | null;
  sessionPending: boolean;
  error: string | null;
  redirect?: string;
  onLogin: (provider: LoginProvider) => void;
}

export function AuthPage(props: AuthPageProps) {
  const instance = useInstance();
  return <AuthPageView {...props} instance={instance} />;
}

export function AuthPageView({ mode = "login", loading, sessionPending, error, redirect, onLogin, instance }: AuthPageProps & {
  instance: Pick<PublicInstanceConfig, "selfHosted" | "authProviders">;
}) {
  const isSignup = mode === "signup";
  const titleId = `${mode}-title`;
  const productsTitleId = `${mode}-products-title`;
  const busy = sessionPending || loading !== null;
  const status = sessionPending ? "Checking your session…"
    : loading ? `Taking you to ${loading === "github" ? "GitHub" : "Google"}…` : "";

  return <div className={`${styles.page} outray-arc`}>
    <header className={styles.header}>
      <Link to="/" className={styles.brand} aria-label="OutRay home"><img src="/logo.png" width={28} height={28} alt="" /><span>OutRay</span></Link>
      {!instance.selfHosted && <Link to="/" className={styles.home}><ArrowLeft size={14} aria-hidden="true" /><span>Back to home</span></Link>}
    </header>

    <main className={`${styles.main}${instance.selfHosted ? ` ${styles.installation}` : ""}`}>
      <section className={styles.signIn} aria-labelledby={titleId}>
        <div className={styles.heading}>
          <h1 id={titleId}>{isSignup ? "Create your account" : "Welcome back"}</h1>
          <p>{instance.selfHosted ? "Use an approved account to access this installation. Signup is restricted by your administrator." : isSignup ? "Start building with OutRay." : "Sign in to your OutRay workspace."}</p>
        </div>

        <div className={styles.providers} role="group" aria-label={isSignup ? "Sign-up options" : "Sign-in options"} aria-busy={busy}>
          {instance.authProviders.includes("github") && <Button type="button" variant="primary" size="lg" className={styles.provider} loading={loading === "github"}
            disabled={sessionPending || loading === "google"} onClick={() => { if (!busy) onLogin("github"); }} aria-label="Continue with GitHub">
            <FaGithub size={17} aria-hidden="true" />Continue with GitHub
          </Button>}
          {instance.authProviders.includes("google") && <Button type="button" variant="secondary" size="lg" className={styles.provider} loading={loading === "google"}
            disabled={sessionPending || loading === "github"} onClick={() => { if (!busy) onLogin("google"); }} aria-label="Continue with Google">
            <FcGoogle size={17} aria-hidden="true" />Continue with Google
          </Button>}
          {!instance.authProviders.length && <p role="alert">Sign-in is not configured. Ask your administrator to configure GitHub or Google OAuth.</p>}
        </div>
        <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">{status}</p>
        {error && <div className={styles.error} role="alert"><CircleAlert size={15} aria-hidden="true" /><p>{error}</p></div>}

        {!instance.selfHosted && <p className={styles.signUp}>{isSignup
          ? <>Already have an account? <Link to="/login" search={{ redirect }}>Log in</Link></>
          : <>New to OutRay? <Link to="/signup" search={{ redirect }}>Get started</Link></>}</p>}
        {!instance.selfHosted && <p className={styles.legal}>By continuing, you agree to our <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>.</p>}
      </section>

      {!instance.selfHosted && <aside className={styles.productIntro} aria-labelledby={productsTitleId}>
        <div className={styles.introHeading}>
          <span className={styles.eyebrow}>Your developer workspace</span>
          <h2 id={productsTitleId}>Everything behind your app.<br />Together in OutRay.</h2>
        </div>
        <ul className={styles.products}>
          {products.map((product) => <li key={product.name}>
            <span className={styles.productIcon} aria-hidden="true"><HugeiconsIcon icon={product.icon} size={19} strokeWidth={1.6} /></span>
            <div><h3>{product.name}</h3><p>{product.description}</p></div>
          </li>)}
        </ul>
      </aside>}
    </main>

    <footer className={styles.footer}>{instance.selfHosted
      ? <span>For access or sign-in help, contact your installation administrator.</span>
      : <><span>{isSignup ? "Need a hand getting started?" : "Need a hand signing in?"}</span><a href="mailto:support@outray.dev">Contact support</a></>}</footer>
  </div>;
}
