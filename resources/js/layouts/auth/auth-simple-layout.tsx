import type { AuthLayoutProps } from '@/types';

export default function AuthSimpleLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    return (
        <div className="relative min-h-svh overflow-hidden bg-slate-950 px-4 py-10 [font-family:Manrope,ui-sans-serif,system-ui,sans-serif] sm:px-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_16%,rgba(239,68,68,0.22),transparent_38%),radial-gradient(circle_at_80%_90%,rgba(37,99,235,0.18),transparent_42%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:34px_34px] opacity-20" />

            <div className="relative mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-md items-center">
                <div className="w-full space-y-5">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold text-slate-100">
                            {title}
                        </h1>
                        <p className="text-sm text-slate-400">{description}</p>
                    </div>

                    {children}
                </div>
            </div>
        </div>
    );
}
