'use client';

import { ArrowDown, ArrowRight, Check, ChevronDown, Menu } from 'lucide-react';
import Link from 'next/link';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

import styles from './landing.module.css';

const capabilities = [
  {
    number: '01',
    title: 'Detect',
    summary: 'Find the signal before your users become the alert.',
    points: ['Scheduled anomaly detection', 'Durable deduplication', 'CloudWatch and application logs'],
    tone: 'violet',
  },
  {
    number: '02',
    title: 'Investigate',
    summary: 'Build a grounded timeline from logs, deploys, commits, and incident history.',
    points: ['Bounded evidence tools', 'Deployment correlation', 'Incident-scoped memory'],
    tone: 'blue',
  },
  {
    number: '03',
    title: 'Respond',
    summary: 'Move from explanation to a controlled next action without surrendering authority.',
    points: ['Human approval gates', 'Draft pull requests', 'Immutable audit events'],
    tone: 'pink',
  },
];

const surfaces = [
  ['WEB WORKSPACE', 'Investigate together in a durable incident room.'],
  ['SLACK', 'Receive alerts, ask follow-ups, and approve safely.'],
  ['MCP', 'Bring production context into trusted developer tools.'],
];

const manifesto =
  'Modern teams can ship in minutes. Understanding a production failure can still take hours. Calyx follows the evidence across telemetry and changes, then gives your team a safe path forward.';
const manifestoWords = manifesto.split(' ');
const productUrl = process.env.NEXT_PUBLIC_CALYX_APP_URL ?? 'http://localhost:3000/auth';

const sectionTargets: Record<string, string> = {
  'WHY CALYX': 'why',
  'WHAT YOU GET': 'what-you-get',
  PLATFORM: 'platform',
  EVIDENCE: 'evidence',
  SAFETY: 'safety',
  SURFACES: 'surfaces',
  'OPEN CALYX': 'open-calyx',
};

