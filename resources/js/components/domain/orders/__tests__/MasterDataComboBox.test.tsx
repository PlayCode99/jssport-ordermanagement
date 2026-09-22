import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MasterDataComboBox } from '@/components/domain/orders/MasterDataComboBox';

const options = [
    { id: 7, name: 'โรงเรียนอนุบาลหนองบัวลำภู' },
    { id: 8, name: 'เทศบาลเมือง' },
];

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('MasterDataComboBox', () => {
    it('reports the option id in the default mode', () => {
        const onValueChange = vi.fn();

        render(
            <MasterDataComboBox
                storageKey="jssport.shirt-fabric-colors"
                options={options}
                value=""
                onValueChange={onValueChange}
                aria-label="สีผ้า"
            />,
        );

        fireEvent.focus(screen.getByLabelText('สีผ้า'));
        fireEvent.mouseDown(screen.getByText('เทศบาลเมือง'));

        expect(onValueChange).toHaveBeenCalledWith('8');
    });

    it('reports the option name in name mode', () => {
        // orders.job_name stores the text and is searched with LIKE, so an id
        // here would break search for every order written afterwards.
        const onValueChange = vi.fn();

        render(
            <MasterDataComboBox
                storageKey="jssport.job-names"
                valueMode="name"
                options={options}
                value=""
                onValueChange={onValueChange}
                aria-label="ชื่อหน่วยงาน, ชื่องาน"
            />,
        );

        fireEvent.focus(screen.getByLabelText('ชื่อหน่วยงาน, ชื่องาน'));
        fireEvent.mouseDown(screen.getByText('เทศบาลเมือง'));

        expect(onValueChange).toHaveBeenCalledWith('เทศบาลเมือง');
    });

    it('shows a stored name as-is in name mode, including one that looks like an id', () => {
        // A job name of "2024" must display as typed, not resolve to option 2024.
        render(
            <MasterDataComboBox
                storageKey="jssport.job-names"
                valueMode="name"
                options={[{ id: 2024, name: 'ชื่ออื่น' }]}
                value="2024"
                onValueChange={vi.fn()}
                aria-label="ชื่อหน่วยงาน, ชื่องาน"
            />,
        );

        expect(
            screen.getByLabelText<HTMLInputElement>('ชื่อหน่วยงาน, ชื่องาน')
                .value,
        ).toBe('2024');
    });

    it('saves typed text as master data and reports the saved name', async () => {
        const onValueChange = vi.fn();
        const onOptionAdded = vi.fn();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ item: { id: 9, name: 'โรงเรียนบ้านโนนสูง' } }),
        });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <MasterDataComboBox
                storageKey="jssport.job-names"
                valueMode="name"
                options={options}
                value="โรงเรียนบ้านโนนสูง"
                onValueChange={onValueChange}
                onOptionAdded={onOptionAdded}
                aria-label="ชื่อหน่วยงาน, ชื่องาน"
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'เพิ่มเป็นมาสเตอร์' }),
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/settings/data/catalog-items/quick-add');
        expect(JSON.parse(String(init.body))).toEqual({
            storage_key: 'jssport.job-names',
            name: 'โรงเรียนบ้านโนนสูง',
        });

        await waitFor(() =>
            expect(onOptionAdded).toHaveBeenCalledWith({
                id: 9,
                name: 'โรงเรียนบ้านโนนสูง',
            }),
        );
        expect(onValueChange).toHaveBeenLastCalledWith('โรงเรียนบ้านโนนสูง');
    });
});

/**
 * The sewing-spec master data is managed from the form: a hidden row stays
 * out of the choices but keeps resolving the name of a value that picked it,
 * and the people allowed to may rename or hide rows from a dialog.
 */
