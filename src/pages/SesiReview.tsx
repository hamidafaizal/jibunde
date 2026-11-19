import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Clock, Send, CheckCircle2, XCircle, ArrowRight, X } from 'lucide-react';

interface VocabItem {
    id: string;
    kanji: string | null;
    kana: string;
    romaji: string;
    meaning_id: string;
}

interface ReviewQueueItem {
    status: string;
    last_reviewed_at: string;
    vocabularies: VocabItem;
}

interface ReviewFeedback {
    isCorrect: boolean;
    newStatus: string;
    timeSpent: number;
    vocab: VocabItem;
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

function checkReviewAnswer(input: string, vocab: { romaji?: string; kana?: string }): boolean {
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

function getPromptFontSize(text: string): string {
    const len = text.trim().length;
    if (len <= 2) return 'text-7xl leading-none';
    if (len <= 5) return 'text-5xl leading-tight';
    if (len <= 10) return 'text-3xl leading-snug';
    if (len <= 18) return 'text-2xl leading-relaxed';
    return 'text-xl leading-relaxed';
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

export default function SesiReview() {
    const { waktu } = useParams();
    const navigate = useNavigate();

    const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [inputText, setInputText] = useState('');
    const [isFinished, setIsFinished] = useState(false);
    const [feedback, setFeedback] = useState<ReviewFeedback | null>(null);

    const startTimeRef = useRef<number>(0);
    const nextBtnRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        async function fetchReviewData() {
            setLoading(true);
            setIsFinished(false);
            setFeedback(null);
            setInputText('');

            const { data, error } = await supabase
                .from('user_progress')
                .select('status, last_reviewed_at, vocabularies(id, kanji, kana, romaji, meaning_id)')
                .order('last_reviewed_at', { ascending: false });

            if (!error && data) {
                const latestProgress = new Map<string, ReviewQueueItem>();
                data.forEach((item: any) => {
                    if (item.vocabularies && !latestProgress.has(item.vocabularies.id)) {
                        latestProgress.set(item.vocabularies.id, item as ReviewQueueItem);
                    }
                });

                let filtered: ReviewQueueItem[] = [];
                latestProgress.forEach((item) => {
                    if ((waktu === 'pagi' || waktu === 'siang') && item.status === 'Salah') {
                        filtered.push(item);
                    } else if (waktu === 'sore' && (item.status === 'Lambat' || item.status === 'Sangat Lambat')) {
                        filtered.push(item);
                    } else if (waktu === 'malam' && item.status === 'Cepat') {
                        filtered.push(item);
                    }
                });

                filtered = filtered.sort(() => 0.5 - Math.random()).slice(0, 20);

                setQueue(filtered);
                if (filtered.length > 0) {
                    startTimeRef.current = Date.now();
                }
            }
            setLoading(false);
        }
        fetchReviewData();
    }, [waktu]);

    useEffect(() => {
        if (feedback) {
            nextBtnRef.current?.focus();
        }
    }, [feedback]);

    const hasKanji = (vocab: VocabItem) => Boolean(vocab.kanji && vocab.kanji.trim().length > 0);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() || feedback || queue.length === 0) return;

        const currentItem = queue[0];
        const currentVocab = currentItem.vocabularies;
        const endTime = Date.now();
        const timeSpent = (endTime - startTimeRef.current) / 1000;
        const wasKanji = hasKanji(currentVocab);

        const isCorrect = checkReviewAnswer(inputText, currentVocab);

        const { fastLimit, slowLimit } = getTimeThresholds(currentVocab);

        // LOGIKA OPSI B: KENAIKAN BERTAHAP
        let newStatus = 'Salah';
        if (isCorrect) {
            if (timeSpent <= fastLimit) {
                if (currentItem.status === 'Salah' || currentItem.status === 'Sangat Lambat') {
                    newStatus = 'Lambat';
                } else {
                    newStatus = 'Cepat';
                }
            } else if (timeSpent <= slowLimit) {
                newStatus = 'Lambat';
            } else {
                newStatus = 'Sangat Lambat';
            }
        }

