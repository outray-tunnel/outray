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
import { useInstance, type PublicInstanceConfig } from "@/lib/instance-context";
import type { ReactNode } from "react";

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
  emailSignIn?: ReactNode;
}

export function AuthPage(props: AuthPageProps) {
  const instance = useInstance();
  return <AuthPageView {...props} instance={instance} />;
}

export function AuthPageView({ mode = "login", loading, sessionPending, error, redirect, onLogin, instance, emailSignIn }: AuthPageProps & {
  instance: Pick<PublicInstanceConfig, "selfHosted" | "authProviders">;
}) {
  const isSignup = mode === "signup";
  const titleId = `${mode}-title`;
  const productsTitleId = `${mode}-products-title`;
  const busy = sessionPending || loading !== null;
  const status = sessionPending ? "Checking your session…"
    : loading ? `Taking you to ${loading === "github" ? "GitHub" : "Google"}…` : "";

  return <div className="flex min-h-svh flex-col bg-[#080808] text-zinc-200 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-zinc-400">
    <header className="mx-auto flex min-h-[76px] w-full max-w-[1180px] items-center justify-between gap-6 px-8 py-5 max-[800px]:min-h-16 max-[800px]:px-6 max-[800px]:py-[18px] max-[400px]:px-5">
      <Link to="/" className="inline-flex items-center gap-2.5 rounded-md text-zinc-50 no-underline [&_img]:object-contain [&_span]:text-[17px] [&_span]:font-semibold [&_span]:tracking-[-.035em]" aria-label="OutRay home"><img src="/logo.png" width={28} height={28} alt="" /><span>OutRay</span></Link>
      {!instance.selfHosted && <Link to="/" className="inline-flex items-center gap-[7px] rounded-[5px] text-xs text-zinc-400 no-underline transition-colors duration-160 hover:text-zinc-100 max-[400px]:text-[11px] motion-reduce:transition-none"><ArrowLeft size={14} aria-hidden="true" /><span>Back to home</span></Link>}
    </header>

    <main className={`mx-auto grid w-full max-w-[1040px] flex-1 grid-cols-2 items-center gap-20 px-8 pt-16 pb-[88px] max-[800px]:max-w-[440px] max-[800px]:grid-cols-1 max-[800px]:px-6 max-[800px]:py-[60px] max-[400px]:px-5 max-[400px]:py-11 ${instance.selfHosted ? "max-w-[440px] grid-cols-1" : ""}`}>
      <section className="w-full max-w-[352px] justify-self-center" aria-labelledby={titleId}>
        <div className="mb-7 [&_h1]:m-0 [&_h1]:text-[26px] [&_h1]:leading-tight [&_h1]:font-normal [&_h1]:tracking-[-.045em] [&_h1]:text-zinc-50 [&>p]:mt-2.5 [&>p]:mb-0 [&>p]:text-sm [&>p]:leading-[1.65] [&>p]:text-zinc-400 max-[400px]:[&_h1]:text-2xl">
          <h1 id={titleId}>{isSignup ? "Create your account" : "Welcome back"}</h1>
          <p>{instance.selfHosted ? "Use an approved account to access this installation. Signup is restricted by your administrator." : isSignup ? "Start building with OutRay." : "Sign in to your OutRay workspace."}</p>
        </div>

        <div className="grid gap-3" role="group" aria-label={isSignup ? "Sign-up options" : "Sign-in options"} aria-busy={busy}>
          {instance.authProviders.includes("github") && <Button type="button" variant="primary" size="lg" className="w-full text-[13px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-400 aria-busy:cursor-progress" loading={loading === "github"}
            disabled={sessionPending || loading === "google"} onClick={() => { if (!busy) onLogin("github"); }} aria-label="Continue with GitHub">
            <FaGithub size={17} aria-hidden="true" />Continue with GitHub
          </Button>}
          {instance.authProviders.includes("google") && <Button type="button" variant="secondary" size="lg" className="w-full text-[13px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-400 aria-busy:cursor-progress" loading={loading === "google"}
            disabled={sessionPending || loading === "github"} onClick={() => { if (!busy) onLogin("google"); }} aria-label="Continue with Google">
            <FcGoogle size={17} aria-hidden="true" />Continue with Google
          </Button>}
          {!instance.authProviders.length && !emailSignIn && <p role="alert">Sign-in is not configured. Ask your administrator to configure GitHub or Google OAuth.</p>}
        </div>
        {emailSignIn}
        <p className="mt-3 mb-0 min-h-5 text-xs leading-5 text-zinc-400" role="status" aria-live="polite" aria-atomic="true">{status}</p>
        {error && <div className="mt-2.5 flex items-start gap-2.25 rounded-[10px] border border-rose-400/16 bg-rose-400/[.04] px-3 py-2.5 text-xs leading-[1.65] text-rose-300 [&>svg]:mt-0.5 [&>svg]:shrink-0 [&>p]:m-0 [&>p]:[overflow-wrap:anywhere]" role="alert"><CircleAlert size={15} aria-hidden="true" /><p>{error}</p></div>}

        {!instance.selfHosted && <p className="mt-6.25 mb-0 text-[13px] leading-[1.7] text-zinc-400 [&_a]:ml-1 [&_a]:rounded-[3px] [&_a]:text-zinc-200 [&_a]:transition-colors [&_a]:duration-160 [&_a:hover]:text-zinc-50 motion-reduce:[&_a]:transition-none">{isSignup
          ? <>Already have an account? <Link to="/login" search={{ redirect }}>Log in</Link></>
          : <>New to OutRay? <Link to="/signup" search={{ redirect }}>Get started</Link></>}</p>}
        {!instance.selfHosted && <p className="mt-[23px] mb-0 max-w-[310px] text-[11px] leading-[1.8] text-[#8b8b94] [&_a]:rounded-[3px] [&_a]:text-zinc-400 [&_a]:underline [&_a]:decoration-zinc-700 [&_a]:underline-offset-3 [&_a]:transition-colors [&_a]:duration-160 [&_a:hover]:text-zinc-50 motion-reduce:[&_a]:transition-none">By continuing, you agree to our <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>.</p>}
      </section>

      {!instance.selfHosted && <aside className="min-w-0 border-l border-white/[.08] py-3.5 pl-14 max-[800px]:hidden" aria-labelledby={productsTitleId}>
        <div className="[&_h2]:mt-[13px] [&_h2]:mb-0 [&_h2]:text-[26px] [&_h2]:leading-[1.35] [&_h2]:font-normal [&_h2]:tracking-[-.04em] [&_h2]:text-zinc-200">
          <span className="text-xs text-zinc-400">Your developer workspace</span>
          <h2 id={productsTitleId}>Everything behind your app.<br />Together in OutRay.</h2>
        </div>
        <ul className="mt-8 mb-0 grid list-none gap-6 p-0 [&>li]:flex [&>li]:items-center [&>li]:gap-3.5 [&_h3]:m-0 [&_h3]:text-[13px] [&_h3]:leading-normal [&_h3]:font-medium [&_h3]:text-zinc-300 [&_p]:mt-[3px] [&_p]:mb-0 [&_p]:text-xs [&_p]:leading-[1.7] [&_p]:text-[#8b8b94]">
          {products.map((product) => <li key={product.name}>
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border border-white/[.07] bg-white/[.02] text-[#c0b3df]" aria-hidden="true"><HugeiconsIcon icon={product.icon} size={19} strokeWidth={1.6} /></span>
            <div><h3>{product.name}</h3><p>{product.description}</p></div>
          </li>)}
        </ul>
      </aside>}
    </main>

    <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.25 px-6 pt-6 pb-[30px] text-[11px] leading-[1.7] text-[#8b8b94] [&_a]:rounded-[3px] [&_a]:text-zinc-400 [&_a]:no-underline [&_a]:transition-colors [&_a]:duration-160 [&_a:hover]:text-zinc-50 motion-reduce:[&_a]:transition-none">{instance.selfHosted
      ? <span>For access or sign-in help, contact your installation administrator.</span>
      : <><span>{isSignup ? "Need a hand getting started?" : "Need a hand signing in?"}</span><a href="mailto:support@outray.dev">Contact support</a></>}</footer>
  </div>;
}
