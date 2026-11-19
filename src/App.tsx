import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Belajar from './pages/Belajar';
import Review from './pages/Review';
import Ujian from './pages/Ujian';
import Statistik from './pages/Statistik';
import BottomNav from './components/BottomNav';
import ModulBelajar from './pages/ModulBelajar';
import KuisPilihanGanda from './pages/KuisPilihanGanda';
import TesEsai from './pages/TesEsai';
import SesiReview from './pages/SesiReview';

function AppContent() {
  const location = useLocation();
  const hideBottomNav = ['/belajar', '/kuis', '/esai', '/review-sesi'].some(path =>
    location.pathname.startsWith(path)
  );

  return (
    <div className="w-full max-w-md bg-slate-50 h-screen flex flex-col relative shadow-2xl overflow-hidden mx-auto">
      {/* Area konten yang bisa di-scroll secara mandiri */}
      <div className={`flex-1 overflow-y-auto ${!hideBottomNav ? 'pb-24' : ''}`}>
        <Routes>
          <Route path="/" element={<Belajar />} />
          <Route path="/review" element={<Review />} />
          <Route path="/ujian" element={<Ujian />} />
          <Route path="/statistik" element={<Statistik />} />
          <Route path="/belajar/:chapterId" element={<ModulBelajar />} />
          <Route path="/kuis/:chapterId" element={<KuisPilihanGanda />} />
          <Route path="/esai/:chapterId" element={<TesEsai />} />
          <Route path="/review-sesi/:waktu" element={<SesiReview />} />
        </Routes>
      </div>

      {!hideBottomNav && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="h-screen bg-slate-100 flex justify-center font-sans overflow-hidden">
        <AppContent />
      </div>
    </BrowserRouter>
  );
}