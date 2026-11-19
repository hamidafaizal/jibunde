import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Sun, CloudSun, Sunset, Moon, PlayCircle } from 'lucide-react';

export default function Review() {
    const [counts, setCounts] = useState({ pagi: 0, siang: 0, sore: 0, malam: 0 });
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        async function fetchProgress() {
            // Menarik semua data progres dari Supabase, diurutkan dari yang paling baru
            const { data, error } = await supabase
                .from('user_progress')
                .select('vocabulary_id, status, last_reviewed_at')
                .order('last_reviewed_at', { ascending: false });

            if (!error && data) {
                // Menyaring data agar kita hanya mengambil status TERBARU dari tiap kata
                const latestProgress = new Map();
                data.forEach((item) => {
                    if (!latestProgress.has(item.vocabulary_id)) {
                        latestProgress.set(item.vocabulary_id, item.status);
                    }
                });

                // Menghitung jumlah kata untuk masing-masing kategori
                let salah = 0, lambat = 0, cepat = 0;

                latestProgress.forEach((status) => {
                    if (status === 'Salah') salah++;
                    else if (status === 'Lambat' || status === 'Sangat Lambat') lambat++;
                    else if (status === 'Cepat') cepat++;
                });

                // Menerapkan aturan: Maksimal 20 kata per sesi
                setCounts({
                    pagi: Math.min(salah, 20),
                    siang: Math.min(salah, 20),
                    sore: Math.min(lambat, 20),
                    malam: Math.min(cepat, 20)
                });
            }
            setLoading(false);
        }

        fetchProgress();
    }, []);

    // Data desain untuk 4 sesi waktu
    const sessions = [
        { id: 'pagi', name: 'Sesi Pagi', time: '06:00 - 10:00', desc: 'Fokus kosakata salah', icon: <Sun size={32} className="text-amber-500" />, color: 'bg-amber-50', count: counts.pagi },
        { id: 'siang', name: 'Sesi Siang', time: '11:00 - 14:00', desc: 'Ulangi kosakata salah', icon: <CloudSun size={32} className="text-sky-500" />, color: 'bg-sky-50', count: counts.siang },
        { id: 'sore', name: 'Sesi Sore', time: '15:00 - 18:00', desc: 'Review kosakata lambat', icon: <Sunset size={32} className="text-orange-500" />, color: 'bg-orange-50', count: counts.sore },
        { id: 'malam', name: 'Sesi Malam', time: '19:00 - 22:00', desc: 'Rolling kosakata cepat', icon: <Moon size={32} className="text-indigo-500" />, color: 'bg-indigo-50', count: counts.malam },
    ];

    return (
        <div className="p-6">
            <div className="mb-8">
                <p className="text-slate-500 text-sm font-medium">Algoritma Spaced Repetition</p>
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Review Harian</h2>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-32">
                    <p className="text-slate-500 animate-pulse font-medium">Memuat jadwal...</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {sessions.map((session) => (
                        <div key={session.id} className={`p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center relative overflow-hidden ${session.color}`}>
                            {/* Ikon Besar */}
                            <div className="mr-4 bg-white p-3 rounded-2xl shadow-sm">
                                {session.icon}
                            </div>

                            <div className="flex-1">
                                <h3 className="text-lg font-extrabold text-slate-800">{session.name}</h3>
                                <p className="text-xs font-bold text-slate-500 mb-1">{session.time}</p>
                                <p className="text-xs text-slate-500">{session.desc}</p>
                            </div>

                            {/* Tombol & Status */}
                            <div className="flex flex-col items-end">
                                <span className={`text-sm font-black mb-2 ${session.count > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                                    {session.count}/20 Kata
                                </span>
                                <button
                                    disabled={session.count === 0}
                                    onClick={() => navigate(`/review-sesi/${session.id}`)}
                                    className={`p-2.5 rounded-full transition-all ${session.count > 0
                                        ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-md shadow-blue-200'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                        }`}
                                >
                                    <PlayCircle size={24} className={session.count > 0 ? 'fill-white text-blue-600' : ''} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}