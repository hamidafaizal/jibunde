import { NavLink } from 'react-router-dom';
import { BookOpen, RefreshCw, PenTool, BarChart3 } from 'lucide-react';

export default function BottomNav() {
    const navItems = [
        { path: '/', label: 'Belajar', icon: <BookOpen size={22} /> },
        { path: '/review', label: 'Review', icon: <RefreshCw size={22} /> },
        { path: '/ujian', label: 'Ujian', icon: <PenTool size={22} /> },
        { path: '/statistik', label: 'Statistik', icon: <BarChart3 size={22} /> },
    ];

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 flex justify-around p-4 z-50 rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
            {navItems.map((item) => (
                <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                        `flex flex-col items-center text-[11px] font-medium transition-all duration-300 ${isActive
                            ? 'text-blue-600 scale-110 drop-shadow-md'
                            : 'text-slate-400 hover:text-slate-600'
                        }`
                    }
                >
                    <div className="mb-1">
                        {item.icon}
                    </div>
                    <span>{item.label}</span>
                </NavLink>
            ))}
        </div>
    );
}