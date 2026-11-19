import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Flame, PlayCircle, CheckCircle2 } from 'lucide-react';

interface Chapter {
    id: string;
    book_name: string;
    chapter_number: number;
    title_jp: string;
    title_id: string;
}

interface VocabChapterMap {
    id: string;
    chapter_id: string;
}

interface ProgressRow {
    vocabulary_id: string;
    status: string;
    last_reviewed_at: string;
}

const MASTERED_STATUSES = new Set(['Cepat', 'Lambat', 'Sangat Lambat']);
const COMPLETED_CHAPTERS_KEY = 'minnamaster_completed_chapters';

function getCompletedChapterIds(): Set<string> {
    try {
        const raw = localStorage.getItem(COMPLETED_CHAPTERS_KEY);
        const parsed: string[] = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
        return new Set();
    }
}

export default function Belajar() {
    const navigate = useNavigate();
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [progressByChapter, setProgressByChapter] = useState<Record<string, number>>({});
    const [completedChapters, setCompletedChapters] = useState<Set<string>>(() =>
        getCompletedChapterIds()
    );
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setCompletedChapters(getCompletedChapterIds());

        async function fetchData() {
            setLoading(true);

            const [chaptersRes, vocabsRes, progressRes] = await Promise.all([
                supabase.from('chapters').select('*').order('chapter_number', { ascending: true }),
                supabase.from('vocabularies').select('id, chapter_id'),
                supabase
                    .from('user_progress')
                    .select('vocabulary_id, status, last_reviewed_at')
                    .order('last_reviewed_at', { ascending: false }),
            ]);

            if (!chaptersRes.error && chaptersRes.data) {
                const chapterList = chaptersRes.data as Chapter[];
                setChapters(chapterList);

                const latestStatusByVocab = new Map<string, string>();
                if (!progressRes.error && progressRes.data) {
                    (progressRes.data as ProgressRow[]).forEach((row) => {
                        if (!latestStatusByVocab.has(row.vocabulary_id)) {
                            latestStatusByVocab.set(row.vocabulary_id, row.status);
                        }
                    });
                }

                const totalByChapter = new Map<string, number>();
                const masteredByChapter = new Map<string, number>();

                if (!vocabsRes.error && vocabsRes.data) {
                    (vocabsRes.data as VocabChapterMap[]).forEach((vocab) => {
                        totalByChapter.set(vocab.chapter_id, (totalByChapter.get(vocab.chapter_id) || 0) + 1);
                        const latestStatus = latestStatusByVocab.get(vocab.id);
                        if (latestStatus && MASTERED_STATUSES.has(latestStatus)) {
                            masteredByChapter.set(
                                vocab.chapter_id,
                                (masteredByChapter.get(vocab.chapter_id) || 0) + 1
                            );
                        }
                    });
                }

                const computed: Record<string, number> = {};
                const autoCompleted = getCompletedChapterIds();
                chapterList.forEach((ch) => {
                    const total = totalByChapter.get(ch.id) || 0;
                    const mastered = masteredByChapter.get(ch.id) || 0;
                    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
                    computed[ch.id] = pct;
                    if (total > 0 && pct === 100) {
                        autoCompleted.add(ch.id);
                    }
                });
                setProgressByChapter(computed);
                setCompletedChapters(autoCompleted);
            }

            setLoading(false);
        }

        fetchData();
    }, []);

    return (
        <div className="min-h-full">
            {/* Header Persisten (Sticky di atas dengan efek blur halus) */}
            <div className="sticky top-0 z-30 bg-slate-50/90 backdrop-blur-md px-6 pt-6 pb-4 border-b border-slate-200/60 flex justify-between items-center">
                <div>
                    <p className="text-slate-500 text-xs font-medium">Konnichiwa,</p>
                    <h2 className="text-xl font-bold text-slate-800 tracking-tight">Pelajar Super!</h2>
                </div>
                <div className="bg-orange-100 px-3 py-1.5 rounded-full flex items-center shadow-sm">
                    <Flame size={16} className="text-orange-500 fill-orange-500 mr-1.5" />
                    <span className="text-orange-700 font-bold text-xs">3 Hari</span>
                </div>
            </div>

            {/* Konten Daftar Bab */}
            <div className="p-6 pt-5">
                <h3 className="text-base font-bold text-slate-800 mb-4">Materi Minna no Nihongo</h3>

                {loading ? (
                    <div className="flex justify-center items-center h-32">
                        <p className="text-slate-500 animate-pulse font-medium">Memuat bab...</p>
                    </div>
                ) : (
                    <div className="grid gap-5">
                        {chapters.map((chapter) => {
                            const pct = progressByChapter[chapter.id] ?? 0;
                            const isCompleted = completedChapters.has(chapter.id);

                            return (
                                <div
                                    key={chapter.id}
                                    className="bg-white p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative overflow-hidden group"
                                >
                                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"></div>

                                    <div className="relative z-10">
                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                            <p className="text-[11px] text-blue-600 font-bold tracking-widest uppercase">
                                                Bab {chapter.chapter_number}
                                            </p>
                                            {isCompleted && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                                                    <CheckCircle2 size={12} />
                                                    Tuntas
                                                </span>
                                            )}
                                        </div>

                                        <h4 className="text-xl font-extrabold text-slate-800 mb-1">
                                            {chapter.title_jp}
                                        </h4>
                                        <p className="text-sm text-slate-500 font-medium mb-5">
                                            {chapter.title_id}
                                        </p>

                                        <div className="flex items-center justify-between mt-2 gap-3">
                                            <div className="w-1/2">
                                                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                                                    <span>PROGRES</span>
                                                    <span className="text-blue-600">{pct}%</span>
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                                        style={{ width: `${pct}%` }}
                                                    ></div>
                                                </div>
                                            </div>

                                            {!isCompleted ? (
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/belajar/${chapter.id}`)}
                                                    className="bg-blue-600 text-white p-2.5 rounded-full hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all active:scale-95 shrink-0"
                                                >
                                                    <PlayCircle size={22} className="fill-white text-blue-600" />
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/belajar/${chapter.id}`)}
                                                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
                                                    >
                                                        Kartu
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/kuis/${chapter.id}`)}
                                                        className="px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors"
                                                    >
                                                        PG
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/esai/${chapter.id}`)}
                                                        className="px-2.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                                                    >
                                                        Esai
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}