        supabase
            .from('user_progress')
            .insert([{ vocabulary_id: currentVocab.id, status: newStatus }])
            .then();

        setFeedback({
            isCorrect,
            newStatus,
            timeSpent,
            vocab: currentVocab,
            wasKanji,
        });
    };

    const handleContinue = () => {
        if (!feedback) return;

        setFeedback(null);
        setInputText('');

        const newQueue = queue.slice(1);
        if (newQueue.length === 0) {
            setIsFinished(true);
        } else {
            setQueue(newQueue);
            startTimeRef.current = Date.now();
        }
    };

    if (loading) {
        return (
            <div className="p-6 text-center mt-20 text-slate-400 font-medium animate-pulse">
                Menyiapkan memori...
            </div>
        );
    }

    if (queue.length === 0 && !isFinished) {
        return (
            <div className="p-6 text-center mt-20">
                Tidak ada kosakata untuk sesi ini.
            </div>
        );
    }

    if (isFinished) {
        return (
            <div className="h-full bg-slate-50 flex flex-col p-6 overflow-y-auto items-center justify-center">
                <CheckCircle2 size={80} className="text-green-500 mb-6" />
                <h2 className="text-3xl font-black text-slate-800 mb-2">Sesi Selesai!</h2>
                <p className="text-slate-500 mb-8 text-center">Memori jangka panjangmu semakin kuat.</p>
                <button
                    onClick={() => navigate('/review')}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 active:scale-95 transition-all"
                >
                    Kembali ke Jadwal
                </button>
            </div>
        );
    }

    const currentVocab = queue[0].vocabularies;
    const promptText = hasKanji(currentVocab) ? currentVocab.kanji!.trim() : currentVocab.kana;
    const promptFontClass = getPromptFontSize(promptText);
    const isLastRemaining = queue.length === 1;

    return (
        <div className="h-full bg-slate-50 flex flex-col p-6 overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 pt-2 shrink-0 gap-2">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/review')}
                        aria-label="Keluar dari sesi review"
                        className="p-2.5 bg-white rounded-full shadow-sm border border-slate-100 hover:bg-slate-100 active:scale-95 transition-all"
                    >
                        <X size={20} className="text-slate-500" />
                    </button>
                    <h2 className="text-lg font-bold text-slate-800 capitalize">Sesi {waktu}</h2>
                </div>
                <div className="flex items-center text-sm font-bold text-blue-600 bg-blue-100 px-4 py-1.5 rounded-full shrink-0">
                    <Clock size={16} className="mr-1.5" />
                    Sisa: {queue.length}
                </div>
            </div>

            {/* Soal: Hanya Kanji / Hiragana dengan ukuran dinamis */}
            <div className="flex-1 flex flex-col justify-center items-center my-4 min-h-[10rem] px-2">
                <p className="text-slate-400 text-xs font-bold mb-4 uppercase tracking-widest text-center">
                    Apa romajinya?
                </p>
                <h1 className={`font-black text-slate-800 text-center break-words max-w-full ${promptFontClass}`}>
                    {promptText}
                </h1>
            </div>

            {/* Umpan balik setelah menjawab */}
            {feedback ? (
                <div
                    className={`p-5 rounded-3xl border mb-4 shadow-sm shrink-0 ${feedback.isCorrect
                        ? 'bg-emerald-50/90 border-emerald-200'
                        : 'bg-rose-50/90 border-rose-200'
                        }`}
                >
                    <div className="flex items-center gap-2 mb-3">
                        {feedback.isCorrect ? (
                            <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                        ) : (
                            <XCircle size={22} className="text-rose-600 shrink-0" />
                        )}
                        <span
                            className={`font-extrabold text-sm ${feedback.isCorrect ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                        >
                            {feedback.isCorrect
                                ? `Benar! (${feedback.newStatus} • ${feedback.timeSpent.toFixed(1)}s)`
                                : "Salah! Status turun menjadi 'Salah'"}
                        </span>
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
                        <span>{isLastRemaining ? 'Selesaikan Sesi' : 'Lanjut'}</span>
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
                            placeholder="Ketik romaji..."
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