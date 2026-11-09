import { asset } from '../lib/asset'
import { Link } from 'react-router-dom'

export default function About() {
  return (
    <div className="about">
      <section className="about-hero">
        <div className="container">
          <p className="eyebrow">ABOUT DESIGNER DESK FUEL</p>
          <h1 className="serif">關於 Designer Desk Fuel（DDF）</h1>
          <p className="about-motto">WORK. CREATE. CONNECT. REFUEL.</p>
        </div>
      </section>

      <section className="container about-body">
        <img src={asset('/logo-full.png')} alt="DDF Designer Desk Fuel" className="about-logo" />
        <div>
          <h2 className="serif">
            設計師的工作<span className="dot">・</span><span className="underline">創意據點</span>
          </h2>
          <p>身為科技業設計師，經常在台北與桃園尋找適合工作的空間。卻總遇到插座不足、筆電電力告急、限時使用，或環境吵雜而無法專心創作的困境。</p>
          <p>我相信，設計師需要的不只是一張桌子，而是一個能自由工作、激發靈感、交流想法的創作基地。</p>
          <p className="ribbon">因此，我們打造 DDF。</p>
          <p>一個串連工作空間、設計人才與創意社群的據點，讓每位設計師都能找到自己的創作節奏，遇見志同道合的夥伴，讓創意不受空間限制，發揮更大的魔力。</p>
          <p className="about-tagline">Find Your Space. Fuel Your Magic.</p>
          <div className="actions" style={{ marginTop: 28 }}>
            <Link to="/spaces" className="btn btn-primary">探索空間</Link>
            <Link to="/list-your-space" className="btn btn-ghost">店家申請刊登</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
