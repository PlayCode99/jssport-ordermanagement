import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    ArtworkImage,
    ArtworkPayload,
    ArtworkPlace,
} from '../UpdateArtworkDialog';
import {
    moveTargets,
    placeTitle,
    UpdateArtworkDialog,
    uploadFieldFor,
} from '../UpdateArtworkDialog';

const post = vi.fn();

vi.mock('@inertiajs/react', () => ({
    router: { post: (...args: unknown[]) => post(...args) },
}));

const sheet = (key: string, garment: 'shirt' | 'pants'): ArtworkPlace => ({
    key,
    kind: 'sheet',
    garment,
    quantity: 10,
});

const savedImage = (over: Partial<ArtworkImage> = {}): ArtworkImage => ({
    id: 11,
    url: '/storage/logo.png',
    name: 'logo',
    place: 'shirt_adults_short',
    collection: 'shirt_artwork',
    uploaded_by_name: null,
    uploaded_at: null,
    ...over,
});

const payload = (over: Partial<ArtworkPayload> = {}): ArtworkPayload => ({
    places: [
        { key: 'artwork', kind: 'cover', garment: null, quantity: 0 },
        sheet('shirt_adults_short', 'shirt'),
        sheet('shirt_adults_long', 'shirt'),
        { key: 'shirt', kind: 'garment_all', garment: 'shirt', quantity: 0 },
        { key: 'reference', kind: 'reference', garment: null, quantity: 0 },
    ],
    house_names: [],
    images: [savedImage()],
    ...over,
});

const answerWith = (body: ArtworkPayload) =>
    vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: body }),
    });

const openDialog = async (body: ArtworkPayload = payload()) => {
    vi.stubGlobal('fetch', answerWith(body));

    render(
        <UpdateArtworkDialog
            target={{ id: 7, orderCode: '01-2026-00007', jobName: 'เสื้อทีม' }}
            onClose={vi.fn()}
        />,
    );

    await screen
        .findByText('shirt_adults_short' as string, {
            exact: false,
            // The heading is the sheet's Thai name, so wait on something stable.
        })
        .catch(() => undefined);

    await waitFor(() =>
        expect(screen.queryByText('กำลังโหลดรูป…')).not.toBeInTheDocument(),
    );
};

/** The FormData the dialog posted, as plain entries. */
const postedEntries = (): Array<[string, FormDataEntryValue]> => {
    const body = post.mock.calls.at(-1)?.[1] as FormData;

    return [...body.entries()];
};

beforeEach(() => {
    post.mockReset();
    vi.unstubAllGlobals();
    // jsdom has no object URLs; the dialog makes one per picked file.
    vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: () => 'blob:preview',
        revokeObjectURL: () => undefined,
    });
});

describe('where a new picture is posted', () => {
    it('sends a sheet picture pinned to that sheet alone', () => {
        expect(uploadFieldFor(sheet('shirt_kids_short', 'shirt'))).toBe(
            'shirt_artwork_scoped[shirt_kids_short][]',
        );
        expect(uploadFieldFor(sheet('pants_adults_long', 'pants'))).toBe(
            'pants_artwork_scoped[pants_adults_long][]',
        );
    });

    it('sends an unpinned picture to every sheet of its garment', () => {
        expect(
            uploadFieldFor({
                key: 'shirt',
                kind: 'garment_all',
                garment: 'shirt',
                quantity: 0,
            }),
        ).toBe('shirt_artwork[]');
    });

    it('sends a colour house and a ชุดพละ table by their own key', () => {
        expect(
            uploadFieldFor({
                key: 'sports_day_2',
                kind: 'house',
                garment: null,
                quantity: 0,
            }),
        ).toBe('sports_day_artwork[2][]');
        expect(
            uploadFieldFor({
                key: 'pe_kids',
                kind: 'pe_table',
                garment: null,
                quantity: 0,
            }),
        ).toBe('pe_uniform_artwork[kids][]');
    });
});

describe('which sheets a saved picture may be moved to', () => {
    it('offers the other sheets of its own garment', () => {
        const places = payload().places;
        const keys = moveTargets(savedImage(), places).map((p) => p.key);

        expect(keys).toEqual([
            'shirt_adults_short',
            'shirt_adults_long',
            'shirt',
        ]);
    });

    it('can always unpin, even on a bill that lists no every-sheet slot', () => {
        // The server lists "ทุกใบงานเสื้อ" only while it holds a picture, so
        // most bills do not have it — unpinning must still be possible.
        const sheetsOnly = payload().places.filter(
            (place) => place.kind === 'sheet',
        );
        const keys = moveTargets(savedImage(), sheetsOnly).map((p) => p.key);

        expect(keys).toContain('shirt');
        expect(keys.filter((key) => key === 'shirt')).toHaveLength(1);
    });

    it('never offers the other garment, which prints in another room', () => {
        const places = [
            ...payload().places,
            sheet('pants_adults_long', 'pants'),
        ];
        const keys = moveTargets(savedImage(), places).map((p) => p.key);

        expect(keys).not.toContain('pants_adults_long');
    });

    it('offers nothing for a colour house picture, which is filed by house', () => {
        expect(
            moveTargets(
                savedImage({
                    collection: 'sports_day_artwork',
                    place: 'sports_day_0',
                }),
                payload().places,
            ),
        ).toEqual([]);
    });
});

