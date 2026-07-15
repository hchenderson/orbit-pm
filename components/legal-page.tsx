import Link from "next/link";
import { Sparkles } from "lucide-react";

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export function LegalPage({ eyebrow, title, summary, sections }: { eyebrow: string; title: string; summary: string; sections: LegalSection[] }) {
  return <main className="legal-page"><header className="legal-topbar"><Link className="brand" href="/"><span className="brand-mark"><Sparkles size={16} /></span><span>orbit</span></Link><nav><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link></nav></header><article className="legal-document"><div className="legal-intro"><span>{eyebrow}</span><h1>{title}</h1><p>{summary}</p><small>Last updated July 15, 2026</small></div><aside className="legal-template-note"><strong>Launch checklist</strong><p>This is a practical boilerplate template, not legal advice. Replace bracketed operator, address, domain, and contact details before public launch, then have counsel review it.</p></aside>{sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}</section>)}</article><footer className="legal-footer"><span>© 2026 Orbit. All rights reserved.</span><nav><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link><Link href="/delete-account">Delete account</Link></nav></footer></main>;
}
