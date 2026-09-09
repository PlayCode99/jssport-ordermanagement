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
