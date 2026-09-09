import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { formMocks } = vi.hoisted(() => ({
    formMocks: {
        post: vi.fn(),
        put: vi.fn(),
        setData: vi.fn(),
        reset: vi.fn(),
        clearErrors: vi.fn(),
    },
}));

vi.mock('@inertiajs/react', () => ({
    router: { patch: vi.fn(), delete: vi.fn() },
    useForm: () => ({
        data: { password: '', password_confirmation: '' },
        errors: {},
        processing: false,
        post: formMocks.post,
        put: formMocks.put,
        setData: formMocks.setData,
        reset: formMocks.reset,
        clearErrors: formMocks.clearErrors,
    }),
}));

import { useUserManagement } from '@/hooks/useUserManagement';

/** Runs the onSuccess handler the hook handed to Inertia. */
const fireSuccess = (mock: ReturnType<typeof vi.fn>) => {
    const options = mock.mock.calls.at(-1)?.[1] as
        { onSuccess?: () => void } | undefined;
    act(() => options?.onSuccess?.());
};

describe('useUserManagement dialog closing', () => {
    beforeEach(() => {
        Object.values(formMocks).forEach((mock) => mock.mockClear());
    });

    it('tells the page to close the create dialog once the save lands', () => {
        const { result } = renderHook(() => useUserManagement());
        const onSaved = vi.fn();

        act(() => result.current.submitCreate(onSaved));
        expect(onSaved).not.toHaveBeenCalled();

        fireSuccess(formMocks.post);

        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(formMocks.reset).toHaveBeenCalled();
    });

    it('leaves the dialog open when the save fails', () => {
        const { result } = renderHook(() => useUserManagement());
        const onSaved = vi.fn();

        act(() => result.current.submitCreate(onSaved));

        // No onSuccess fired: the user keeps the form and its error messages.
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('closes the edit dialog the same way', () => {
        const { result } = renderHook(() => useUserManagement());
        const onSaved = vi.fn();

        act(() =>
            result.current.openEdit({
                id: 3,
                full_name: 'ก',
                employee_code: 'E',
                role: 'COUNTER',
                branch_id: 1,
                is_active: true,
            } as never),
        );
        act(() => result.current.submitEdit(onSaved));

        fireSuccess(formMocks.put);

        expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('does nothing when edit is submitted with nobody selected', () => {
        const { result } = renderHook(() => useUserManagement());

        act(() => result.current.submitEdit(vi.fn()));

        expect(formMocks.put).not.toHaveBeenCalled();
    });
});

describe('useUserManagement password reset', () => {
    beforeEach(() => {
        Object.values(formMocks).forEach((mock) => mock.mockClear());
    });

    it('posts to the reset endpoint for the chosen user', () => {
        const { result } = renderHook(() => useUserManagement());

        act(() =>
            result.current.openResetPassword({
                id: 7,
                full_name: 'สมชาย',
            } as never),
        );
        act(() => result.current.submitResetPassword());

        expect(formMocks.post).toHaveBeenCalledWith(
            '/settings/users/7/reset-password',
            expect.anything(),
        );
    });

    it('does nothing when no user is selected', () => {
        const { result } = renderHook(() => useUserManagement());

        act(() => result.current.submitResetPassword());

        expect(formMocks.post).not.toHaveBeenCalled();
    });

    it('clears the selection once the reset lands', () => {
        const { result } = renderHook(() => useUserManagement());

        act(() =>
            result.current.openResetPassword({
                id: 7,
                full_name: 'สมชาย',
            } as never),
        );
        expect(result.current.resettingUser).not.toBeNull();

        act(() => result.current.submitResetPassword());
        fireSuccess(formMocks.post);

        expect(result.current.resettingUser).toBeNull();
    });

    it('empties the boxes when the dialog is dismissed', () => {
        const { result } = renderHook(() => useUserManagement());

        act(() =>
            result.current.openResetPassword({
                id: 7,
                full_name: 'สมชาย',
            } as never),
        );
        act(() => result.current.closeResetPassword());

        expect(result.current.resettingUser).toBeNull();
        expect(formMocks.setData).toHaveBeenCalledWith({
            password: '',
            password_confirmation: '',
        });
    });
});
