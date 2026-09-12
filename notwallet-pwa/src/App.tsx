import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  CreditCard,
  Smartphone,
  AlertTriangle,
  Download,
  GitBranch,
  Key,
  Lock,
  FileCode,
  ChevronRight,
  ChevronLeft,
  UserCheck,
  Globe,
  Check,
} from 'lucide-react';

/* ─── Snappy, presentation-grade transitions ─── */
const cubicEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

const slideVariants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? 40 : -40,
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.26,
      ease: cubicEase,
    },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? -40 : 40,
    transition: {
      duration: 0.18,
      ease: cubicEase,
    },
  }),
};

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.03 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: cubicEase },
  },
};

const scaleUp = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.28, ease: cubicEase },
  },
};

const TOTAL_SLIDES = 8;

/* ─────────────────────────────────────────────
   MAIN APP
   ───────────────────────────────────────────── */
export default function App() {
  const [slide, setSlide] = useState(0);
  const [dir, setDir] = useState(1);
  const slideRef = useRef(0);
  slideRef.current = slide;
  const lastNavTime = useRef(0);

  const goTo = useCallback((n: number) => {
    if (n < 0 || n >= TOTAL_SLIDES || n === slideRef.current) return;
    setDir(n > slideRef.current ? 1 : -1);
    setSlide(n);
  }, []);

  const next = useCallback(() => {
    if (slideRef.current < TOTAL_SLIDES - 1) {
      setDir(1);
      setSlide((s) => Math.min(s + 1, TOTAL_SLIDES - 1));
    }
  }, []);

  const prev = useCallback(() => {
    if (slideRef.current > 0) {
      setDir(-1);
      setSlide((s) => Math.max(s - 1, 0));
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) {
        e.preventDefault();
        next();
      }
      if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  // Smooth debounced wheel / trackpad navigation
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 25) return;
      const now = Date.now();
      if (now - lastNavTime.current < 450) return;
      lastNavTime.current = now;
      if (e.deltaY > 0) next();
      else prev();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [next, prev]);

  // Mobile / trackpad touch swipe navigation
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        if (dx < 0) next();
        else prev();
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [next, prev]);

  return (
    <div className="deck">
      {/* Top slide progress line */}
      <div
        className="progress-bar"
        style={{ width: `${((slide + 1) / TOTAL_SLIDES) * 100}%` }}
      />

      {/* Side nav dots */}
      <nav className="dots" aria-label="Slide navigation">
        {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
          <button
            key={i}
            className={`dot ${slide === i ? 'on' : ''}`}
            onClick={() => goTo(i)}
            aria-label={`Jump to slide ${i + 1}`}
          />
        ))}
      </nav>

      {/* Screen edge navigation buttons */}
      <button
        className="nav-arrow nav-arrow-prev"
        onClick={prev}
        disabled={slide === 0}
        aria-label="Previous slide"
      >
        <ChevronLeft size={20} />
      </button>

      <button
        className="nav-arrow nav-arrow-next"
        onClick={next}
        disabled={slide === TOTAL_SLIDES - 1}
        aria-label="Next slide"
      >
        <ChevronRight size={20} />
      </button>

      {/* Bottom slide counter */}
      <div className="counter">
        <span>
          {String(slide + 1).padStart(2, '0')} / {String(TOTAL_SLIDES).padStart(2, '0')}
        </span>
        <span className="counter-hint">Space / ← → to navigate</span>
      </div>

      <AnimatePresence mode="popLayout" custom={dir} initial={false}>
        {slide === 0 && <Slide0 key="s0" dir={dir} onNext={next} />}
        {slide === 1 && <Slide1 key="s1" dir={dir} />}
        {slide === 2 && <Slide2 key="s2" dir={dir} />}
        {slide === 3 && <Slide3 key="s3" dir={dir} />}
        {slide === 4 && <Slide4 key="s4" dir={dir} />}
        {slide === 5 && <Slide5 key="s5" dir={dir} />}
        {slide === 6 && <Slide6 key="s6" dir={dir} />}
        {slide === 7 && <Slide7 key="s7" dir={dir} />}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SLIDE 0 — TITLE / HERO
   ═══════════════════════════════════════════════ */
