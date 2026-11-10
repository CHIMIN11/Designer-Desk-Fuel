import { Link } from 'react-router-dom'
import { asset } from '../lib/asset'

const PILLARS = [
  { en: 'WORK', zh: '自由工作' },
  { en: 'CREATE', zh: '激發靈感' },
  { en: 'CONNECT', zh: '交流想法' },
  { en: 'REFUEL', zh: '補充能量' },
]

const NETWORK = [
  { no: 'A', en: 'Workspaces', zh: '工作空間' },
  { no: 'B', en: 'Design Talent', zh: '設計人才' },
  { no: 'C', en: 'Creative Community', zh: '創意社群' },
]

export default function About() {
  return (
    <article className="ab">
      <header className="ab-hero">
        <div className="ab-wrap">
          <p className="ab-kicker">About Designer Desk Fuel</p>
          <h1 className="ab-title"><span className="nw">設計師的工作</span><span className="ab-dot">・</span><span className="gold-text nw">創意據點</span></h1>
          <p className="ab-lede">A creative base for designers who work, create and connect — anywhere.</p>
          <ul className="ab-pillars" aria-label="WORK. CREATE. CONNECT. REFUEL.">
            {PILLARS.map((p, i) => (
              <li key={p.en}>
                <span className="n">0{i + 1}</span>
                <b>{p.en}.</b>
                <span>{p.zh}</span>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <div className="ab-wrap">
        <section className="ab-row">
          <div className="ab-label"><span>01</span><b>起點</b><small>The Challenge</small></div>
          <div className="ab-body">
            <p>身為科技業設計師，經常在台北與桃園尋找適合工作的空間。卻總遇到插座不足、筆電電力告急、限時使用，或環境吵雜而無法專心創作的困境。</p>
          </div>
        </section>

        <section className="ab-row">
          <div className="ab-label"><span>02</span><b>信念</b><small>What We Believe</small></div>
          <div className="ab-body">
            <blockquote className="ab-quote">
              我相信，設計師需要的不只是一張桌子，而是一個能自由工作、激發靈感、交流想法的創作基地。
            </blockquote>
          </div>
        </section>

        <section className="ab-row">
          <div className="ab-label"><span>03</span><b>我們打造的</b><small>What We Build</small></div>
          <div className="ab-body">
            <p className="ab-strong">因此，我們打造 DDF。</p>
            <p>一個串連工作空間、設計人才與創意社群的據點，讓每位設計師都能找到自己的創作節奏，遇見志同道合的夥伴，讓創意不受空間限制，發揮更大的魔力。</p>
            <ul className="ab-network">
              {NETWORK.map((n) => (
                <li key={n.en}><span>{n.no}</span><b>{n.zh}</b><small>{n.en}</small></li>
              ))}
            </ul>
          </div>
        </section>

        <section className="ab-close">
          <img src={asset('/logo-full.png')} alt="Designer Desk Fuel" />
          <div>
            <p className="ab-tagline">Find Your Space. <span className="gold-text">Fuel Your Magic.</span></p>
            <p className="ab-sign">— Chimin_design, Founder</p>
            <div className="ab-cta">
              <Link to="/spaces" className="btn btn-magic">探索空間</Link>
              <Link to="/list-your-space" className="btn btn-pill-outline">店家申請刊登</Link>
            </div>
          </div>
        </section>
      </div>
    </article>
  )
}