describe('MasterDataComboBox management', () => {
    const catalog = [
        { id: 1, name: 'คอกลม', active: true },
        { id: 2, name: 'คอวี', active: true },
        { id: 3, name: 'คอปกเก่า', active: false },
    ];

    it('still names a hidden row a bill picked before it was hidden', () => {
        render(
            <MasterDataComboBox
                storageKey="jssport.shirt-collars"
                options={catalog}
                value="3"
                onValueChange={vi.fn()}
                aria-label="แบบคอ"
            />,
        );

        expect(screen.getByLabelText<HTMLInputElement>('แบบคอ').value).toBe(
            'คอปกเก่า',
        );
    });

    it('keeps a hidden row out of the choices', () => {
        render(
            <MasterDataComboBox
                storageKey="jssport.shirt-collars"
                options={catalog}
                value=""
                onValueChange={vi.fn()}
                aria-label="แบบคอ"
            />,
        );

        fireEvent.focus(screen.getByLabelText('แบบคอ'));

        expect(screen.getByText('คอกลม')).toBeInTheDocument();
        expect(screen.getByText('คอวี')).toBeInTheDocument();
        expect(screen.queryByText('คอปกเก่า')).toBeNull();
    });

    it('offers the manage dialog only to those allowed to use it', () => {
        const { rerender } = render(
            <MasterDataComboBox
                storageKey="jssport.shirt-collars"
                label="แบบคอ"
                options={catalog}
                value=""
                onValueChange={vi.fn()}
                aria-label="แบบคอ"
                manage={{ canEdit: false }}
            />,
        );

        expect(
            screen.queryByRole('button', { name: /จัดการรายการ/ }),
        ).toBeNull();

        rerender(
            <MasterDataComboBox
                storageKey="jssport.shirt-collars"
                label="แบบคอ"
                options={catalog}
                value=""
                onValueChange={vi.fn()}
                aria-label="แบบคอ"
                manage={{ canEdit: true }}
            />,
        );

        expect(
            screen.getByRole('button', { name: 'จัดการรายการ แบบคอ' }),
        ).toBeInTheDocument();
    });

    it('renames a row through the dialog and reports the saved name', async () => {
        const onRenamed = vi.fn();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                item: { id: 2, name: 'คอวีลึก', active: true },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <MasterDataComboBox
                storageKey="jssport.shirt-collars"
                label="แบบคอ"
                options={catalog}
                value=""
                onValueChange={vi.fn()}
                aria-label="แบบคอ"
                manage={{ canEdit: true, onRenamed }}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'จัดการรายการ แบบคอ' }),
        );

        // Only the rows on offer can be managed; the hidden one is not listed.
        expect(screen.queryByLabelText('ชื่อรายการ คอปกเก่า')).toBeNull();

        fireEvent.change(screen.getByLabelText('ชื่อรายการ คอวี'), {
            target: { value: 'คอวีลึก' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'บันทึกชื่อ คอวี' }),
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('/settings/data/catalog-items/rename');
        expect(JSON.parse(String(init.body))).toEqual({
            storage_key: 'jssport.shirt-collars',
            item_id: 2,
            name: 'คอวีลึก',
        });
        await waitFor(() =>
            expect(onRenamed).toHaveBeenCalledWith({
                id: 2,
                name: 'คอวีลึก',
                active: true,
            }),
        );
    });

    it('hides a row after confirming, and reports it', async () => {
        const onHidden = vi.fn();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                item: { id: 1, name: 'คอกลม', active: false },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        render(
            <MasterDataComboBox
                storageKey="jssport.shirt-collars"
                label="แบบคอ"
                options={catalog}
                value=""
                onValueChange={vi.fn()}
                aria-label="แบบคอ"
                manage={{ canEdit: true, onHidden }}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'จัดการรายการ แบบคอ' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'ซ่อน คอกลม' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('/settings/data/catalog-items/hide');
        expect(JSON.parse(String(init.body))).toEqual({
            storage_key: 'jssport.shirt-collars',
            item_id: 1,
        });
        await waitFor(() =>
            expect(onHidden).toHaveBeenCalledWith({
                id: 1,
                name: 'คอกลม',
                active: false,
            }),
        );

        vi.restoreAllMocks();
    });

    it('shows the server reason when a rename is refused', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                json: async () => ({ message: 'มีชื่อนี้อยู่แล้ว' }),
            }),
        );

        render(
            <MasterDataComboBox
                storageKey="jssport.shirt-collars"
                label="แบบคอ"
                options={catalog}
                value=""
                onValueChange={vi.fn()}
                aria-label="แบบคอ"
                manage={{ canEdit: true }}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'จัดการรายการ แบบคอ' }),
        );
        fireEvent.change(screen.getByLabelText('ชื่อรายการ คอวี'), {
            target: { value: 'คอกลม' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'บันทึกชื่อ คอวี' }),
        );

        expect(
            await screen.findByText('มีชื่อนี้อยู่แล้ว'),
        ).toBeInTheDocument();
    });
});