function Slide0({ dir, onNext }: { dir: number; onNext: () => void }) {
  return (
    <motion.section
      className="slide"
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      custom={dir}
      style={{ textAlign: 'center', flexDirection: 'column', gap: 28 }}
    >
      <Orb w={600} t="-20%" l="10%" c="rgba(129,140,248,0.12)" />
      <Orb w={400} t="60%" l="70%" c="rgba(34,211,238,0.09)" />
      <div className="grid-bg" />

      <motion.div
        className="slide-inner"
        variants={stagger}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}
      >
        <motion.div variants={fadeUp}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 16px',
              borderRadius: 9999,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--emerald)',
                boxShadow: '0 0 8px var(--emerald)',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              ETHOnline 2026 Presentation
            </span>
          </div>
        </motion.div>

        <motion.h1 className="h1 gw" variants={fadeUp} style={{ maxWidth: 920 }}>
          NotWallet
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="body-lg"
          style={{ maxWidth: 660, textAlign: 'center' }}
        >
          The $0 hardware wallet that turns any everyday contactless card — metro pass, debit card, gym ID — into an air-gapped cryptographic key.
        </motion.p>

        <motion.div variants={fadeUp} style={{ display: 'flex', gap: 14, marginTop: 8 }}>
          <button className="btn btn-p" onClick={onNext}>
            Start Presentation <ChevronRight size={16} />
          </button>
        </motion.div>

        <motion.p
          variants={fadeUp}
          style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 20 }}
        >
          Built by <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Roshan Singh</span>
        </motion.p>
      </motion.div>
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════
   SLIDE 1 — THE PROBLEM (MY STORY)
   ═══════════════════════════════════════════════ */
