import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Clock, Send, CheckCircle2, XCircle, ArrowRight, X } from 'lucide-react';

interface Vocabulary {
    id: string;
    kanji: string | null;
    kana: string;
    romaji: string;
    meaning_id: string;
}

interface TestResult {
    vocab: Vocabulary;
    timeSpent: number;
    status: 'Cepat' | 'Lambat' | 'Sangat Lambat' | 'Salah';
}

interface FeedbackState {
    isCorrect: boolean;
    status: TestResult['status'];
    timeSpent: number;
    vocab: Vocabulary;
    wasKanji: boolean;
}

function normalizeSpaces(text: string): string {
    return text.replace(/[\s\u3000]+/g, '').trim();
}

function toCanonicalRomaji(text: string): string {
    return normalizeSpaces(text)
        .toLowerCase()
        .replace(/a-/g, 'aa')
        .replace(/i-/g, 'ii')
        .replace(/u-/g, 'uu')
        .replace(/e-/g, 'ee')
        .replace(/o-/g, 'oo')
        .replace(/-/g, '');
}

function collapseLongVowels(text: string): string {
    return text
        .replace(/aa+/g, 'a')
        .replace(/ii+/g, 'i')
        .replace(/uu+/g, 'u')
        .replace(/ee+/g, 'e')
        .replace(/oo+/g, 'o');
}

function getRomajiComparisonKeys(romaji: string): Set<string> {
    const keys = new Set<string>();
    const canonical = toCanonicalRomaji(romaji);
    if (!canonical) return keys;

    const shortVowelForm = collapseLongVowels(canonical);
    const candidates = [canonical, shortVowelForm];

    for (const item of candidates) {
        keys.add(item);
        keys.add(item.replace(/ha/g, 'wa'));
        keys.add(item.replace(/wa/g, 'ha'));
    }

    return keys;
}

function checkEssayAnswer(input: string, vocab: Vocabulary): boolean {
    const trimmedRaw = input.trim();
    if (!trimmedRaw) return false;

    const canonicalInput = toCanonicalRomaji(trimmedRaw);
    const shortInput = collapseLongVowels(canonicalInput);
    const targetKeys = getRomajiComparisonKeys(vocab.romaji || '');

    if (targetKeys.has(canonicalInput) || targetKeys.has(shortInput)) {
        return true;
    }

    const normalizedKanaInput = normalizeSpaces(trimmedRaw);
    const normalizedKanaTarget = normalizeSpaces(vocab.kana || '');
    return normalizedKanaTarget.length > 0 && normalizedKanaInput === normalizedKanaTarget;
}

function shuffleArray<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function getPromptFontSize(text: string): string {
    const len = text.trim().length;
    if (len <= 2) return 'text-8xl leading-none';
    if (len <= 5) return 'text-6xl leading-tight';
    if (len <= 10) return 'text-4xl leading-snug';
    return 'text-2xl leading-relaxed';
}

const COMPLETED_CHAPTERS_KEY = 'minnamaster_completed_chapters';

function markChapterCompleted(chapterId?: string) {
    if (!chapterId) return;
    try {
        const raw = localStorage.getItem(COMPLETED_CHAPTERS_KEY);
        const parsed: string[] = raw ? JSON.parse(raw) : [];
        if (!parsed.includes(chapterId)) {
            localStorage.setItem(COMPLETED_CHAPTERS_KEY, JSON.stringify([...parsed, chapterId]));
        }
    } catch {
        // Abaikan jika penyimpanan lokal tidak tersedia
    }
}

function getTimeThresholds(vocab: { romaji?: string; kana?: string }): {
    fastLimit: number;
    slowLimit: number;
} {
    const referenceText = normalizeSpaces(vocab.romaji || '') || normalizeSpaces(vocab.kana || '');
    const extraChars = Math.max(0, referenceText.length - 8);
    const bonusSeconds = Math.min(8, extraChars * 0.3);

    return {
        fastLimit: 6 + bonusSeconds,
        slowLimit: 12 + bonusSeconds,
    };
}

