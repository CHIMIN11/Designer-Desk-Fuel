import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import About from './pages/About'
import Spaces from './pages/Spaces'
import ListYourSpace from './pages/ListYourSpace'
import MySpaces from './pages/MySpaces'
import Account from './pages/Account'
import Lounge from './pages/Lounge'
import Contact from './pages/Contact'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Admin from './pages/admin/Admin'
import AdminShell from './pages/admin/AdminShell'
import { AssetGuidelines, LegalPlaceholder, ListingTerms } from './pages/Legal'
import NotFound from './pages/NotFound'
import { Community, ComingSoon, MapPage, Partners, Reviews } from './pages/Extra'

export default function App() {
  return (
    <Routes>
      <Route path="admin/*" element={<AdminShell><Admin /></AdminShell>} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="spaces" element={<Spaces />} />
        <Route path="venues" element={<Navigate to="/spaces?events=1" replace />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="community" element={<Community />} />
        <Route path="partners" element={<Partners />} />
        <Route path="contact" element={<Contact />} />
        <Route path="map" element={<MapPage />} />
        <Route path="resources" element={<ComingSoon title="創作資源" en="Creative Resources" text="設計工具、素材與學習資源整理，籌備中。" to="/" cta="回首頁" />} />
        <Route path="lounge" element={<Lounge />} />
        <Route path="list-your-space" element={<ListYourSpace />} />
        <Route path="merchant" element={<MySpaces />} />
        <Route path="my-spaces" element={<Navigate to="/merchant" replace />} />
        <Route path="account" element={<Account />} />
        <Route path="login" element={<Login />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="listing-terms" element={<ListingTerms />} />
        <Route path="asset-guidelines" element={<AssetGuidelines />} />
        <Route path="privacy-policy" element={<LegalPlaceholder title="隱私權政策" />} />
        <Route path="terms-of-service" element={<LegalPlaceholder title="服務條款" />} />
        <Route path="community-guidelines" element={<LegalPlaceholder title="社群守則" />} />
        <Route path="cookie-policy" element={<LegalPlaceholder title="Cookie 政策" />} />
        <Route path="data-request" element={<LegalPlaceholder title="個資申請" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
