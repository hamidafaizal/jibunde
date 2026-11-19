import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { X } from 'lucide-react';

interface Vocabulary {
    id: string;
    kanji: string | null;
    kana: string;
    meaning_id: string;
}

function getQuestionFontSize(text: string): string {
    const len = text.trim().length;
    if (len <= 2) return 'text-7xl leading-none';
    if (len <= 5) return 'text-5xl leading-tight';
    if (len <= 10) return 'text-4xl leading-snug';
    return 'text-2xl leading-relaxed';
}

export default function KuisPilihanGanda() {
    const { chapterId } = useParams();
    const navigate = useNavigate();

    const [allVocabs, setAllVocabs] = useState<Vocabulary[]>([]);
    const [queue, setQueue] = useState<Vocabulary[]>([]);
    const [options, setOptions] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const hasKanji = (vocab: Vocabulary) => Boolean(vocab.kanji && vocab.kanji.trim().length > 0);

    const getOptionLabel = (vocab: Vocabulary) => {
        if (hasKanji(vocab)) {
            return `${vocab.kana} ~ ${vocab.meaning_id}`;
        }
        return vocab.meaning_id;
    };

    useEffect(() => {
        async function fetchVocab() {
            const { data, error } = await supabase
                .from('vocabularies')
                .select('*')
                .eq('chapter_id', chapterId);

            if (!error && data) {
                setAllVocabs(data);
                setQueue(data);
            }
            setLoading(false);
        }
        fetchVocab();
    }, [chapterId]);

    useEffect(() => {
        if (queue.length > 0 && allVocabs.length > 0) {
            const currentVocab = queue[0];
            const correctLabel = getOptionLabel(currentVocab);

            const wrongLabels = allVocabs
                .filter((v) => v.id !== currentVocab.id)
                .map((v) => getOptionLabel(v))
                .filter((label) => label !== correctLabel);

            const uniqueWrong = Array.from(new Set(wrongLabels))
                .sort(() => 0.5 - Math.random())
                .slice(0, 3);

            const choices = [correctLabel, ...uniqueWrong].sort(() => 0.5 - Math.random());
            setOptions(choices);
        }
    }, [queue, allVocabs]);

    const handleAnswer = (selected: string) => {
        const currentVocab = queue[0];
        const correctLabel = getOptionLabel(currentVocab);
        const isCorrect = selected === correctLabel;

        if (isCorrect) {
            const newQueue = queue.slice(1);
            if (newQueue.length === 0) {
                navigate(`/esai/${chapterId}`);
            } else {
                setQueue(newQueue);
            }
        } else {
            alert(`Salah! Jawaban yang benar adalah: ${correctLabel}. Kata ini akan diulang nanti.`);
            setQueue([...queue.slice(1), currentVocab]);
        }
    };

    if (loading) {
        return (
            <div className="p-6 text-center mt-20 text-slate-400 font-medium animate-pulse">
                Menyiapkan kuis...
            </div>
        );
    }

    if (allVocabs.length === 0) {
        return (
            <div className="p-6 text-center mt-20">
                Data kosakata tidak ditemukan.
            </div>
        );
    }

    const currentVocab = queue[0];
    const isKanjiQuestion = hasKanji(currentVocab);
    const questionText = isKanjiQuestion ? currentVocab.kanji!.trim() : currentVocab.kana;
    const questionFontClass = getQuestionFontSize(questionText);

    return (
        <div className="h-full bg-slate-50 flex flex-col p-6 overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 pt-2 shrink-0 gap-2">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        aria-label="Keluar dari kuis"
                        className="p-2.5 bg-white rounded-full shadow-sm border border-slate-100 hover:bg-slate-100 active:scale-95 transition-all"
                    >
                        <X size={20} className="text-slate-500" />
                    </button>
                    <h2 className="text-lg font-bold text-slate-800">Kuis Pilihan Ganda</h2>
                </div>
                <div className="text-sm font-bold text-blue-600 bg-blue-100 px-4 py-1.5 rounded-full shrink-0">
                    Sisa Soal: {queue.length}
                </div>
            </div>

            {/* Pertanyaan */}
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center mb-6 min-h-[12rem] shrink-0">
                <p className="text-slate-400 text-xs font-bold mb-4 uppercase tracking-widest text-center">
                    {isKanjiQuestion ? 'Bacaan & arti kanji ini?' : 'Arti dari kata ini?'}
                </p>
                <h1 className={`font-black text-slate-800 text-center break-words max-w-full ${questionFontClass}`}>
                    {questionText}
                </h1>
            </div>

            {/* Pilihan Jawaban */}
            <div className="flex flex-col gap-3 pb-6">
                {options.map((option, index) => (
                    <button
                        key={index}
                        onClick={() => handleAnswer(option)}
                        className="w-full bg-white p-4 rounded-2xl shadow-sm border border-slate-200 text-left text-base font-bold text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all active:scale-95 break-words"
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
}