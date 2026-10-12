import { SidebarTrigger } from "fumadocs-ui/components/sidebar/base";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Menu, Search } from "lucide-react";

function DocsSearch() {
  const { enabled, hotKey, setOpenSearch } = useSearchContext();
  if (!enabled) return null;
  return (
    <button className="inline-flex h-[35px] w-[260px] items-center gap-2.25 rounded-lg border border-white/[.08] bg-[#131315] px-2.5 text-xs text-[#92929f] hover:bg-[#19191d] hover:text-zinc-200 max-[1000px]:w-[210px] max-md:size-[34px] max-md:justify-center max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:[&>span]:hidden" type="button" aria-label="Search documentation" onClick={() => setOpenSearch(true)}>
      <Search size={15} aria-hidden="true" />
      <span>Search documentation</span>
      <span className="ml-auto inline-flex gap-0.5 [&_kbd]:font-sans [&_kbd]:text-[10px]" aria-hidden="true">{hotKey.map((key, index) => <kbd key={index}>{key.display}</kbd>)}</span>
    </button>
  );
}

export function DocsHeader() {
  return (
    <header className="sticky top-0 z-35 col-[1/-1] row-1 flex h-16 min-w-0 items-center gap-[13px] border-b border-white/[.07] bg-[#09090bf5] px-7 [&_:is(a,button):focus-visible]:outline-2 [&_:is(a,button):focus-visible]:outline-offset-4 [&_:is(a,button):focus-visible]:outline-[#b29adf] max-md:h-14 max-md:gap-2.5 max-md:px-4">
      <a className="absolute top-2 left-4 -translate-y-[200%] rounded-lg bg-zinc-100 px-3.5 py-2.5 text-zinc-900 focus:translate-y-0" href="#docs-content">Skip to content</a>
      <a className="inline-flex items-center gap-2.25 text-[17px] font-medium text-zinc-50 no-underline" href="/" aria-label="OutRay home">
        <img src="/brand/outray-mark.svg" alt="" width="28" height="28" />
        <span>OutRay</span>
      </a>
      <span className="text-[21px] font-light text-[#46464f]" aria-hidden="true">/</span>
      <a className="text-sm text-zinc-400 hover:text-zinc-50" href="/docs">Docs</a>
      <nav className="ml-8 flex gap-[22px] text-[13px] text-zinc-400 [&_a:hover]:text-zinc-50 max-[1000px]:hidden" aria-label="Documentation resources">
        <a href="/products">Products</a>
        <a href="https://github.com/outray-tunnel/outray" target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
      </nav>
      <div className="ml-auto flex items-center gap-3.5 max-md:gap-2">
        <DocsSearch />
        <a className="inline-flex min-h-[35px] items-center gap-3 rounded-[9px] bg-zinc-100 px-3.5 py-2 text-xs font-medium text-zinc-900 no-underline hover:bg-[#dedee3] max-md:hidden" href="/signup">Get started <span aria-hidden="true">↗</span></a>
        <SidebarTrigger className="hidden size-[34px] items-center justify-center rounded-lg text-zinc-400 max-md:inline-flex" aria-label="Open documentation navigation">
          <Menu size={19} aria-hidden="true" />
        </SidebarTrigger>
      </div>
    </header>
  );
}
