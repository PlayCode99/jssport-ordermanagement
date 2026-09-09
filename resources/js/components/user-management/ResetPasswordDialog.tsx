import type { InertiaFormProps } from '@inertiajs/react';
import { KeyRound, Loader2 } from 'lucide-react';

import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export type ResetPasswordFormData = {
    password: string;
    password_confirmation: string;
};

type Props = {
    open: boolean;
    targetName: string;
    form: InertiaFormProps<ResetPasswordFormData>;
    onSubmit: () => void;
    onOpenChange: (open: boolean) => void;
};

export default function ResetPasswordDialog({
    open,
    targetName,
    form,
    onSubmit,
    onOpenChange,
}: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="size-4 text-slate-500" />
                        รีเซ็ตรหัสผ่าน
                    </DialogTitle>
                    <DialogDescription>
                        ตั้งรหัสผ่านใหม่ให้{' '}
                        <span className="font-semibold text-slate-900">
                            {targetName}
                        </span>{' '}
                        — ผู้ใช้จะต้องเข้าสู่ระบบใหม่ด้วยรหัสนี้
                    </DialogDescription>
                </DialogHeader>

                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit();
                    }}
                >
                    <div className="grid gap-1.5">
                        <label
                            className="text-sm font-medium text-slate-700"
                            htmlFor="reset-password"
                        >
                            รหัสผ่านใหม่
                        </label>
                        <Input
                            id="reset-password"
                            type="password"
                            autoComplete="new-password"
                            value={form.data.password}
                            onChange={(event) =>
                                form.setData('password', event.target.value)
                            }
                        />
                        <InputError message={form.errors.password} />
                    </div>

                    <div className="grid gap-1.5">
                        <label
                            className="text-sm font-medium text-slate-700"
                            htmlFor="reset-password-confirmation"
                        >
                            ยืนยันรหัสผ่านใหม่
                        </label>
                        <Input
                            id="reset-password-confirmation"
                            type="password"
                            autoComplete="new-password"
                            value={form.data.password_confirmation}
                            onChange={(event) =>
                                form.setData(
                                    'password_confirmation',
                                    event.target.value,
                                )
                            }
                        />
                    </div>

                    <DialogFooter className="gap-2 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            ยกเลิก
                        </Button>
                        <Button
                            type="submit"
                            disabled={form.processing}
                            className="gap-2"
                        >
                            {form.processing ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            บันทึกรหัสผ่านใหม่
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
