import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ShirtCatalogPage from '@/pages/settings/data/shirts/catalog';

const mockPage = vi.hoisted(() => ({
    props: {} as Record<string, unknown>,
    url: '/settings/data/size-kids',
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ children }: { children?: React.ReactNode }) => (
        <span>{children}</span>
    ),
    router: { get: vi.fn(), reload: vi.fn() },
    usePage: () => mockPage,
}));

/**
 * The size lists are arranged by hand on this screen and the order form lists
 * the sizes exactly as arranged: the rows keep the order the server sent
 * (which is the saved order), every row has an up and a down arrow, and a
 * move sends the whole list back in its new order. Catalogs that are not
 * sortable — job names — keep reading newest first, with no arrows.
 */
const auth = { user: { id: 1, name: 'Owner01' } };

const sizeRows = [
    {
        id: 1,
        createdAt: '2026-08-21T04:17:04.000Z',
        name: 'JS',
        createdBy: 'Owner01',
        active: true,
    },
    {
        id: 2,
        createdAt: '2026-08-21T04:17:14.000Z',
        name: 'JM',
        createdBy: 'Owner01',
        active: true,
    },
    {
        id: 3,
        createdAt: '2026-09-05T07:23:31.000Z',
        name: 'JSS',
        createdBy: 'Owner01',
        active: true,
    },
];

const sizeCatalog = {
    title: 'ไซซ์เด็ก',
    routePath: '/settings/data/size-kids',
    storageKey: 'jssport.size-kids',
    dataLabel: 'Size Data',
    parentTitle: 'ไซซ์เด็ก',
    parentPath: '/settings/data/size-kids',
    pagePrefix: 'ไซซ์เด็ก',
    sortable: true,
};

const jobNameCatalog = {
    ...sizeCatalog,
    title: 'ชื่อหน่วยงาน, ชื่องาน',
    routePath: '/settings/data/job-names',
    storageKey: 'jssport.job-names',
    sortable: false,
};

const renderPage = (
    catalog: typeof sizeCatalog,
    rows: typeof sizeRows = sizeRows,
) => {
    mockPage.props = { auth, catalog, rows };

    return render(<ShirtCatalogPage />);
};

/** The names down the table, whichever column the name sits in. */
const namesInOrder = () => {
    const header = [...document.querySelectorAll('thead th')].map(
        (cell) => cell.textContent?.trim() ?? '',
    );
    const nameColumn = header.findIndex((text) => text.startsWith('ชื่อ'));

    return [...document.querySelectorAll('tbody tr')].map(
        (row) =>
            row.querySelectorAll('td')[nameColumn]?.textContent?.trim() ?? '',
    );
};

const lastSyncBody = () => {
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
    );

    return JSON.parse((call?.[1] as RequestInit).body as string) as {
        storage_key: string;
        rows: Array<{ id: number; name: string }>;
    };
};

beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({}),
    })) as unknown as typeof fetch;
});

describe('a sortable catalog (the size lists)', () => {
    it('lists the rows in the saved order, not newest first', () => {
        renderPage(sizeCatalog);

        // Newest-first would put JSS at the top.
        expect(namesInOrder()).toEqual(['JS', 'JM', 'JSS']);
        expect(
            screen.getByText(/ฟอร์มเปิดบิลจะเรียงตามลำดับนี้/),
        ).toBeInTheDocument();
    });

    it('moves a size up and saves the whole list in its new order', async () => {
        renderPage(sizeCatalog);

        fireEvent.click(
            screen.getByRole('button', { name: 'เลื่อน JSS ขึ้น' }),
        );

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

        const body = lastSyncBody();
        expect(body.storage_key).toBe('jssport.size-kids');
        expect(body.rows.map((row) => row.name)).toEqual(['JS', 'JSS', 'JM']);
        expect(namesInOrder()).toEqual(['JS', 'JSS', 'JM']);
    });

    it('moves a size down', async () => {
        renderPage(sizeCatalog);

        fireEvent.click(screen.getByRole('button', { name: 'เลื่อน JS ลง' }));

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

        expect(lastSyncBody().rows.map((row) => row.name)).toEqual([
            'JM',
            'JS',
            'JSS',
        ]);
    });

    it('cannot move the first row up or the last row down', () => {
        renderPage(sizeCatalog);

        expect(
            screen.getByRole('button', { name: 'เลื่อน JS ขึ้น' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'เลื่อน JSS ลง' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'เลื่อน JM ขึ้น' }),
        ).toBeEnabled();
    });

    it('rests the arrows while the list is filtered, so a move is always against real neighbours', () => {
        renderPage(sizeCatalog);

        fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), {
            target: { value: 'J' },
        });

        for (const button of screen.getAllByRole('button', {
            name: /^เลื่อน /,
        })) {
            expect(button).toBeDisabled();
        }
    });

    it('adds a new size at the end of the list', async () => {
        renderPage(sizeCatalog);

        fireEvent.click(screen.getByRole('button', { name: /เพิ่มไซซ์เด็ก/ }));
        fireEvent.change(await screen.findByLabelText('ชื่อไซซ์เด็ก'), {
            target: { value: 'JXL' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

        expect(lastSyncBody().rows.map((row) => row.name)).toEqual([
            'JS',
            'JM',
            'JSS',
            'JXL',
        ]);
    });
});

describe('a catalog that is not sortable (job names)', () => {
    it('keeps reading newest first and offers no arrows', () => {
        renderPage(jobNameCatalog);

        expect(namesInOrder()).toEqual(['JSS', 'JM', 'JS']);
        expect(
            screen.queryByRole('button', { name: /^เลื่อน / }),
        ).not.toBeInTheDocument();
        expect(
            within(screen.getByRole('table')).queryByText('ลำดับ'),
        ).not.toBeInTheDocument();
    });

    it('still adds a new entry at the top', async () => {
        renderPage(jobNameCatalog);

        fireEvent.click(
            screen.getByRole('button', { name: /เพิ่มชื่อหน่วยงาน, ชื่องาน/ }),
        );
        fireEvent.change(
            await screen.findByLabelText('ชื่อชื่อหน่วยงาน, ชื่องาน'),
            { target: { value: 'รร ใหม่' } },
        );
        fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

        expect(lastSyncBody().rows[0].name).toBe('รร ใหม่');
    });
});
