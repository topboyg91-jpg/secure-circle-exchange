import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 64 64" className="h-9 w-9">
        <circle cx="32" cy="32" r="30" fill="oklch(0.18 0.012 250)" stroke="oklch(0.38 0.018 250)" strokeWidth="2" />
        <path d="M32 2 a30 30 0 0 1 0 60 a15 15 0 0 1 0 -30 a15 15 0 0 0 0 -30 z" fill="oklch(0.78 0.18 95)" />
        <path d="M32 62 a30 30 0 0 1 0 -60 a15 15 0 0 1 0 30 a15 15 0 0 0 0 30 z" fill="oklch(0.78 0.14 220)" />
        <circle cx="32" cy="17" r="4" fill="oklch(0.78 0.14 220)" />
        <circle cx="32" cy="47" r="4" fill="oklch(0.78 0.18 95)" />
      </svg>
      <span className="text-2xl font-bold">
        <span className="text-secondary">Fair </span>
        <span className="text-primary">Trade</span>
      </span>
    </div>
  );
}

export function SiteLayout({ children, banner }: { children: ReactNode; banner?: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Link to="/"><Logo /></Link>
            <nav className="flex items-center gap-5 text-base text-foreground/90">
              <Link to="/" className="hover:text-primary [&.active]:text-primary">Home</Link>
              <Link to="/terms" className="hover:text-primary [&.active]:text-primary">Terms</Link>
              <Link to="/faq" className="hover:text-primary [&.active]:text-primary">FAQ</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/check-trade" className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90">Check Trade</Link>
            <Link to="/start-trade" className="rounded-md bg-secondary px-4 py-2 font-semibold text-secondary-foreground hover:opacity-90">Start Trade</Link>
          </div>
        </div>
      </header>
      {banner !== undefined ? (
        <div className="bg-muted/30 border-y border-border">
          <div className="mx-auto max-w-6xl px-4 py-3 text-center font-semibold text-foreground">
            {banner}
          </div>
        </div>
      ) : null}
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f60] text-white font-bold">M</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f7931a] text-white font-bold">₿</span>
          </div>
          <Link to="/" className="text-primary font-semibold">mirrors</Link>
        </div>
      </footer>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg bg-card p-6 ${className}`}>{children}</div>;
}

export function SandBox({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-md bg-accent text-accent-foreground p-5 ${className}`}>{children}</div>
  );
}