describe('the names the counter reads', () => {
    it('names the cover and the references rather than calling both ทั้งบิล', () => {
        expect(
            placeTitle(
                { key: 'artwork', kind: 'cover', garment: null, quantity: 0 },
                [],
            ),
        ).toBe('รูปปกใบรับงาน');
        expect(
            placeTitle(
                {
                    key: 'reference',
                    kind: 'reference',
                    garment: null,
                    quantity: 0,
                },
                [],
            ),
        ).toBe('รูปอ้างอิง');
    });

    it('names a sheet the way the floor does', () => {
        expect(placeTitle(sheet('shirt_kids_short', 'shirt'), [])).toBe(
            'เสื้อเด็ก · แขนสั้น',
        );
    });

    it('names a colour house by its own name', () => {
        expect(
            placeTitle(
                {
                    key: 'sports_day_0',
                    kind: 'house',
                    garment: null,
                    quantity: 0,
                },
                ['คณะสีแดง'],
            ),
        ).toBe('คณะสีแดง');
    });
});

describe('the dialog', () => {
    it('lists every slot, including the ones with no picture yet', async () => {
        await openDialog();

        expect(
            screen.getByRole('heading', { name: /เสื้อผู้ใหญ่ · แขนยาว/ }),
        ).toBeInTheDocument();
        expect(screen.getAllByText('ยังไม่มีรูป').length).toBeGreaterThan(0);
    });

    it('saves nothing until something has actually changed', async () => {
        await openDialog();

        expect(
            screen.getByRole('button', { name: 'บันทึกรูป' }),
        ).toBeDisabled();
    });

    it('marks a picture for removal and can take the mark back', async () => {
        const user = userEvent.setup();
        await openDialog();

        await user.click(screen.getByRole('button', { name: 'ลบรูป logo' }));
        expect(screen.getByRole('button', { name: 'บันทึกรูป' })).toBeEnabled();

        await user.click(
            screen.getByRole('button', { name: 'คืนค่ารูป logo' }),
        );
        expect(
            screen.getByRole('button', { name: 'บันทึกรูป' }),
        ).toBeDisabled();
    });

    it('posts the removal by media id, and nothing else', async () => {
        const user = userEvent.setup();
        await openDialog();

        await user.click(screen.getByRole('button', { name: 'ลบรูป logo' }));
        await user.click(screen.getByRole('button', { name: 'บันทึกรูป' }));

        const entries = Object.fromEntries(postedEntries());

        expect(post.mock.calls.at(-1)?.[0]).toBe('/orders/7/artwork');
        expect(entries.removed_media_ids).toBe('[11]');
        expect(entries.artwork_file_count).toBe('0');
        // Nothing that could move a size, a price or a date went with it.
        expect(Object.keys(entries).sort()).toEqual([
            'artwork_file_count',
            'artwork_scopes',
            'removed_media_ids',
        ]);
    });

    it('posts a new picture under the sheet it was dropped on', async () => {
        const user = userEvent.setup();
        await openDialog();

        const section = screen
            .getByRole('heading', { name: /เสื้อผู้ใหญ่ · แขนยาว/ })
            .closest('section')!;

        await user.upload(
            within(section).getByLabelText(/เพิ่มรูป/) as HTMLInputElement,
            new File(['x'], 'new.png', { type: 'image/png' }),
        );

        await user.click(screen.getByRole('button', { name: 'บันทึกรูป' }));

        const entries = postedEntries();

        expect(
            entries.some(
                ([key]) => key === 'shirt_artwork_scoped[shirt_adults_long][]',
            ),
        ).toBe(true);
        expect(Object.fromEntries(entries).artwork_file_count).toBe('1');
    });

    it('keeps every picture of a multi-file pick', async () => {
        const user = userEvent.setup();
        await openDialog();

        const section = screen
            .getByRole('heading', { name: /เสื้อผู้ใหญ่ · แขนยาว/ })
            .closest('section')!;

        // The handler clears the input straight after reading it, so that the
        // same file can be picked again. Anything still reading the FileList
        // by then reads an empty one and silently keeps a single picture.
        await user.upload(
            within(section).getByLabelText(/เพิ่มรูป/) as HTMLInputElement,
            [
                new File(['a'], 'first.png', { type: 'image/png' }),
                new File(['b'], 'second.png', { type: 'image/png' }),
            ],
        );

        expect(screen.getAllByText('รูปใหม่')).toHaveLength(2);

        await user.click(screen.getByRole('button', { name: 'บันทึกรูป' }));

        const posted = postedEntries().filter(
            ([key]) => key === 'shirt_artwork_scoped[shirt_adults_long][]',
        );

        expect(posted.map(([, file]) => (file as File).name)).toEqual([
            'first.png',
            'second.png',
        ]);
        expect(Object.fromEntries(postedEntries()).artwork_file_count).toBe(
            '2',
        );
    });

    it('adds to a slot across separate picks rather than replacing', async () => {
        const user = userEvent.setup();
        await openDialog();

        const section = screen
            .getByRole('heading', { name: /เสื้อผู้ใหญ่ · แขนยาว/ })
            .closest('section')!;
        const input = within(section).getByLabelText(
            /เพิ่มรูป/,
        ) as HTMLInputElement;

        await user.upload(
            input,
            new File(['a'], 'first.png', { type: 'image/png' }),
        );
        await user.upload(
            input,
            new File(['b'], 'second.png', { type: 'image/png' }),
        );

        expect(screen.getAllByText('รูปใหม่')).toHaveLength(2);
    });

    it('takes a handful of files dropped onto a slot', async () => {
        const user = userEvent.setup();
        await openDialog();

        const section = screen
            .getByRole('heading', { name: /เสื้อผู้ใหญ่ · แขนยาว/ })
            .closest('section')!;
        const files = [
            new File(['a'], 'drop-1.png', { type: 'image/png' }),
            new File(['b'], 'drop-2.png', { type: 'image/png' }),
            new File(['c'], 'drop-3.png', { type: 'image/png' }),
        ];

        fireEvent.drop(section, { dataTransfer: { files } });

        expect(await screen.findAllByText('รูปใหม่')).toHaveLength(3);

        await user.click(screen.getByRole('button', { name: 'บันทึกรูป' }));

        expect(
            postedEntries()
                .filter(
                    ([key]) =>
                        key === 'shirt_artwork_scoped[shirt_adults_long][]',
                )
                .map(([, file]) => (file as File).name),
        ).toEqual(['drop-1.png', 'drop-2.png', 'drop-3.png']);
    });

    it('tells the counter that a slot takes more than one picture', async () => {
        await openDialog();

        expect(screen.getAllByText(/ใส่ได้หลายรูป/).length).toBeGreaterThan(0);
    });

    it('posts a move as the sheet the picture is going to', async () => {
        const user = userEvent.setup();
        await openDialog();

        await user.click(
            screen.getByRole('combobox', { name: 'ใบงานของรูป logo' }),
        );
        await user.click(
            await screen.findByRole('option', {
                name: 'เสื้อผู้ใหญ่ · แขนยาว',
            }),
        );
        await user.click(screen.getByRole('button', { name: 'บันทึกรูป' }));

        expect(
            JSON.parse(
                String(Object.fromEntries(postedEntries()).artwork_scopes),
            ),
        ).toEqual({ '11': 'shirt_adults_long' });
    });

    it('posts an empty sheet when a picture goes back to every sheet', async () => {
        const user = userEvent.setup();
        await openDialog();

        await user.click(
            screen.getByRole('combobox', { name: 'ใบงานของรูป logo' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'ทุกใบงานเสื้อ' }),
        );
        await user.click(screen.getByRole('button', { name: 'บันทึกรูป' }));

        expect(
            JSON.parse(
                String(Object.fromEntries(postedEntries()).artwork_scopes),
            ),
        ).toEqual({ '11': '' });
    });

    it('keeps an unpinned picture on screen, in a slot the bill did not list', async () => {
        const user = userEvent.setup();
        // A bill of sheets only, exactly as the server now sends it.
        await openDialog(
            payload({
                places: payload().places.filter(
                    (place) => place.kind === 'sheet',
                ),
            }),
        );

        await user.click(
            screen.getByRole('combobox', { name: 'ใบงานของรูป logo' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'ทุกใบงานเสื้อ' }),
        );

        // The slot appears so the picture does not read as deleted, and the
        // move is what gets posted.
        expect(
            screen.getByRole('heading', { name: /ทุกใบงานเสื้อ/ }),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'บันทึกรูป' }));

        expect(
            JSON.parse(
                String(Object.fromEntries(postedEntries()).artwork_scopes),
            ),
        ).toEqual({ '11': '' });
    });

    it('says who added a picture after the bill was written', async () => {
        await openDialog(
            payload({
                images: [
                    savedImage({
                        uploaded_by_name: 'ดีไซเนอร์ เอ',
                        uploaded_at: '2026-11-24 10:00:00',
                    }),
                ],
            }),
        );

        expect(screen.getByText(/อัปเดตโดย/)).toHaveTextContent('ดีไซเนอร์ เอ');
    });

    it('says so plainly when the pictures cannot be loaded', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: false, status: 403 }),
        );

        render(
            <UpdateArtworkDialog
                target={{ id: 7, orderCode: '01-2026-00007' }}
                onClose={vi.fn()}
            />,
        );

        expect(
            await screen.findByText(/โหลดรูปของบิลนี้ไม่สำเร็จ/),
        ).toBeInTheDocument();
    });
});
