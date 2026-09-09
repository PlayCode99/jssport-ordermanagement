import { Shirt } from 'lucide-react';

export default function AppLogo() {
    return (
        <div className="inline-flex items-center gap-3 rounded-full px-3 py-2 text-sm font-semibold tracking-[0.14em] text-slate-900 uppercase">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white">
                <Shirt className="h-4 w-4" />
            </div>
            <span>JS. SPORT ORDER</span>
        </div>
    );
}