export default function TesEsai() {
    const { chapterId } = useParams();
    const navigate = useNavigate();

    const [queue, setQueue] = useState<Vocabulary[]>([]);
    const [loading, setLoading] = useState(true);
    const [inputText, setInputText] = useState('');
    const [results, setResults] = useState<TestResult[]>([]);
    const [isFinished, setIsFinished] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackState | null>(null);

    const startTimeRef = useRef<number>(0);
    const nextBtnRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        async function fetchVocab() {
            setLoading(true);
            setIsFinished(false);
            setFeedback(null);
            setResults([]);
            setInputText('');

            const { data, error } = await supabase
                .from('vocabularies')
                .select('*')
                .eq('chapter_id', chapterId);

            if (!error && data) {
                setQueue(shuffleArray(data));
                startTimeRef.current = Date.now();
            } else {
                setQueue([]);
            }
            setLoading(false);
        }
        fetchVocab();
    }, [chapterId]);

    useEffect(() => {
        if (feedback) {
            nextBtnRef.current?.focus();
        }
    }, [feedback]);

    const hasKanji = (vocab: Vocabulary) => Boolean(vocab.kanji && vocab.kanji.trim().length > 0);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() || feedback || queue.length === 0) return;

        const currentVocab = queue[0];
        const endTime = Date.now();
        const timeSpent = (endTime - startTimeRef.current) / 1000;
        const wasKanji = hasKanji(currentVocab);

        const isCorrect = checkEssayAnswer(inputText, currentVocab);

        const { fastLimit, slowLimit } = getTimeThresholds(currentVocab);

        let status: TestResult['status'] = 'Salah';
        if (isCorrect) {
            if (timeSpent <= fastLimit) status = 'Cepat';
            else if (timeSpent <= slowLimit) status = 'Lambat';
            else status = 'Sangat Lambat';

            setResults((prev) => {
                const existingIndex = prev.findIndex((r) => r.vocab.id === currentVocab.id);
                if (existingIndex >= 0) return prev;
                return [...prev, { vocab: currentVocab, timeSpent, status }];
            });

            supabase
                .from('user_progress')
                .insert([{ vocabulary_id: currentVocab.id, status }])
                .then(({ error }) => {
                    if (error) console.error('Gagal menyimpan progres:', error);
                });
        } else {
            supabase
                .from('user_progress')
                .insert([{ vocabulary_id: currentVocab.id, status: 'Salah' }])
                .then();
        }

        setFeedback({
            isCorrect,
            status,
            timeSpent,
            vocab: currentVocab,
            wasKanji,
        });
    };

    const handleContinue = () => {
        if (!feedback) return;

        const currentVocab = queue[0];
        const wasCorrect = feedback.isCorrect;

        setFeedback(null);
        setInputText('');

        if (wasCorrect) {
            const newQueue = queue.slice(1);
            if (newQueue.length === 0) {
                markChapterCompleted(chapterId);
                setIsFinished(true);
            } else {
                setQueue(newQueue);
                startTimeRef.current = Date.now();
            }
        } else {
            setQueue([...queue.slice(1), currentVocab]);
            startTimeRef.current = Date.now();
        }
    };

    if (loading) {
        return (
            <div className="p-6 text-center mt-20 text-slate-400 font-medium animate-pulse">
                Menyiapkan Tes Esai...
            </div>
        );
    }

    if (isFinished) {
        return (
            <div className="h-full bg-slate-50 flex flex-col p-6 overflow-y-auto">
                <div className="text-center mt-6 mb-6">
                    <CheckCircle2 size={64} className="mx-auto text-green-500 mb-3" />
                    <h2 className="text-3xl font-black text-slate-800">Lulus Bab Ini!</h2>
                    <p className="text-slate-500 mt-1 text-sm">Semua kosakata berhasil dihafal.</p>
                </div>

                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex-1 overflow-y-auto">
                    <h3 className="font-bold text-slate-800 mb-3 text-sm">Rekap Kecepatan Ingatan:</h3>
                    <div className="space-y-2.5">
                        {results.map((r, i) => (
                            <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl gap-2">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-800 truncate">{r.vocab.kanji || r.vocab.kana}</p>
                                    <p className="text-xs text-slate-400 truncate">{r.vocab.meaning_id}</p>
                                </div>
                                <div
                                    className={`text-xs font-bold px-3 py-1 rounded-full shrink-0 ${r.status === 'Cepat'
                                        ? 'bg-green-100 text-green-700'
                                        : r.status === 'Lambat'
                                            ? 'bg-orange-100 text-orange-700'
                                            : 'bg-red-100 text-red-700'
                                        }`}
                                >
                                    {r.status} ({r.timeSpent.toFixed(1)}s)
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    onClick={() => navigate('/')}
                    className="mt-5 w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 active:scale-95 transition-all shrink-0"
                >
                    Kembali ke Beranda
                </button>
            </div>
        );
    }

    if (queue.length === 0) {
        return (
            <div className="p-6 text-center mt-20">
                Data kosakata tidak ditemukan.
            </div>
        );
    }

    const currentVocab = queue[0];
    const promptText = hasKanji(currentVocab) ? currentVocab.kanji!.trim() : currentVocab.kana;
    const promptFontClass = getPromptFontSize(promptText);
    const isLastRemainingAfterCorrect = feedback?.isCorrect && queue.length === 1;

    return (
        <div className="h-full bg-slate-50 flex flex-col p-6 overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 pt-2 shrink-0 gap-2">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        aria-label="Keluar dari tes esai"
                        className="p-2.5 bg-white rounded-full shadow-sm border border-slate-100 hover:bg-slate-100 active:scale-95 transition-all"
                    >
                        <X size={20} className="text-slate-500" />
                    </button>
                    <h2 className="text-lg font-bold text-slate-800">Tes Esai (Ketik)</h2>
                </div>
                <div className="flex items-center text-sm font-bold text-orange-600 bg-orange-100 px-4 py-1.5 rounded-full shrink-0">
                    <Clock size={16} className="mr-1.5" />
                    Sisa: {queue.length}
                </div>
            </div>

            {/* Soal: Hanya Kanji / Hiragana */}
            <div className="flex-1 flex flex-col justify-center items-center my-4 min-h-[11rem]">
                <p className="text-slate-400 text-xs font-bold mb-5 uppercase tracking-widest text-center">
                    Ketik Romaji dari kata ini:
                </p>
                <h1 className={`font-black text-slate-800 text-center break-words max-w-full ${promptFontClass}`}>
                    {promptText}
                </h1>
            </div>

            {/* Hasil / Pembahasan setelah menjawab */}
            {feedback ? (
                <div
                    className={`p-5 rounded-3xl border mb-4 shadow-sm shrink-0 ${feedback.isCorrect
                        ? 'bg-emerald-50/90 border-emerald-200'
                        : 'bg-rose-50/90 border-rose-200'
                        }`}
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            {feedback.isCorrect ? (
                                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                            ) : (
                                <XCircle size={22} className="text-rose-600 shrink-0" />
                            )}
                            <span
                                className={`font-extrabold text-base ${feedback.isCorrect ? 'text-emerald-700' : 'text-rose-700'
                                    }`}
                            >
                                {feedback.isCorrect
                                    ? `Benar! (${feedback.status} • ${feedback.timeSpent.toFixed(1)}s)`
                                    : 'Salah! Akan diulang di akhir'}
                            </span>
                        </div>
                    </div>

                    <div className="bg-white/80 rounded-2xl p-3.5 space-y-1.5 text-sm">
                        <div className="flex justify-between gap-2">
                            <span className="text-slate-400 font-medium">Romaji:</span>
                            <span className="font-bold text-slate-800 text-right">{feedback.vocab.romaji || '-'}</span>
                        </div>

                        {feedback.wasKanji && (
                            <div className="flex justify-between gap-2">
                                <span className="text-slate-400 font-medium">Bacaan:</span>
                                <span className="font-bold text-blue-600 text-right">{feedback.vocab.kana}</span>
                            </div>
                        )}

                        <div className="flex justify-between gap-2">
                            <span className="text-slate-400 font-medium shrink-0">Arti:</span>
                            <span className="font-bold text-slate-800 text-right">{feedback.vocab.meaning_id}</span>
                        </div>
                    </div>

                    <button
                        ref={nextBtnRef}
                        type="button"
                        onClick={handleContinue}
                        className={`mt-4 w-full py-3.5 px-5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 ${feedback.isCorrect
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-slate-800 hover:bg-slate-900'
                            }`}
                    >
                        <span>{isLastRemainingAfterCorrect ? 'Lihat Rekap' : 'Lanjut'}</span>
                        <ArrowRight size={18} />
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="mt-auto pb-4 shrink-0">
                    <div className="relative">
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Ketik romaji (cth: watashi)..."
                            className="w-full bg-white border-2 border-slate-200 p-4 pr-16 rounded-2xl text-lg font-bold text-slate-800 focus:border-blue-600 focus:outline-none transition-colors shadow-sm"
                            autoFocus
                            autoComplete="off"
                        />
                        <button
                            type="submit"
                            className="absolute right-2.5 top-2.5 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}