export default function LandingPage() {
  const [progress, setProgress] = useState(0);
  const [pageProgress, setPageProgress] = useState(0);
  const [manifestoProgress, setManifestoProgress] = useState(0);
  const [sectionLabel, setSectionLabel] = useState('WHY CALYX');
  const [menuOpen, setMenuOpen] = useState(false);
  const targetProgress = useRef(0);
  const targetPageProgress = useRef(0);
  const targetManifestoProgress = useRef(0);
  const whyRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const animate = () => {
      setProgress((current) => {
        const next = current + (targetProgress.current - current) * 0.1;
        return Math.abs(next - targetProgress.current) < 0.001 ? targetProgress.current : next;
      });
      setPageProgress((current) => {
        const next = current + (targetPageProgress.current - current) * 0.085;
        return Math.abs(next - targetPageProgress.current) < 0.0005 ? targetPageProgress.current : next;
      });
      setManifestoProgress((current) => {
        const next = current + (targetManifestoProgress.current - current) * 0.12;
        return Math.abs(next - targetManifestoProgress.current) < 0.001 ? targetManifestoProgress.current : next;
      });
      frame.current = requestAnimationFrame(animate);
    };
    const update = () => {
      targetProgress.current = Math.min(1, window.scrollY / (window.innerHeight * 0.72));
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      targetPageProgress.current = Math.min(1, Math.max(0, window.scrollY / scrollable));
      if (whyRef.current) {
        const rect = whyRef.current.getBoundingClientRect();
        const travel = rect.height + window.innerHeight * 0.36;
        targetManifestoProgress.current = Math.min(1, Math.max(0, (window.innerHeight * 0.72 - rect.top) / travel));
      }
    };
    const reveals = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const revealObserver = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.setAttribute('data-visible', 'true');
        }),
      { rootMargin: '-12% 0px -14%', threshold: 0.08 },
    );
    reveals.forEach((element) => revealObserver.observe(element));

    const sceneObserver = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) setSectionLabel((entry.target as HTMLElement).dataset.label ?? 'CALYX');
        }),
      { rootMargin: '-42% 0px -48%', threshold: 0 },
    );
    reveals.forEach((element) => sceneObserver.observe(element));

    update();
    frame.current = requestAnimationFrame(animate);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      revealObserver.disconnect();
      sceneObserver.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <main className={styles.page} style={{ '--hero-progress': progress, '--page-progress': pageProgress } as CSSProperties}>
      <header className={`${styles.header} ${progress > 0.16 ? styles.headerVisible : ''}`}>
        <Link href="/" className={styles.logo} aria-label="Calyx home">
          <span>C</span>
        </Link>
        <a href="#top" className={styles.headerWord} onClick={() => setMenuOpen(false)}>
          CALYX
        </a>
        <div ref={menuRef} className={styles.headerMenu}>
          <button
            type="button"
            className={styles.headerJump}
            aria-expanded={menuOpen}
            aria-controls="landing-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {sectionLabel} <ChevronDown className={menuOpen ? styles.chevronOpen : undefined} size={14} />
          </button>
          <div id="landing-navigation" className={`${styles.navDropdown} ${menuOpen ? styles.navDropdownOpen : ''}`}>
            <span>NAVIGATE CALYX</span>
            {Object.entries(sectionTargets).map(([label, target], index) => (
              <a key={target} href={`#${target}`} onClick={() => setMenuOpen(false)}>
                <small>{String(index + 1).padStart(2, '0')}</small>
                <b>{label}</b>
                <ArrowRight size={14} />
              </a>
            ))}
            <a href={productUrl} className={styles.dropdownSignIn} onClick={() => setMenuOpen(false)}>
              SIGN IN TO CALYX <ArrowRight size={15} />
            </a>
          </div>
        </div>
        <a className={styles.mobileOpen} href={productUrl}>
          <Menu />
        </a>
      </header>

      <div className={styles.ruler} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <section className={styles.hero} id="top">
        <div className={styles.noise} />
        <div className={styles.grid} />
        <div className={styles.stars} aria-hidden="true">
          {Array.from({ length: 22 }, (_, index) => (
            <i key={index} />
          ))}
        </div>
        <div className={styles.city} aria-hidden="true">
          <div className={`${styles.block} ${styles.blockA}`}>
            <i />
            <b />
          </div>
          <div className={`${styles.block} ${styles.blockB}`}>
            <i />
            <b />
          </div>
          <div className={`${styles.block} ${styles.blockC}`}>
            <i />
            <b />
          </div>
          <div className={`${styles.block} ${styles.blockD}`}>
            <i />
            <b />
          </div>
          <div className={`${styles.block} ${styles.blockE}`}>
            <i />
            <b />
          </div>
          <div className={`${styles.block} ${styles.blockF}`}>
            <i />
            <b />
          </div>
          <div className={`${styles.block} ${styles.blockG}`}>
            <i />
            <b />
          </div>
          <div className={`${styles.block} ${styles.blockH}`}>
            <i />
            <b />
          </div>
        </div>
        <Link href="/" className={styles.heroLogo} aria-label="Calyx">
          <span>C</span>
        </Link>
        <span className={styles.heroTopline}>PRODUCTION INTELLIGENCE · BUILT FOR SMALL TEAMS</span>
        <div className={styles.heroContent}>
          <p>OBSERVE · INVESTIGATE · RESPOND</p>
          <h1>CALYX</h1>
          <h2>KNOW WHAT BROKE.</h2>
          <span>Evidence-backed incident investigation for teams that ship fast.</span>
          <div className={styles.heroActions}>
            <a href={productUrl} className={styles.cutButton}>
              OPEN CALYX <ArrowRight size={18} />
            </a>
            <a href="#why" className={styles.ghostButton}>
              EXPLORE PLATFORM
            </a>
          </div>
        </div>
      </section>

      <section ref={whyRef} className={styles.why} id="why" data-reveal data-label="WHY CALYX">
        <div className={styles.noise} />
        <div className={styles.grid} />
        <span className={styles.sectionPill}>WHY CALYX</span>
        <p className={styles.manifesto} aria-label={manifesto}>
          {manifestoWords.map((word, index) => (
            <span
              key={`${word}-${index}`}
              className={index / (manifestoWords.length - 1) <= manifestoProgress ? styles.wordActive : undefined}
              aria-hidden="true"
            >
              {word}{' '}
            </span>
          ))}
        </p>
        <span className={styles.whyCube} aria-hidden="true" />
      </section>

      <section className={styles.signal} id="what-you-get" data-reveal data-label="WHAT YOU GET">
        <div className={styles.noise} />
        <span className={styles.sectionPill}>WHAT YOU GET</span>
        <div className={styles.signalRow}>
          <h2>ONE TIMELINE</h2>
          <p>Logs, alerts, deploys, commits, evidence, and decisions—connected inside one durable incident.</p>
        </div>
        <div className={styles.signalLine}>
          <i />
        </div>
        <div className={styles.signalRow}>
          <h2>SAFE ACTION</h2>
          <p>AI can investigate and propose. Only an authenticated human can authorize a production action.</p>
        </div>
      </section>

      <section className={styles.capabilities} id="platform" data-reveal data-label="PLATFORM">
        <div className={styles.noise} />
        <div className={styles.capabilityIntro}>
          <div>
            <span className={styles.sectionPill}>THE INVESTIGATION LOOP</span>
            <h2>
              THREE SYSTEMS.
              <br />
              ONE RESPONSE.
            </h2>
          </div>
          <p>A complete route from abnormal signal to evidence-backed decision.</p>
        </div>
        <div className={styles.capabilityDeck}>
          {capabilities.map((item) => (
            <article className={`${styles.capability} ${styles[item.tone]}`} key={item.number}>
              <span className={styles.cardNumber}>{item.number}</span>
              <div className={styles.cardPrism} aria-hidden="true">
                <i />
                <b />
              </div>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <ul>
                {item.points.map((point) => (
                  <li key={point}>
                    <Check size={14} />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.incident} id="evidence" data-reveal data-label="EVIDENCE">
        <div className={styles.noise} />
        <div className={styles.incidentCopy}>
          <span className={styles.sectionPill}>EVIDENCE, NOT VIBES</span>
          <h2>
            EVERY CLAIM
            <br />
            KEEPS ITS LABEL.
          </h2>
          <p>Observed facts remain distinct from correlations and AI hypotheses. When evidence is missing, Calyx says so.</p>
          <div className={styles.labels}>
            <span>OBSERVED</span>
            <span>CORRELATED</span>
            <span>HYPOTHESIS</span>
            <span>VERIFIED</span>
          </div>
        </div>
        <div className={styles.terminal}>
          <div className={styles.terminalTop}>
            <span>INCIDENT / CHECKOUT-API</span>
            <i>● LIVE</i>
          </div>
          <div className={styles.terminalTitle}>
            <small>SEV-2 · OPEN</small>
            <h3>Checkout errors after deployment</h3>
          </div>
          <ol>
            <li>
              <time>14:02</time>
              <div>
                <b>OBSERVED</b>
                <p>
                  Error rate crossed 12.4% on <code>/checkout</code>.
                </p>
              </div>
            </li>
            <li>
              <time>14:04</time>
              <div>
                <b>CORRELATED</b>
                <p>
                  Deployment <code>8f21c7</code> completed three minutes earlier.
                </p>
              </div>
            </li>
            <li>
              <time>14:06</time>
              <div>
                <b>HYPOTHESIS</b>
                <p>New validation rejects previously accepted payment payloads.</p>
              </div>
            </li>
          </ol>
          <div className={styles.ask}>
            ASK CALYX ABOUT THIS INCIDENT <ArrowRight size={15} />
          </div>
        </div>
      </section>

      <section className={styles.control} id="safety" data-reveal data-label="SAFETY">
        <div className={styles.noise} />
        <span className={styles.sectionPill}>HUMANS STAY IN CONTROL</span>
        <h2>
          AI INVESTIGATES.
          <br />
          <span>YOU AUTHORIZE.</span>
        </h2>
        <p>Dry runs, durable approval, at-most-once execution claims, customer-owned credentials, and immutable audit history.</p>
        <div className={styles.controlGrid}>
          <div>
            <b>01</b>
            <span>PROPOSE</span>
            <small>Agent explains the action and evidence.</small>
          </div>
          <div>
            <b>02</b>
            <span>REVIEW</span>
            <small>Authorized human inspects the dry run.</small>
          </div>
          <div>
            <b>03</b>
            <span>APPROVE</span>
            <small>Single-use approval claims execution.</small>
          </div>
          <div>
            <b>04</b>
            <span>AUDIT</span>
            <small>Every transition remains durable.</small>
          </div>
        </div>
      </section>

      <section className={styles.surfaces} id="surfaces" data-reveal data-label="SURFACES">
        <div className={styles.noise} />
        <span className={styles.sectionPill}>WORK WHERE YOU ALREADY WORK</span>
        <h2>
          ONE CONTEXT.
          <br />
          EVERY SURFACE.
        </h2>
        <div className={styles.surfaceList}>
          {surfaces.map(([title, copy], index) => (
            <div key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
              <ArrowRight />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.finalCta} id="open-calyx" data-reveal data-label="OPEN CALYX">
        <div className={styles.noise} />
        <div className={styles.grid} />
        <div className={styles.finalOrbit} aria-hidden="true">
          <span />
          <span />
          <span />
          <i />
          <b />
        </div>
        <div className={styles.finalContent}>
          <p>YOUR NEXT INCIDENT WILL HAPPEN.</p>
          <h2>
            BE READY
            <br />
            <span>BEFORE IMPACT.</span>
          </h2>
          <p className={styles.finalSummary}>Give every engineer a clear path from production signal to evidence-backed action.</p>
          <div className={styles.finalActions}>
            <a href={productUrl} className={styles.cutButton}>
              OPEN CALYX <ArrowRight />
            </a>
            <a href="#platform">
              EXPLORE PLATFORM <ArrowDown size={16} />
            </a>
          </div>
          <div className={styles.finalProof}>
            <span>
              <b>01</b> EVIDENCE GROUNDED
            </span>
            <span>
              <b>02</b> HUMAN APPROVED
            </span>
            <span>
              <b>03</b> AUDIT READY
            </span>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.footerWord}>
          CALYX
        </Link>
        <p>Production intelligence for teams that ship.</p>
        <div>
          <a href="https://github.com/Arnab-Afk/calyx" target="_blank" rel="noreferrer">
            ↗ GITHUB
          </a>
          <a href={productUrl}>SIGN IN</a>
        </div>
        <small>© 2026 CALYX · BUILT FOR THE SYSTEMS YOU RUN</small>
      </footer>
    </main>
  );
}
