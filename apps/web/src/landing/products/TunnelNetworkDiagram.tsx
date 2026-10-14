import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import LaptopIcon from "@outray/icons/stroke/LaptopIcon";
import SecurityLockIcon from "@outray/icons/stroke/SecurityLockIcon";
import ServerStack01Icon from "@outray/icons/stroke/ServerStack01Icon";

const stages = [
  { key: "local", title: "Localhost", icon: LaptopIcon },
  { key: "secure", title: "Secure tunnel", icon: SecurityLockIcon },
  { key: "edge", title: "OutRay Edge", icon: ServerStack01Icon },
  { key: "public", title: "Public Internet", icon: Globe02Icon },
] as const;

const stageTone = {
  local: "[--arrival:0s] [--node-color:#facc15] [--node-rgb:250_204_21]",
  secure: "[--arrival:1.8s] [--node-color:#4ade80] [--node-rgb:74_222_128]",
  edge: "[--arrival:3.6s] [--node-color:#c084fc] [--node-rgb:192_132_252]",
  public: "[--arrival:5.4s] [--node-color:#60a5fa] [--node-rgb:96_165_250]",
} as const;

export function TunnelNetworkDiagram() {
  const sectionRef = useRef<HTMLElement>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motionQuery.matches);
    const updateVisibility = () => setDocumentVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    motionQuery.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);

    const element = sectionRef.current;
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      ([entry]) => setOnScreen(entry?.isIntersecting ?? false),
      { threshold: 0.15 },
    );
    if (observer && element) observer.observe(element);
    else setOnScreen(true);

    return () => {
      motionQuery.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
      observer?.disconnect();
    };
  }, []);

  const running = reducedMotion === false && onScreen && documentVisible;

  const animationState = running ? "[animation-play-state:running]" : "[animation-play-state:paused]";

  return <section ref={sectionRef} className="relative py-[106px_86px] max-[900px]:py-[83px_70px] max-[760px]:py-[70px_56px] max-[440px]:py-[58px_46px]" aria-labelledby="tunnel-connection-title" data-motion={running ? "running" : "paused"} data-reduced-motion={reducedMotion === true}>
    <div className="text-center">
      <h2 className="scroll-mt-[calc(var(--header-height)+40px)] text-[clamp(42px,5.3vw,64px)] leading-[1.06] font-[550] tracking-[-0.065em] text-[#fafafa] italic [text-shadow:0_0_24px_rgb(255_255_255/.08)] max-[900px]:text-[clamp(42px,6vw,58px)] max-[440px]:text-[43px]" id="tunnel-connection-title">It just works.</h2>
      <p className="mx-auto mt-[23px] max-w-[680px] text-[15px] leading-[1.8] text-pretty text-[#b3b3b3] max-[760px]:max-w-[540px] max-[760px]:text-sm max-[440px]:mt-[18px] max-[440px]:text-[13px]">Your app stays on your machine. OutRay connects it to the world.<br className="max-[440px]:hidden" /> No port forwarding. No deployment. Just a connection.</p>
    </div>

    <div className="relative mx-auto mt-[68px] max-w-[1080px] max-[900px]:mt-[54px] max-[760px]:mt-11 max-[760px]:w-[min(390px,100%)]">
      <div className="pointer-events-none absolute top-9 left-[12.5%] h-px w-3/4 bg-[linear-gradient(90deg,#6b5a18,#245839_34%,#5d3479_67%,#29496b)] max-[760px]:top-9 max-[760px]:left-9 max-[760px]:h-[calc(100%-72px)] max-[760px]:w-px max-[760px]:bg-[linear-gradient(#6b5a18,#245839_34%,#5d3479_67%,#29496b)]" aria-hidden="true"><span className={`absolute top-1/2 left-0 z-[2] size-1.5 -translate-1/2 animate-[packet-horizontal_6s_linear_infinite] rounded-full bg-white opacity-0 shadow-[0_0_10px_rgb(255_255_255/.6)] before:absolute before:top-1/2 before:right-0.5 before:h-px before:w-[42px] before:-translate-y-1/2 before:bg-[linear-gradient(90deg,transparent,rgb(255_255_255/.6))] before:content-[''] max-[760px]:top-0 max-[760px]:left-1/2 max-[760px]:[animation-name:packet-vertical] max-[760px]:before:top-auto max-[760px]:before:right-auto max-[760px]:before:bottom-0.5 max-[760px]:before:left-1/2 max-[760px]:before:h-8 max-[760px]:before:w-px max-[760px]:before:-translate-x-1/2 max-[760px]:before:translate-y-0 max-[760px]:before:bg-[linear-gradient(transparent,rgb(255_255_255/.6))] motion-reduce:animate-none ${animationState}`} /></div>
      <ol className="relative m-0 grid list-none grid-cols-4 gap-0 p-0 max-[760px]:grid-cols-1 max-[760px]:gap-8" aria-label="How a tunnel connects your local app to the internet">
        {stages.map((stage) => <li className={`relative min-w-0 text-center max-[760px]:grid max-[760px]:h-[72px] max-[760px]:grid-cols-[72px_minmax(0,1fr)] max-[760px]:gap-[22px] max-[760px]:text-left max-[440px]:gap-[17px] ${stageTone[stage.key]}`} key={stage.key} data-stage={stage.key}>
          <div className="relative mx-auto mb-[25px] flex size-[72px] items-center justify-center rounded-[17px] border bg-[#111] text-[var(--node-color)] shadow-[0_0_24px_rgb(var(--node-rgb)/.08)] [border-color:rgb(var(--node-rgb)/.3)] max-[760px]:m-0 [&>svg]:relative [&>svg]:z-[1]" aria-hidden="true"><span className={`pointer-events-none absolute -inset-5 animate-[node-glow_6s_ease-out_var(--arrival)_infinite] rounded-full bg-[radial-gradient(circle,rgb(var(--node-rgb)/.4),transparent_72%)] opacity-0 motion-reduce:animate-none ${animationState}`} /><span className={`pointer-events-none absolute -inset-px animate-[node-pulse_6s_ease-out_var(--arrival)_infinite] rounded-[inherit] border opacity-0 [border-color:rgb(var(--node-rgb)/.8)] motion-reduce:animate-none ${animationState}`} /><HugeiconsIcon icon={stage.icon} size={32} strokeWidth={1.8} /></div>
          <div className="max-[760px]:flex max-[760px]:items-center"><h3 className="m-0 text-base leading-[1.4] font-[520] tracking-[-0.015em] text-[#ededed] max-[900px]:text-sm max-[760px]:text-base">{stage.title}</h3></div>
        </li>)}
      </ol>
    </div>

  </section>;
}