function Slide1({ dir }: { dir: number }) {
  return (
    <motion.section
      className="slide"
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      custom={dir}
    >
      <Orb w={500} t="10%" l="75%" c="rgba(251,113,133,0.1)" />
      <div className="grid-bg" />

      <motion.div className="slide-inner" variants={stagger} initial="hidden" animate="visible">
        <motion.div className="label" variants={fadeUp} style={{ color: 'var(--rose)' }}>
          My Story
        </motion.div>

        <motion.h2 className="h2 gw" variants={fadeUp} style={{ maxWidth: 840, marginBottom: 20 }}>
          I woke up and watched my savings <span className="gr">disappear in 3 seconds.</span>
        </motion.h2>

        <motion.p className="body-lg" variants={fadeUp} style={{ maxWidth: 740, marginBottom: 44 }}>
          A silent infostealer malware compromised my browser, grabbed my session keys, and swept every token out of my hot wallet. That devastating loss forced me to face an uncomfortable truth:
        </motion.p>

        <motion.blockquote
          variants={scaleUp}
          style={{
            borderLeft: '3px solid var(--rose)',
            paddingLeft: 24,
            fontSize: 'clamp(18px, 2.2vw, 24px)',
            fontWeight: 600,
            fontStyle: 'italic',
            lineHeight: 1.55,
            color: 'var(--text)',
            maxWidth: 720,
            opacity: 0.95,
          }}
        >
          "As long as your private keys live on an internet-connected device, you are one malicious download away from losing everything."
        </motion.blockquote>
      </motion.div>
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════
   SLIDE 2 — THE CRISIS (DATA)
   ═══════════════════════════════════════════════ */
function Slide2({ dir }: { dir: number }) {
  return (
    <motion.section
      className="slide"
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      custom={dir}
    >
      <Orb w={500} t="5%" l="5%" c="rgba(251,113,133,0.08)" />
      <div className="grid-bg" />

      <motion.div className="slide-inner" variants={stagger} initial="hidden" animate="visible">
        <motion.div className="label" variants={fadeUp} style={{ color: 'var(--rose)' }}>
          The Scale
        </motion.div>

        <motion.h2 className="h2 gw" variants={fadeUp} style={{ maxWidth: 820, marginBottom: 44 }}>
          This isn't just me. <span className="gr">It's a $2 billion crisis.</span>
        </motion.h2>

        <motion.div
          variants={fadeUp}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20,
          }}
        >
          <StatCard
            icon={<AlertTriangle size={22} />}
            iconBg="rgba(251,113,133,0.12)"
            iconColor="var(--rose)"
            number="$2.14B"
            label="Total Lost (2024–2026)"
            desc="Drained via browser exploits, clipboard malware, and private key theft."
            grad="gr"
          />
          <StatCard
            icon={<Key size={22} />}
            iconBg="rgba(129,140,248,0.12)"
            iconColor="var(--accent)"
            number="68.4%"
            label="From Stolen Keys"
            desc="Of all losses came directly from compromised private keys stored on disk."
            grad="ga"
          />
          <StatCard
            icon={<Shield size={22} />}
            iconBg="rgba(52,211,153,0.12)"
            iconColor="var(--emerald)"
            number="< 8%"
            label="Use Hardware Wallets"
            desc="92% of users remain exposed on hot wallets because hardware wallets are too painful."
            grad="ge"
          />
        </motion.div>
      </motion.div>
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════
   SLIDE 3 — WHY HARDWARE WALLETS FAIL
   ═══════════════════════════════════════════════ */
function Slide3({ dir }: { dir: number }) {
  const items = [
    {
      icon: <CreditCard size={20} />,
      color: 'var(--rose)',
      bg: 'rgba(251,113,133,0.1)',
      title: '$150 Paywall',
      desc: 'Buy a proprietary Ledger or Trezor before you even own $10 of crypto.',
    },
    {
      icon: <Smartphone size={20} />,
      color: 'var(--amber)',
      bg: 'rgba(251,191,36,0.1)',
      title: 'Device Burden',
      desc: 'Another dedicated gadget to charge, carry, and connect with cables.',
    },
    {
      icon: <FileCode size={20} />,
      color: 'var(--cyan)',
      bg: 'rgba(34,211,238,0.1)',
      title: '24 Seed Words',
      desc: 'Written on paper in a drawer. If your house floods, you lose everything.',
    },
    {
      icon: <Lock size={20} />,
      color: 'var(--accent)',
      bg: 'rgba(129,140,248,0.1)',
      title: 'Complex Setup',
      desc: 'Multi-sig requires multi-party coordination. Nobody does it from day one.',
    },
  ];

  return (
    <motion.section
      className="slide"
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      custom={dir}
    >
      <Orb w={450} t="60%" l="80%" c="rgba(251,191,36,0.08)" />
      <div className="grid-bg" />

      <motion.div className="slide-inner" variants={stagger} initial="hidden" animate="visible">
        <motion.div className="label" variants={fadeUp} style={{ color: 'var(--amber)' }}>
          The Barrier
        </motion.div>

        <motion.h2 className="h2 gw" variants={fadeUp} style={{ maxWidth: 820, marginBottom: 16 }}>
          Why 92% refuse <span className="gy">hardware wallets.</span>
        </motion.h2>

        <motion.p className="body-lg" variants={fadeUp} style={{ maxWidth: 640, marginBottom: 38 }}>
          The security industry says "just buy a hardware wallet" — but the user experience is broken for ordinary people.
        </motion.p>

        <motion.div
          variants={fadeUp}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 16,
          }}
        >
          {items.map((f) => (
            <div key={f.title} className="card">
              <div className="icon-box" style={{ background: f.bg, color: f.color }}>
                {f.icon}
              </div>
              <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{f.title}</h4>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════
   SLIDE 4 — THE NOTWALLET BREAKTHROUGH
   ═══════════════════════════════════════════════ */
function Slide4({ dir }: { dir: number }) {
  return (
    <motion.section
      className="slide"
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      custom={dir}
    >
      <Orb w={550} t="-5%" l="30%" c="rgba(34,211,238,0.1)" />
      <div className="grid-bg" />

      <motion.div className="slide-inner" variants={stagger} initial="hidden" animate="visible">
        <motion.div className="label" variants={fadeUp} style={{ color: 'var(--cyan)' }}>
          The Breakthrough
        </motion.div>

        <motion.h2 className="h2 gw" variants={fadeUp} style={{ maxWidth: 880, marginBottom: 16 }}>
          Your everyday cards are already <span className="ga">hardware keys.</span>
        </motion.h2>

        <motion.p className="body-lg" variants={fadeUp} style={{ maxWidth: 700, marginBottom: 40 }}>
          NotWallet uses MFKDF to derive your private key from a physical card's NFC UID + your secret passphrase. Zero keys stored on disk. Zero hardware cost.
        </motion.p>

        {/* Flow diagram */}
        <motion.div variants={scaleUp} className="flow" style={{ marginBottom: 36 }}>
          <FlowItem emoji="💳" title="Physical Card" sub="NFC UID (ISO 14443)" />
          <Connector />
          <FlowItem emoji="🔑" title="Passphrase" sub="Knowledge Factor" />
          <Connector />
          <div style={{ textAlign: 'center' }}>
            <div
              className="flow-box"
              style={{
                borderColor: 'rgba(52,211,153,0.4)',
                background: 'rgba(52,211,153,0.06)',
              }}
            >
              🛡️
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                marginTop: 10,
                color: 'var(--emerald)',
              }}
            >
              ETH Private Key
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              38ms · Wiped Instantly
            </div>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span className="pill pill-e">✓ $0 Hardware Cost</span>
          <span className="pill pill-c">✓ Zero Keys on Disk</span>
          <span className="pill pill-a">✓ No Seed Phrases</span>
          <span className="pill pill-r">✓ Works with Any NFC Card</span>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════
   SLIDE 5 — ARCHITECTURE
   ═══════════════════════════════════════════════ */
function Slide5({ dir }: { dir: number }) {
  const layers = [
    {
      label: 'Layer 1 — Physical Hardware',
      items: [
        'ISO 14443 NFC UID acts as physical hardware salt',
        'Contactless read via Android NFC Reader Mode',
        'Card is completely inert plastic without passphrase',
      ],
      color: 'var(--cyan)',
    },
    {
      label: 'Layer 2 — Cryptographic MFKDF',
      items: [
        'Multi-factor key derivation (Card UID + memory PIN)',
        'Ephemeral key created in volatile RAM only',
        'Deterministic: same card + PIN = same Ethereum key',
      ],
      color: 'var(--accent)',
    },
    {
      label: 'Layer 3 — Policy Engine',
      items: [
        'Per-transaction spending cap (0.05 ETH default)',
        '24-hour rolling daily transaction limit',
        'World ID gated overrides & emergency rescue sweep',
      ],
      color: 'var(--emerald)',
    },
  ];

  return (
    <motion.section
      className="slide"
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      custom={dir}
    >
      <Orb w={450} t="20%" l="80%" c="rgba(129,140,248,0.08)" />
      <div className="grid-bg" />

      <motion.div className="slide-inner" variants={stagger} initial="hidden" animate="visible">
        <motion.div className="label" variants={fadeUp}>
          Architecture
        </motion.div>

        <motion.h2 className="h2 gw" variants={fadeUp} style={{ maxWidth: 820, marginBottom: 40 }}>
          Three layers of <span className="ga">defense-in-depth.</span>
        </motion.h2>

        <motion.div
          variants={fadeUp}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 20,
          }}
        >
          {layers.map((l) => (
            <div key={l.label} className="card" style={{ padding: 28 }}>
              <h4
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  marginBottom: 16,
                  color: l.color,
                }}
              >
                {l.label}
              </h4>
              <ul
                style={{
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {l.items.map((item) => (
                  <li
                    key={item}
                    style={{
                      display: 'flex',
                      gap: 10,
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: l.color, flexShrink: 0 }}>→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════
   SLIDE 6 — SPONSOR INTEGRATIONS (WORLD ID + ENS ONLY)
   ═══════════════════════════════════════════════ */
function Slide6({ dir }: { dir: number }) {
  const sponsors = [
    {
      badge: 'Bounty: World ID',
      tagColor: 'var(--cyan)',
      title: 'World ID',
      subtitle: 'Selfie Check Beta Credential',
      desc: 'High-risk security actions trigger an interactive biometric selfie check via the World ID bridge. Guarantees real human presence without requiring an Orb.',
      features: [
        'Live 3D selfie liveness check (Beta credential)',
        'Zero-knowledge proof verified on Sepolia testnet',
        'policy-override-guard gates limit increases',
        'Stops malware / drainers even with phone unlocked',
      ],
      tag: 'policy-override-guard',
      highlight: 'Zero Orb Required · Private ZK Proof',
      icon: <UserCheck size={28} color="var(--cyan)" />,
      borderColor: 'rgba(34,211,238,0.22)',
      glowBg: 'rgba(34,211,238,0.035)',
    },
    {
      badge: 'Bounty: ENS',
      tagColor: 'var(--accent)',
      title: 'ENSv2',
      subtitle: 'Subname Architecture & Agent Scoping',
      desc: 'Every derived NotWallet address is registered with a human-readable identity on Sepolia. Autonomous agents receive bounded sub-accounts with strict daily spend quotas.',
      features: [
        'Human-readable identity: username.notwallet.eth',
        'Sepolia ENSv2 subname resolver & registry',
        'Agent accounts: agent-1.roshan.notwallet.eth',
        'Strict daily spend quotas enforced per subname',
      ],
      tag: 'Sepolia Subname Registrar',
      highlight: 'Human Readable · AI Agent Scoping',
      icon: <Globe size={28} color="var(--accent)" />,
      borderColor: 'rgba(129,140,248,0.22)',
      glowBg: 'rgba(129,140,248,0.035)',
    },
  ];

  return (
    <motion.section
      className="slide"
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      custom={dir}
    >
      <Orb w={500} t="-10%" l="15%" c="rgba(34,211,238,0.08)" />
      <Orb w={450} t="60%" l="75%" c="rgba(129,140,248,0.08)" />
      <div className="grid-bg" />

      <motion.div className="slide-inner" variants={stagger} initial="hidden" animate="visible">
        <motion.div className="label" variants={fadeUp} style={{ color: 'var(--emerald)' }}>
          Sponsor Integrations
        </motion.div>

        <motion.h2 className="h2 gw" variants={fadeUp} style={{ maxWidth: 840, marginBottom: 12 }}>
          Powered by <span className="ge">World ID</span> & <span className="ga">ENSv2.</span>
        </motion.h2>

        <motion.p className="body-lg" variants={fadeUp} style={{ maxWidth: 700, marginBottom: 36 }}>
          Two deep integrations that transform everyday plastic cards into an intelligent, human-verified, identity-native self-custody platform.
        </motion.p>

        <motion.div
          variants={fadeUp}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 22,
          }}
        >
          {sponsors.map((s) => (
            <div
              key={s.title}
              className="card"
              style={{
                padding: 30,
                borderColor: s.borderColor,
                background: s.glowBg,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 18,
                }}
              >
                <div
                  className="icon-box"
                  style={{ background: 'rgba(255,255,255,0.05)', marginBottom: 0 }}
                >
                  {s.icon}
                </div>
                <span
                  className="pill"
                  style={{
                    borderColor: s.borderColor,
                    color: s.tagColor,
                    background: 'rgba(0,0,0,0.35)',
                  }}
                >
                  {s.badge}
                </span>
              </div>

              <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
                {s.title}
              </h3>
              <p style={{ fontSize: 13, color: s.tagColor, fontWeight: 600, marginBottom: 12 }}>
                {s.subtitle}
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  marginBottom: 18,
                }}
              >
                {s.desc}
              </p>

              <div
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: 16,
                  marginBottom: 16,
                }}
              >
                <ul
                  style={{
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {s.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Check size={14} color={s.tagColor} style={{ flexShrink: 0 }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <span className="chip">{s.tag}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                  {s.highlight}
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════
   SLIDE 7 — RESULTS & DOWNLOAD
   ═══════════════════════════════════════════════ */
function Slide7({ dir }: { dir: number }) {
  return (
    <motion.section
      className="slide"
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      custom={dir}
      style={{ textAlign: 'center' }}
    >
      <Orb w={600} t="-15%" l="25%" c="rgba(129,140,248,0.1)" />
      <div className="grid-bg" />

      <motion.div
        className="slide-inner"
        variants={stagger}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}
      >
        <motion.div className="label" variants={fadeUp} style={{ justifyContent: 'center' }}>
          Ship It
        </motion.div>

        <motion.h2 className="h2 gw" variants={fadeUp} style={{ maxWidth: 720 }}>
          Built. Tested. <span className="ga">Ready today.</span>
        </motion.h2>

        <motion.p
          className="body-lg"
          variants={fadeUp}
          style={{ textAlign: 'center', maxWidth: 600 }}
        >
          Native Android app · React Native + QuickCrypto + NFC Reader Mode
          <br />
          25 automated tests passing · Deployed on Sepolia testnet
        </motion.p>

        {/* Results row */}
        <motion.div
          variants={fadeUp}
          style={{
            display: 'flex',
            gap: 32,
            flexWrap: 'wrap',
            justifyContent: 'center',
            margin: '8px 0',
          }}
        >
          {[
            { n: '38ms', l: 'Key derivation' },
            { n: '25', l: 'Tests passing' },
            { n: '$0', l: 'Hardware cost' },
            { n: '2', l: 'Sponsors (ENS + World)' },
          ].map((r) => (
            <div key={r.l} style={{ textAlign: 'center' }}>
              <div
                className="ga"
                style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}
              >
                {r.n}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{r.l}</div>
            </div>
          ))}
        </motion.div>

        {/* QR + Buttons */}
        <motion.div
          variants={scaleUp}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 36,
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: 4,
          }}
        >
          <motion.div
            style={{
              background: '#fff',
              padding: 12,
              borderRadius: 18,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 80px rgba(129,140,248,0.12)',
            }}
            whileHover={{ scale: 1.04 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          >
            <img
              src="/qr.png"
              alt="Download NotWallet APK"
              style={{ width: 170, height: 170, display: 'block', borderRadius: 8 }}
            />
          </motion.div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>
              Scan QR or download directly:
            </p>
            <a
              href="https://github.com/roshan-zirconlabs/ethglobal2026/releases"
              target="_blank"
              rel="noreferrer"
              className="btn btn-p"
            >
              <Download size={16} /> Download APK
            </a>
            <a
              href="https://github.com/roshan-zirconlabs/ethglobal2026"
              target="_blank"
              rel="noreferrer"
              className="btn btn-s"
            >
              <GitBranch size={16} /> GitHub Repository
            </a>
          </div>
        </motion.div>

        <motion.p
          variants={fadeUp}
          style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 20 }}
        >
          Built by Roshan Singh · ETHOnline 2026
        </motion.p>
      </motion.div>
    </motion.section>
  );
}

/* ─── Reusable Components ─── */

function Orb({ w, t, l, c }: { w: number; t: string; l: string; c: string }) {
  return (
    <div
      className="orb"
      style={{
        width: w,
        height: w,
        top: t,
        left: l,
        background: `radial-gradient(circle closest-side, ${c} 0%, transparent 100%)`,
      }}
    />
  );
}

function StatCard({
  icon,
  iconBg,
  iconColor,
  number,
  label,
  desc,
  grad,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  number: string;
  label: string;
  desc: string;
  grad: string;
}) {
  return (
    <div className="card">
      <div className="icon-box" style={{ background: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div
        className={`${grad}`}
        style={{
          fontSize: 'clamp(32px, 3.8vw, 48px)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          margin: '8px 0',
        }}
      >
        {number}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

function FlowItem({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="flow-box">{emoji}</div>
      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 10 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Connector() {
  return (
    <div
      style={{
        color: 'var(--accent)',
        fontSize: 22,
        fontWeight: 300,
        padding: '0 6px',
        opacity: 0.8,
        userSelect: 'none',
      }}
    >
      →
    </div>
  );
}
