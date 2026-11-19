import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Volume2, ArrowRight, ArrowLeft, X } from 'lucide-react';

interface Vocabulary {
    id: string;
    kanji: string | null;
    kana: string;
    romaji: string;
    meaning_id: string;
}

// Menyesuaikan ukuran font sisi depan berdasarkan panjang teks agar tidak bertabrakan
function getDisplayFontSize(text: string): string {
    const len = text.trim().length;
    if (len <= 2) return 'text-8xl leading-none';
    if (len <= 5) return 'text-5xl leading-tight';
    if (len <= 10) return 'text-4xl leading-snug';
    if (len <= 18) return 'text-2xl leading-relaxed';
    return 'text-xl leading-relaxed';
}

export default function ModulBelajar() {
    const { chapterId } = useParams();
    const navigate = useNavigate();
    const [vocabularies, setVocabularies] = useState<Vocabulary[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchVocab() {
            const { data, error } = await supabase
                .from('vocabularies')
                .select('*')
                .eq('chapter_id', chapterId);

            if (!error && data) {
                setVocabularies(data);
            }
            setLoading(false);
        }
        fetchVocab();
    }, [chapterId]);

    const currentVocab = vocabularies[currentIndex];

    const playAudio = (e: React.MouseEvent, text: string) => {
        e.stopPropagation();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        window.speechSynthesis.speak(utterance);
    };

    const handleNext = () => {
        if (currentIndex < vocabularies.length - 1) {
            setIsFlipped(false);
            setTimeout(() => setCurrentIndex(currentIndex + 1), 150);
        } else {
            navigate(`/kuis/${chapterId}`);
        }
    };

    if (loading) {
        return (
            <div className="p-6 text-center mt-20 font-bold text-slate-400 animate-pulse">
                Memuat flashcard...
            </div>
        );
    }

    if (vocabularies.length === 0) {
        return (
            <div className="p-6 text-center mt-20">
                Belum ada kosakata di bab ini.
            </div>
        );
    }

    const frontText = currentVocab.kanji || currentVocab.kana;
    const frontFontClass = getDisplayFontSize(frontText);

    return (
        <div className="absolute inset-0 bg-slate-50 z-50 flex flex-col p-6 pb-28 overflow-y-auto">
            {/* Header navigasi */}
            <div className="flex justify-between items-center mb-6 pt-2">
                <button
                    onClick={() => navigate('/')}
                    className="p-2.5 bg-white rounded-full shadow-sm hover:bg-slate-100"
                >
                    <X size={20} className="text-slate-500" />
                </button>
                <div className="text-sm font-bold text-slate-400 bg-white px-4 py-1.5 rounded-full shadow-sm">
                    {currentIndex + 1} / {vocabularies.length}
                </div>
                <div className="w-10"></div>
            </div>

            {/* Area Flashcard 3D */}
            <div
                className="flex-1 flex flex-col justify-center items-center cursor-pointer min-h-[26rem]"
                style={{ perspective: '1000px' }}
                onClick={() => setIsFlipped(!isFlipped)}
            >
                <div
                    className="w-full h-[26rem] relative transition-transform duration-500 ease-in-out"
                    style={{
                        transformStyle: 'preserve-3d',
                        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    }}
                >
                    {/* Sisi Depan: Kanji / Kana */}
                    <div
                        className="absolute inset-0 w-full h-full bg-white rounded-[2rem] shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-slate-100 flex flex-col items-center justify-between p-6 pt-16 pb-6"
                        style={{ backfaceVisibility: 'hidden' }}
                    >
                        <button
                            onClick={(e) => playAudio(e, frontText)}
                            className="absolute top-5 right-5 p-3 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
                        >
                            <Volume2 size={22} />
                        </button>

                        <div className="flex-1 w-full flex items-center justify-center px-2 overflow-y-auto">
                            <h2
                                className={`font-black text-slate-800 text-center break-words max-w-full ${frontFontClass}`}
                            >
                                {frontText}
                            </h2>
                        </div>

                        <p className="text-slate-400 text-xs font-medium animate-pulse pt-2 shrink-0">
                            Ketuk kartu untuk membalik
                        </p>
                    </div>

                    {/* Sisi Belakang: Cara Baca & Arti */}
                    <div
                        className="absolute inset-0 w-full h-full bg-blue-600 rounded-[2rem] shadow-[0_10px_40px_rgba(37,99,235,0.3)] flex flex-col items-center justify-center p-8 text-white overflow-y-auto"
                        style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                    >
                        <h3 className="text-3xl font-black mb-2 text-center break-words max-w-full">
                            {currentVocab.kana}
                        </h3>
                        <p className="text-blue-200 text-lg font-medium mb-6 tracking-wider text-center break-words">
                            {currentVocab.romaji}
                        </p>
                        <div className="w-16 h-1.5 bg-blue-400/50 rounded-full mb-6 shrink-0"></div>
                        <p className="text-xl font-bold text-center leading-relaxed break-words max-w-full">
                            {currentVocab.meaning_id}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tombol Navigasi Bawah */}
            <div className="mt-6 pt-4 flex justify-between items-center">
                <button
                    onClick={() => {
                        setIsFlipped(false);
                        setTimeout(() => setCurrentIndex(Math.max(0, currentIndex - 1)), 150);
                    }}
                    disabled={currentIndex === 0}
                    className="p-4 rounded-2xl bg-white shadow-sm text-slate-600 disabled:opacity-40"
                >
                    <ArrowLeft size={24} />
                </button>

                <button
                    onClick={handleNext}
                    className="px-8 py-4 rounded-2xl bg-slate-800 text-white font-bold flex items-center shadow-lg shadow-slate-200 hover:bg-slate-900 transition-colors active:scale-95"
                >
                    <span className="text-lg">
                        {currentIndex === vocabularies.length - 1 ? 'Selesai' : 'Lanjut'}
                    </span>
                    <ArrowRight size={22} className="ml-2" />
                </button>
            </div>
        </div>
    );
}