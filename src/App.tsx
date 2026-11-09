import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import About from './pages/About'
import Spaces from './pages/Spaces'
import ListYourSpace from './pages/ListYourSpace'
import MySpaces from './pages/MySpaces'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Admin from './pages/admin/Admin'
import { AssetGuidelines, LegalPlaceholder, ListingTerms } from './pages/Legal'
import NotFound from './pages/NotFound'
import { Community, ComingSoon, Partners, Reviews } from './pages/Extra'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="spaces" element={<Spaces />} />
        <Route path="venues" element={<Navigate to="/spaces?events=1" replace />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="community" element={<Community />} />
        <Route path="partners" element={<Partners />} />
        <Route path="map" element={<ComingSoon title="魔法師地圖" en="Designer Map" text="在地圖上找到附近已授權刊登的工作空間與設計活動。地圖功能開發中，目前可先用「探索空間」依地區搜尋。" to="/spaces" cta="探索空間" />} />
        <Route path="resources" element={<ComingSoon title="創作資源" en="Creative Resources" text="設計工具、素材與學習資源整理，籌備中。" to="/" cta="回首頁" />} />
        <Route path="lounge" element={<ComingSoon title="DDF 即時聊天室" en="DDF Lounge" text="與在地設計師即時交流的會員聊天室，開發中。上線時將採會員登入、私訊僅參與者可讀、可檢舉與封鎖的安全設計。" to="/community" cta="看設計師社群" />} />
        <Route path="list-your-space" element={<ListYourSpace />} />
        <Route path="my-spaces" element={<MySpaces />} />
        <Route path="login" element={<Login />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="admin" element={<Admin />} />
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
