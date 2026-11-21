import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Clock, Send, CheckCircle2, XCircle, ArrowRight, X } from 'lucide-react';

interface Vocabulary {
    id: string;
    chapter_id: string;
    kanji: string | null;
    kana: string;
    romaji: string;
    meaning_id: string;
}

interface TestResult {
    vocab: Vocabulary;
    status: 'Cepat' | 'Lambat' | 'Sangat Lambat' | 'Salah';
    timeSpent: number;
}

interface EssayFeedback {
    isCorrect: boolean;
    status: TestResult['status'];
    timeSpent: number;
    vocab: Vocabulary;
    wasKanji: boolean;
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
    if (len <= 18) return 'text-3xl leading-snug';
    return 'text-2xl leading-relaxed';
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

function normalizeMeaningText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[（(][^）)]*[）)]/g, ' ')
        .replace(/[~〜]/g, ' ')
        .replace(/-/g, ' ')
        .replace(/[.,\/#!$%\^&\*;:{}=_`~()\[\]?"']/g, ' ')
        .replace(/[\s\u3000]+/g, ' ')
        .trim();
}

function checkMeaningAnswer(input: string, meaningId: string): boolean {
    const normalizedInput = normalizeMeaningText(input);
    if (!normalizedInput) return false;

    const fullTarget = normalizeMeaningText(meaningId);
    if (!fullTarget) return false;

    if (normalizedInput === fullTarget) return true;

    const parts = meaningId
        .split(/[;,\/]|\batau\b/i)
        .map((part) => normalizeMeaningText(part))
        .filter(Boolean);

    return parts.some((part) => part === normalizedInput);
}

function checkEssayAnswer(input: string, vocab: Vocabulary): boolean {
    const trimmedRaw = input.trim();
    if (!trimmedRaw) return false;

    const itemHasKanji = Boolean(vocab.kanji && vocab.kanji.trim().length > 0);

    if (itemHasKanji) {
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

    return checkMeaningAnswer(trimmedRaw, vocab.meaning_id || '');
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
    const [feedback, setFeedback] = useState<EssayFeedback | null>(null);

    const startTimeRef = useRef<number>(0);
    const nextBtnRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        async function fetchVocab() {
            setLoading(true);
            setIsFinished(false);
            setResults([]);
            setFeedback(null);
            setInputText('');

            const { data, error } = await supabase
                .from('vocabularies')
                .select('*')
                .eq('chapter_id', chapterId);

            if (!error && data) {
                setQueue(shuffleArray(data as Vocabulary[]));
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
        }

        supabase
            .from('user_progress')
            .insert([{ vocabulary_id: currentVocab.id, status }])
            .then();

        setResults((prev) => [...prev, { vocab: currentVocab, status, timeSpent }]);
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
                Menyiapkan soal esai...
            </div>
        );
    }

    if (isFinished) {
        const fastCount = results.filter((r) => r.status === 'Cepat').length;
        const slowCount = results.filter((r) => r.status === 'Lambat' || r.status === 'Sangat Lambat').length;

        return (
            <div className="h-full bg-slate-50 flex flex-col p-6 overflow-y-auto">
                <div className="text-center my-8">
                    <CheckCircle2 size={72} className="text-emerald-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-black text-slate-800">Lulus Bab Ini!</h2>
                    <p className="text-slate-500 text-sm mt-1">Semua kosakata berhasil diketik dengan tepat.</p>
                </div>

                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 mb-6 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 font-medium">Ingatan Cepat</span>
                        <span className="font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                            {fastCount} kata
                        </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 font-medium">Perlu Review (Lambat)</span>
                        <span className="font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                            {slowCount} kata
                        </span>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="mt-auto w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 active:scale-95 transition-all"
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
    const currentHasKanji = hasKanji(currentVocab);
    const promptText = currentHasKanji ? currentVocab.kanji!.trim() : currentVocab.kana;
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

            {/* Soal */}
            <div className="flex-1 flex flex-col justify-center items-center my-4 min-h-[10rem] px-2">
                <p className="text-slate-400 text-xs font-bold mb-4 uppercase tracking-widest text-center">
                    {currentHasKanji ? 'Ketik bacaan (hiragana / romaji):' : 'Ketik arti bahasa Indonesia:'}
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
                                ? `Benar! (${feedback.status} • ${feedback.timeSpent.toFixed(1)}s)`
                                : 'Salah! Akan diulang di akhir'}
                        </span>
                    </div>

                    <div className="bg-white/80 rounded-2xl p-3.5 space-y-1.5 text-sm">
                        {feedback.wasKanji ? (
                            <>
                                <div className="flex justify-between gap-2">
                                    <span className="text-slate-400 font-medium">Bacaan:</span>
                                    <span className="font-bold text-blue-600 text-right">{feedback.vocab.kana}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-slate-400 font-medium">Romaji:</span>
                                    <span className="font-bold text-slate-800 text-right">{feedback.vocab.romaji || '-'}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-slate-400 font-medium shrink-0">Arti:</span>
                                    <span className="font-bold text-slate-800 text-right">{feedback.vocab.meaning_id}</span>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex justify-between gap-2">
                                    <span className="text-slate-400 font-medium shrink-0">Arti:</span>
                                    <span className="font-bold text-emerald-700 text-right">{feedback.vocab.meaning_id}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-slate-400 font-medium">Romaji:</span>
                                    <span className="font-bold text-slate-800 text-right">{feedback.vocab.romaji || '-'}</span>
                                </div>
                            </>
                        )}
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
                        <span>{isLastRemainingAfterCorrect ? 'Selesaikan Bab' : 'Lanjut'}</span>
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
                            placeholder={
                                currentHasKanji
                                    ? 'Ketik hiragana atau romaji...'
                                    : 'Ketik arti bahasa Indonesia...'
                            }
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