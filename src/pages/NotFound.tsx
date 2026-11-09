import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="container page">
      <h1>找不到這個頁面</h1>
      <p className="lead">網址可能已變更。</p>
      <Link className="btn btn-primary" to="/">回首頁</Link>
    </div>
  )
}
