import { formatFull } from '../lib/formatters';

/** Full-bleed hero: headline, abstract flow motif, and headline total. */
export default function HeroVisual({ total }) {
  return (
    <section className="hero-visual" aria-labelledby="hero-heading">
      <div className="hero-visual__bg" aria-hidden>
        <svg className="hero-visual__svg" viewBox="0 0 1200 320" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="heroFlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffd166" stopOpacity="0" />
              <stop offset="35%" stopColor="#ffd166" stopOpacity="0.35" />
              <stop offset="65%" stopColor="#74b9ff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#74b9ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            fill="none"
            stroke="url(#heroFlowGrad)"
            strokeWidth="3"
            d="M-40,180 C200,40 400,280 600,160 S1000,80 1240,200"
          />
          <path
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="2"
            d="M0,220 Q300,100 600,200 T1200,140"
          />
          <path
            fill="none"
            stroke="rgba(255,209,102,0.2)"
            strokeWidth="1.5"
            d="M100,300 C350,120 550,260 900,80 S1150,200 1280,120"
          />
        </svg>
      </div>
      <div className="hero-visual__inner">
        <h1 id="hero-heading" className="hero-visual__title">
          Follow the <span className="hero-visual__title-accent">money</span>
        </h1>
        <div className="hero-visual__stat">
          <span className="hero-visual__stat-value">{formatFull(total)}</span>
          <span className="hero-visual__stat-hint">total donations from 2020-2025</span>
        </div>
      </div>
    </section>
  );
}
