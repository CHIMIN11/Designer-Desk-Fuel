import { Route, Routes } from 'react-router-dom'
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

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="spaces" element={<Spaces />} />
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
