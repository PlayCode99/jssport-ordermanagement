import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import JobTypesPage from '@/pages/settings/data/job-types/index';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    router: { get: vi.fn(), reload: vi.fn() },
    usePage: () => ({ props: {}, url: '/settings/data/job-types' }),
}));

const serverRows = [
    { id: '1', createdAt: '2026-09-01T09:00:00.000Z', name: 'ปัก', createdBy: 'system', active: true },
    { id: '2', createdAt: '2026-09-01T09:00:00.000Z', name: 'ซับลิเมชั่น', createdBy: 'system', active: true },
];

const lastSyncBody = () => {
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1);

    return JSON.parse((call?.[1] as RequestInit).body as string);
};

describe('job types settings page', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({ rows: [] }),
        })) as unknown as typeof fetch;

        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: {
                getItem: () => null,
                setItem: () => undefined,
                removeItem: () => undefined,
                clear: () => undefined,
                key: () => null,
                length: 0,
            },
        });
    });

    it('renders the rows the server sent', () => {
        render(<JobTypesPage rows={serverRows} />);

        expect(screen.getByText('ปัก')).toBeInTheDocument();
        expect(screen.getByText('ซับลิเมชั่น')).toBeInTheDocument();
    });

    it('sends a numeric id when adding, because item_id is an integer on the server', async () => {
        render(<JobTypesPage rows={serverRows} />);

        fireEvent.click(screen.getByRole('button', { name: /เพิ่มประเภทงาน/ }));

        const input = await screen.findByPlaceholderText('เช่น งานปัก');
        fireEvent.change(input, { target: { value: 'สกรีน เฟล๊กซ์' } });

        fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

        const body = lastSyncBody();
        expect(body.storage_key).toBe('jssport.job-types');

        const added = body.rows.find((row: { name: string }) => row.name === 'สกรีน เฟล๊กซ์');
        expect(added).toBeDefined();
        // The old code produced ids like "1756...-สกรีน", which the server rejected.
        expect(Number.isInteger(added.id)).toBe(true);
        expect(added.id).toBeGreaterThan(0);

        // ...and it must not collide with an id already in use.
        const ids = body.rows.map((row: { id: number }) => row.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('offers to import job types left behind in this browser', async () => {
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: {
                getItem: () =>
                    JSON.stringify([
                        { id: '1', createdAt: '2026-01-01T00:00:00.000Z', name: 'ปัก', active: true },
                        { id: '2', createdAt: '2026-01-01T00:00:00.000Z', name: 'เฉพาะเครื่องนี้', active: true },
                    ]),
                setItem: () => undefined,
                removeItem: () => undefined,
                clear: () => undefined,
                key: () => null,
                length: 0,
            },
        });

        render(<JobTypesPage rows={serverRows} />);

        // "ปัก" is already on the server, so only the one genuinely missing counts.
        expect(await screen.findByText(/พบประเภทงาน 1 รายการ/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /นำเข้าขึ้นเซิร์ฟเวอร์/ }));

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

        const body = lastSyncBody();
        expect(body.rows.map((row: { name: string }) => row.name)).toContain('เฉพาะเครื่องนี้');
        expect(body.rows.every((row: { id: number }) => Number.isInteger(row.id))).toBe(true);
    });
});
