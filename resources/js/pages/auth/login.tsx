import { Head, useForm } from '@inertiajs/react';
import { Eye, EyeOff, Layers3 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import InputError from '@/components/input-error';
import TeamInvitationAlert from '@/components/team-invitation-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import type { TeamInvitationContext } from '@/types';
import { store } from '@/routes/login';

const brandLogoUrl = '/images/logo/logo.png';

type Props = {
    status?: string;
    teamInvitation?: TeamInvitationContext | null;
};

type LoginFormData = {
    email: string;
    password: string;
    remember: boolean;
};

export default function Login({
    status,
    teamInvitation,
}: Props) {
    const [showPassword, setShowPassword] = useState(false);

    const { data, setData, post, processing, errors, reset } = useForm<LoginFormData>({
        email: '',
        password: '',
        remember: false,
    });

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        post(store.url(), {
            preserveScroll: true,
            onFinish: () => reset('password'),
        });
    };

    return (
        <>
            <Head title="Log in" />

            <section className="mx-auto w-full max-w-md space-y-5 rounded-2xl border border-slate-700/80 bg-slate-900/80 p-8 shadow-2xl shadow-blue-950/50 backdrop-blur-md">
                <div className="space-y-3 text-center">
                    <img src={brandLogoUrl} alt="J.S.Sport logo" className="mx-auto h-50 w-auto object-contain" loading="eager" />

                    <div className="flex justify-center">
                        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/35 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold tracking-[0.14em] text-blue-300 uppercase">
                            <Layers3 className="size-4" />
                            JSSPORT Order Management System
                        </div>
                    </div>
                </div>

                {teamInvitation && (
                    <TeamInvitationAlert
                        invitation={teamInvitation}
                        action="Log in"
                    />
                )}

                {status && (
                    <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200">
                        {status}
                    </div>
                )}

                <form onSubmit={submit} className="mt-1 flex flex-col gap-6">
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email" className="text-sm font-medium text-slate-400">Email หรือ รหัสพนักงาน</Label>
                            <Input
                                id="email"
                                type="text"
                                name="email"
                                required
                                autoFocus
                                tabIndex={1}
                                autoComplete="username"
                                placeholder="เช่น user@example.com หรือ EMP-0001"
                                value={data.email}
                                onChange={(event) => setData('email', event.target.value)}
                                className="h-11 rounded-lg border-slate-700 bg-slate-950/60 text-slate-100 transition-all focus-visible:border-blue-500 focus-visible:ring-blue-500/20"
                            />
                            <InputError message={errors.email} />
                        </div>

                        <div className="grid gap-2">
                            <div className="flex items-center">
                                <Label htmlFor="password" className="text-sm font-medium text-slate-400">Password</Label>
                            </div>

                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    required
                                    tabIndex={2}
                                    autoComplete="current-password"
                                    placeholder="Password"
                                    value={data.password}
                                    onChange={(event) => setData('password', event.target.value)}
                                    className="h-11 rounded-lg border-slate-700 bg-slate-950/60 pr-11 text-slate-100 transition-all focus-visible:border-blue-500 focus-visible:ring-blue-500/20"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((current) => !current)}
                                    className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-200"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    tabIndex={6}
                                >
                                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                            </div>
                            <InputError message={errors.password} />
                        </div>


                        <Button
                            type="submit"
                            className="mt-5 h-11 w-full bg-gradient-to-r from-red-500 to-blue-600 font-medium text-white shadow-lg shadow-red-500/20 transition-all duration-150 hover:from-red-600 hover:to-blue-700 active:scale-[0.98]"
                            tabIndex={4}
                            disabled={processing}
                            data-test="login-button"
                        >
                            {processing && <Spinner />}
                            Log in
                        </Button>
                    </div>

                    
                </form>
            </section>
        </>
    );
};
