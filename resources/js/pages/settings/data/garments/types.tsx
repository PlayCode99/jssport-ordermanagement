import { Head, Link, usePage } from '@inertiajs/react';
import {
    ChevronLeft,
    ChevronRight,
    Pencil,
    Plus,
    Power,
    Search,
    Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type GarmentCategory = 'SHIRT' | 'PANTS';

type GarmentTypeRow = {
    id: number;
    category: GarmentCategory;
    style: string | null;
    code: string;
    name: string;
    is_active: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
};

/**
 * One length a garment is cut to, as the shop keeps it. `code` is what bills
 * store and what production sheets are keyed by; the counts say what is
 * holding the length in place, so the page can explain a refused delete
 * before the user asks for one.
 */
type GarmentStyleRow = {
    id: number;
    category: GarmentCategory;
    code: string;
    name: string;
    display_order: number;
    is_active: boolean;
    garment_type_count: number;
    billed_line_count: number;
};

type PageProps = {
    rows: GarmentTypeRow[];
    styles: GarmentStyleRow[];
    selectedCategory?: GarmentCategory | null;
    selectedStyle?: string | null;
};

type GarmentStyle = string;

type FormState = {
    category: GarmentCategory;
    style: GarmentStyle;
    code: string;
    name: string;
    display_order: string;
    is_active: boolean;
};

const INITIAL_FORM: FormState = {
    category: 'SHIRT',
    style: 'short',
    code: '',
    name: '',
    display_order: '0',
    is_active: true,
};

/**
 * The lengths of one category, in the order the shop reads them.
 *
 * They used to be three words written here. A shop that starts selling a
 * three-quarter sleeve could not add one without a developer, which is what
 * this list being data rather than code fixes.
 */
function stylesOf(
    styles: GarmentStyleRow[],
    category: GarmentCategory,
): GarmentStyleRow[] {
    return styles.filter((style) => style.category === category);
}

function styleLabelFrom(
    styles: GarmentStyleRow[],
    category: GarmentCategory,
    code: string | null | undefined,
): string {
    return (
        stylesOf(styles, category).find((style) => style.code === code)?.name ??
        '—'
    );
}

/** The word a category calls its lengths by. */
const lengthWord = (category: GarmentCategory): string =>
    category === 'PANTS' ? 'ขา' : 'แขน';

function csrfToken(): string {
    return (
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ?? ''
    );
}

function generateCode(category: GarmentCategory, name: string): string {
    const normalized = name
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '')
        .slice(0, 20);

    const prefix = category === 'SHIRT' ? 'SH' : 'PT';
    const fallback = String(Date.now()).slice(-6);

    return `${prefix}-${normalized || fallback}`;
}

export default function GarmentTypesPage() {
    const {
        rows: initialRows,
        styles: initialStyles,
        selectedCategory,
        selectedStyle,
    } = usePage<PageProps>().props;
    const [styles, setStyles] = useState<GarmentStyleRow[]>(
        initialStyles ?? [],
    );
    const [rows, setRows] = useState<GarmentTypeRow[]>(initialRows);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<
        'all' | GarmentCategory
    >(selectedCategory ?? 'all');
    const [statusFilter, setStatusFilter] = useState<
        'all' | 'active' | 'inactive'
    >('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [error, setError] = useState<string | null>(null);

    /**
     * True when the page was opened by walking the list — category, then
     * length. Everything answered on the way here is shown back rather than
     * asked again: a filter that can contradict the walk, and columns whose
     * every cell reads the same.
     */
    const drilled = Boolean(selectedCategory && selectedStyle);
    /**
     * Creating from inside a length, the category and the length are already
     * settled — they are the list being looked at. Asking for them again in
     * the dialog is asking the reader to repeat themselves, and lets them
     * answer differently from the page they are standing on. Editing still
     * offers both, because moving a garment to the right length is a real
     * thing to want.
     */
    const factsAreSettled = drilled && editId === null;
    const drilledTitle = drilled
        ? styleLabelFrom(
              styles,
              selectedCategory as GarmentCategory,
              selectedStyle === 'all' ? null : selectedStyle,
          )
        : '';

    const filteredRows = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();

        return rows
            .filter((row) => {
                const matchesSearch =
                    keyword.length === 0 ||
                    row.name.toLowerCase().includes(keyword);
                const matchesCategory =
                    categoryFilter === 'all' || row.category === categoryFilter;
                const matchesStyle =
                    !selectedStyle ||
                    (selectedStyle === 'all'
                        ? row.style === null
                        : row.style === selectedStyle);
                const matchesStatus =
                    statusFilter === 'all' ||
                    (statusFilter === 'active' && row.is_active) ||
                    (statusFilter === 'inactive' && !row.is_active);

                return (
                    matchesSearch &&
                    matchesCategory &&
                    matchesStyle &&
                    matchesStatus
                );
            })
            .sort(
                (a, b) =>
                    a.category.localeCompare(b.category) ||
                    a.display_order - b.display_order ||
                    a.id - b.id,
            );
    }, [rows, searchTerm, categoryFilter, selectedStyle, statusFilter]);

    const openCreateModal = () => {
        setEditId(null);
        // Opened from inside a length, the new garment starts as that length:
        // the reader has already said which one they are working in.
        setForm({
            ...INITIAL_FORM,
            category: selectedCategory ?? INITIAL_FORM.category,
            style:
                selectedStyle && selectedStyle !== 'all'
                    ? (selectedStyle as GarmentStyle)
                    : INITIAL_FORM.style,
        });
        setError(null);
        setIsModalOpen(true);
    };

    const openEditModal = (row: GarmentTypeRow) => {
        setEditId(row.id);
        setForm({
            category: row.category,
            style: (row.style ?? 'short') as GarmentStyle,
            code: row.code,
            name: row.name,
            display_order: String(row.display_order),
            is_active: row.is_active,
        });
        setError(null);
        setIsModalOpen(true);
    };

    const saveForm = async () => {
        const resolvedCode =
            form.code.trim().length > 0
                ? form.code.trim().toUpperCase()
                : generateCode(form.category, form.name);

        const payload = {
            category: form.category,
            style: form.style,
            code: resolvedCode,
            name: form.name.trim(),
            display_order: Number.parseInt(form.display_order || '0', 10) || 0,
            is_active: form.is_active,
        };

        if (!payload.name) {
            setError('กรุณากรอกประเภท และชื่อ');

            return;
        }

        const endpoint =
            editId === null
                ? '/settings/data/garments/types'
                : `/settings/data/garments/types/${editId}`;
        const method = editId === null ? 'POST' : 'PUT';

        const response = await fetch(endpoint, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
                Accept: 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const body = (await response.json().catch(() => null)) as {
            message?: string;
            rows?: GarmentTypeRow[];
        } | null;

        if (!response.ok) {
            setError(body?.message ?? 'บันทึกข้อมูลไม่สำเร็จ');

            return;
        }

        if (Array.isArray(body?.rows)) {
            setRows(body.rows);
        }

        setIsModalOpen(false);
    };

    const toggleActive = async (row: GarmentTypeRow) => {
        const response = await fetch(
            `/settings/data/garments/types/${row.id}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    category: row.category,
                    code: row.code,
                    name: row.name,
                    display_order: row.display_order,
                    is_active: !row.is_active,
                }),
            },
        );

        const body = (await response.json().catch(() => null)) as {
            rows?: GarmentTypeRow[];
        } | null;

        if (response.ok && Array.isArray(body?.rows)) {
            setRows(body.rows);
        }
    };

    const deleteRow = async (row: GarmentTypeRow) => {
        const ok = window.confirm(`ยืนยันการลบ ${row.name} ใช่หรือไม่`);

        if (!ok) {
            return;
        }

        const response = await fetch(
            `/settings/data/garments/types/${row.id}`,
            {
                method: 'DELETE',
                headers: {
                    'X-CSRF-TOKEN': csrfToken(),
                    Accept: 'application/json',
                },
            },
        );

        const body = (await response.json().catch(() => null)) as {
            message?: string;
            rows?: GarmentTypeRow[];
        } | null;

        if (!response.ok) {
            setError(body?.message ?? 'ลบข้อมูลไม่สำเร็จ');
            setIsModalOpen(true);

            return;
        }

        if (Array.isArray(body?.rows)) {
            setRows(body.rows);
        }
    };

    // The lengths come first when a category has been opened but no length
    // picked yet. Each screen then answers one question instead of asking the
    // reader to set three filters before it shows anything.
    if (selectedCategory && !selectedStyle) {
        return (
            <StyleIndex
                category={selectedCategory}
                rows={rows.filter((row) => row.category === selectedCategory)}
                styles={stylesOf(styles, selectedCategory)}
                onStylesChange={setStyles}
            />
        );
    }

    return (
        <>
            <Head title="ประเภทเสื้อและกางเกง" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                {selectedCategory && selectedStyle ? (
                    <Link
                        href={`/settings/data/garments/types?category=${selectedCategory}`}
                        className="inline-flex w-fit items-center gap-1 text-sm font-bold text-slate-500 transition hover:text-slate-900"
                    >
                        <ChevronLeft className="size-4" />
                        กลับไปเลือก
                        {selectedCategory === 'PANTS' ? 'ขา' : 'แขน'}
                    </Link>
                ) : null}

                <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            {drilled ? (
                                <>
                                    <h1 className="text-2xl font-semibold text-slate-900">
                                        {drilledTitle}
                                    </h1>
                                    <p className="mt-1 text-sm text-slate-600">
                                        ชิ้นงาน
                                        {selectedCategory === 'PANTS'
                                            ? 'กางเกง'
                                            : 'เสื้อ'}
                                        ที่ตัด{drilledTitle} — กดชิ้นไหนก็ได้
                                        เพื่อเข้าไปตั้งขั้นตอนงานและราคา
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                                        Garment Pricing
                                    </p>
                                    <h1 className="mt-2 text-2xl font-semibold text-slate-900">
                                        แยกประเภทเสื้อและกางเกง
                                    </h1>
                                    <p className="mt-2 text-sm text-slate-600">
                                        สร้างประเภทงาน เช่น เสื้อโปโล
                                        หรือกางเกงขาสั้น
                                        แล้วเข้าไปตั้งราคาเด็ก/ผู้ใหญ่
                                    </p>
                                </>
                            )}
                        </div>

                        <div className="flex w-full flex-wrap justify-start gap-2 xl:w-auto xl:justify-end">
                            <Button
                                onClick={openCreateModal}
                                className="gap-2 bg-[#E21E26] text-white hover:bg-[#C91820]"
                            >
                                <Plus className="size-4" />
                                {drilled
                                    ? `เพิ่มชิ้นงาน${drilledTitle}`
                                    : 'เพิ่มประเภท'}
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:px-5">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">
                                รายการประเภท
                            </h2>
                            <p className="text-sm text-slate-500">
                                ทั้งหมด {filteredRows.length} รายการ
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="relative min-w-0">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={searchTerm}
                                    onChange={(event) =>
                                        setSearchTerm(event.target.value)
                                    }
                                    placeholder="ค้นหาชื่อประเภท"
                                    className="bg-white pl-9"
                                />
                            </div>

                            {drilled ? null : (
                                <Select
                                    value={categoryFilter}
                                    onValueChange={(
                                        value: 'all' | GarmentCategory,
                                    ) => setCategoryFilter(value)}
                                >
                                    <SelectTrigger className="bg-white">
                                        <SelectValue placeholder="ประเภทสินค้า" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            ทุกประเภท
                                        </SelectItem>
                                        <SelectItem value="SHIRT">
                                            เสื้อ
                                        </SelectItem>
                                        <SelectItem value="PANTS">
                                            กางเกง
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            )}

                            <Select
                                value={statusFilter}
                                onValueChange={(
                                    value: 'all' | 'active' | 'inactive',
                                ) => setStatusFilter(value)}
                            >
                                <SelectTrigger className="bg-white">
                                    <SelectValue placeholder="สถานะ" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        ทุกสถานะ
                                    </SelectItem>
                                    <SelectItem value="active">
                                        เปิดใช้งาน
                                    </SelectItem>
                                    <SelectItem value="inactive">
                                        ปิดใช้งาน
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    {drilled ? null : (
                                        <>
                                            <th className="w-[120px] px-4 py-3 text-left font-semibold text-slate-700">
                                                กลุ่ม
                                            </th>
                                            <th className="w-[110px] px-4 py-3 text-left font-semibold text-slate-700">
                                                แขน / ขา
                                            </th>
                                        </>
                                    )}
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                        ชื่อประเภท
                                    </th>
                                    <th className="w-[150px] px-4 py-3 text-left font-semibold text-slate-700">
                                        สถานะ
                                    </th>
                                    <th className="w-[380px] px-4 py-3 text-left font-semibold text-slate-700">
                                        จัดการ
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRows.length === 0 ? (
                                    <tr>
                                        <td
                                            className="px-4 py-5 text-center text-slate-500"
                                            colSpan={5}
                                        >
                                            {drilled &&
                                            searchTerm.trim() === '' &&
                                            statusFilter === 'all'
                                                ? `ยังไม่มีชิ้นงานที่ตัด${drilledTitle} — กดปุ่มด้านบนเพื่อสร้าง`
                                                : 'ไม่พบข้อมูลที่ตรงกับเงื่อนไข'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="hover:bg-slate-50/60"
                                        >
                                            {drilled ? null : (
                                                <>
                                                    <td className="px-4 py-3 align-top text-slate-700">
                                                        {row.category ===
                                                        'SHIRT'
                                                            ? 'เสื้อ'
                                                            : 'กางเกง'}
                                                    </td>
                                                    <td className="px-4 py-3 align-top text-slate-700">
                                                        {styleLabelFrom(
                                                            styles,
                                                            row.category,
                                                            row.style,
                                                        )}
                                                    </td>
                                                </>
                                            )}
                                            <td className="px-4 py-3 align-top">
                                                <Link
                                                    href={`/settings/data/garments/prices?garment_type_id=${row.id}&category=${row.category}`}
                                                    className="font-semibold text-slate-900 underline-offset-4 hover:text-[#E21E26] hover:underline"
                                                >
                                                    {row.name}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <Button
                                                    variant={
                                                        row.is_active
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                    size="sm"
                                                    onClick={() =>
                                                        toggleActive(row)
                                                    }
                                                    className="gap-1"
                                                >
                                                    <Power className="size-4" />
                                                    {row.is_active
                                                        ? 'เปิดใช้งาน'
                                                        : 'ปิดใช้งาน'}
                                                </Button>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button
                                                        asChild
                                                        size="sm"
                                                        className="bg-[#E21E26] text-white hover:bg-[#C91820]"
                                                    >
                                                        <Link
                                                            href={`/settings/data/garments/prices?garment_type_id=${row.id}&category=${row.category}`}
                                                        >
                                                            ตั้งขั้นตอน + ราคา
                                                        </Link>
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() =>
                                                            openEditModal(row)
                                                        }
                                                        className="gap-1"
                                                    >
                                                        <Pencil className="size-4" />
                                                        แก้ไข
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() =>
                                                            deleteRow(row)
                                                        }
                                                        className="gap-1"
                                                    >
                                                        <Trash2 className="size-4" />
                                                        ลบ
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editId !== null
                                ? 'แก้ไขชิ้นงาน'
                                : factsAreSettled
                                  ? `เพิ่มชิ้นงาน${drilledTitle}`
                                  : 'เพิ่มประเภท'}
                        </DialogTitle>
                        <DialogDescription>
                            {factsAreSettled
                                ? 'ตั้งชื่อชิ้นงาน จากนั้นเข้าไปใส่ขั้นตอนงานและราคา'
                                : 'กำหนดว่าเป็นเสื้อหรือกางเกง จากนั้นค่อยเพิ่มรายการราคา'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                ประเภทสินค้า
                            </label>
                            {factsAreSettled ? (
                                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                                    {form.category === 'PANTS'
                                        ? 'กางเกง'
                                        : 'เสื้อ'}
                                </p>
                            ) : (
                                <Select
                                    value={form.category}
                                    onValueChange={(value: GarmentCategory) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            category: value,
                                            // Trousers are never sleeveless, so
                                            // switching to them cannot leave that
                                            // answer sitting in the field.
                                            style: stylesOf(styles, value).some(
                                                (option) =>
                                                    option.code === prev.style,
                                            )
                                                ? prev.style
                                                : (stylesOf(styles, value)[0]
                                                      ?.code ?? ''),
                                        }))
                                    }
                                >
                                    <SelectTrigger className="bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="SHIRT">
                                            เสื้อ
                                        </SelectItem>
                                        <SelectItem value="PANTS">
                                            กางเกง
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                {form.category === 'PANTS' ? 'ขา' : 'แขน'}
                            </label>
                            {factsAreSettled ? (
                                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                                    {styleLabelFrom(
                                        styles,
                                        form.category,
                                        form.style,
                                    )}
                                </p>
                            ) : (
                                <Select
                                    value={form.style}
                                    onValueChange={(value) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            style: value as GarmentStyle,
                                        }))
                                    }
                                >
                                    <SelectTrigger className="bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {stylesOf(styles, form.category).map(
                                            (option) => (
                                                <SelectItem
                                                    key={option.code}
                                                    value={option.code}
                                                >
                                                    {option.name}
                                                </SelectItem>
                                            ),
                                        )}
                                    </SelectContent>
                                </Select>
                            )}
                            <p className="text-xs text-slate-500">
                                ความยาวเปลี่ยนขั้นตอนงาน ไม่ใช่แค่ราคา —
                                เสื้อแขนกุดไม่มีต่อแขนและลาปลายแขน
                                แต่มีกุ๊นวงแขนที่แบบอื่นไม่มี
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                ชื่อประเภท
                            </label>
                            <Input
                                value={form.name}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        name: event.target.value,
                                    }))
                                }
                                placeholder="เช่น เสื้อโปโล"
                                className="bg-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs text-slate-500">
                                ระบบจะจัดลำดับให้อัตโนมัติ
                                คุณแก้ได้ภายหลังถ้าจำเป็น
                            </p>
                        </div>

                        {error ? (
                            <p className="text-sm font-medium text-red-600">
                                {error}
                            </p>
                        ) : null}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsModalOpen(false)}
                        >
                            ยกเลิก
                        </Button>
                        <Button onClick={saveForm}>บันทึก</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

GarmentTypesPage.layout = (props: {
    currentTeam?: { slug: string } | null;
}) => ({
    breadcrumbs: [
        {
            title: 'เคาว์เตอร์',
            href: props.currentTeam ? `/${props.currentTeam.slug}/index` : '/',
        },
        {
            title: 'ข้อมูลพื้นฐาน',
            href: '/settings/data',
        },
        {
            title: 'ประเภทเสื้อและกางเกง',
            href: '/settings/data/garments/types',
        },
    ],
});

/**
 * The lengths a category is cut in, with what each one holds.
 *
 * A flat table could not say that สleeveless has nothing in it — it simply
 * showed nothing, which reads the same as a filter that matched nothing. Here
 * an empty length says so outright.
 */
function StyleIndex({
    category,
    rows,
    styles,
    onStylesChange,
}: {
    category: GarmentCategory;
    rows: GarmentTypeRow[];
    styles: GarmentStyleRow[];
    onStylesChange: (styles: GarmentStyleRow[]) => void;
}) {
    const [keyword, setKeyword] = useState('');
    const word = lengthWord(category);
    const title =
        category === 'PANTS' ? 'เซทราคาใบงานกางเกง' : 'เซทราคาใบงานเสื้อ';

    const buckets = styles.map((option) => {
        const items = rows.filter((row) => row.style === option.code);

        return {
            key: option.code,
            label: option.name,
            style: option,
            items,
            // Only a type that is switched on is offered when a bill is
            // opened. Counting the switched-off ones in with the rest read as
            // "this length is ready to sell" when it was not.
            activeItems: items.filter((row) => row.is_active),
        };
    });

    const hits =
        keyword.trim().length === 0
            ? []
            : rows.filter((row) =>
                  row.name.toLowerCase().includes(keyword.trim().toLowerCase()),
              );

    // Adding, renaming and retiring the lengths themselves. The shop sells a
    // three-quarter sleeve the week it decides to, without a developer.
    const [styleDialogOpen, setStyleDialogOpen] = useState(false);
    const [editingStyle, setEditingStyle] = useState<GarmentStyleRow | null>(
        null,
    );
    const [styleName, setStyleName] = useState('');
    const [styleActive, setStyleActive] = useState(true);
    const [styleError, setStyleError] = useState<string | null>(null);
    const [savingStyle, setSavingStyle] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<GarmentStyleRow | null>(
        null,
    );

    const openAddStyle = () => {
        setEditingStyle(null);
        setStyleName('');
        setStyleActive(true);
        setStyleError(null);
        setStyleDialogOpen(true);
    };

    const openEditStyle = (style: GarmentStyleRow) => {
        setEditingStyle(style);
        setStyleName(style.name);
        setStyleActive(style.is_active);
        setStyleError(null);
        setStyleDialogOpen(true);
    };

    const sendStyle = async (
        url: string,
        method: 'POST' | 'PUT' | 'DELETE',
        body?: Record<string, unknown>,
    ): Promise<boolean> => {
        setSavingStyle(true);
        setStyleError(null);

        try {
            const response = await fetch(url, {
                method,
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
                body: body ? JSON.stringify(body) : undefined,
            });

            const payload = (await response.json().catch(() => null)) as {
                styles?: GarmentStyleRow[];
                message?: string;
                errors?: Record<string, string[]>;
            } | null;

            if (!response.ok) {
                // The server refuses a delete that would strand bills, and
                // says how many. That sentence is the whole answer, so it is
                // shown rather than a generic failure.
                setStyleError(
                    Object.values(payload?.errors ?? {})[0]?.[0] ??
                        payload?.message ??
                        'บันทึกไม่สำเร็จ กรุณาลองใหม่',
                );

                return false;
            }

            if (payload?.styles) {
                onStylesChange(payload.styles);
            }

            return true;
        } catch {
            setStyleError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่');

            return false;
        } finally {
            setSavingStyle(false);
        }
    };

    const saveStyle = async () => {
        if (styleName.trim() === '') {
            setStyleError(`กรุณากรอกชื่อ${word}`);

            return;
        }

        const ok = editingStyle
            ? await sendStyle(
                  `/settings/data/garments/styles/${editingStyle.id}`,
                  'PUT',
                  {
                      name: styleName.trim(),
                      display_order: editingStyle.display_order,
                      is_active: styleActive,
                  },
              )
            : await sendStyle('/settings/data/garments/styles', 'POST', {
                  category,
                  name: styleName.trim(),
                  display_order: styles.length + 1,
                  is_active: styleActive,
              });

        if (ok) {
            setStyleDialogOpen(false);
        }
    };

    const toggleStyle = (style: GarmentStyleRow) =>
        void sendStyle(`/settings/data/garments/styles/${style.id}`, 'PUT', {
            name: style.name,
            display_order: style.display_order,
            is_active: !style.is_active,
        });

    const confirmDelete = async () => {
        if (!pendingDelete) {
            return;
        }

        const ok = await sendStyle(
            `/settings/data/garments/styles/${pendingDelete.id}`,
            'DELETE',
        );

        if (ok) {
            setPendingDelete(null);
        }
    };

    return (
        <>
            <Head title={title} />

            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:gap-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">
                            {title}
                        </h1>
                        <p className="mt-0.5 text-sm text-slate-500">
                            เลือก{word}ที่ต้องการ
                            แล้วเข้าไปตั้งขั้นตอนงานและราคา
                        </p>
                    </div>
                    <Button type="button" onClick={openAddStyle}>
                        <Plus className="size-4" />
                        เพิ่ม{word}
                    </Button>
                </div>

                <Input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder={`ค้นหาชื่อชิ้นงานข้ามทุก${word}`}
                    className="max-w-sm bg-white"
                />

                {hits.length > 0 ? (
                    <div className="grid gap-2">
                        {hits.map((row) => (
                            <Link
                                key={row.id}
                                href={`/settings/data/garments/prices?garment_type_id=${row.id}&category=${row.category}`}
                                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition hover:border-[#E21E26]"
                            >
                                <span className="font-semibold text-slate-900">
                                    {row.name}
                                </span>
                                <span className="text-xs text-slate-500">
                                    {styleLabelFrom(
                                        styles,
                                        row.category,
                                        row.style,
                                    )}
                                </span>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="grid gap-2.5">
                        {buckets.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                                ยังไม่มี{word} กด "เพิ่ม{word}"
                                เพื่อสร้างรายการแรก
                            </p>
                        ) : null}
                        {buckets.map((bucket) => (
                            <div
                                key={bucket.key}
                                className={`flex items-center gap-2 rounded-xl border bg-white pr-2 transition hover:shadow-sm ${
                                    bucket.style.is_active
                                        ? 'border-slate-200 hover:border-[#E21E26]'
                                        : 'border-slate-200 bg-slate-50'
                                }`}
                            >
                                <Link
                                    href={`/settings/data/garments/types?category=${category}&style=${bucket.key}`}
                                    className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-4"
                                >
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-2">
                                            <span className="truncate text-[15px] font-bold text-slate-900">
                                                {bucket.label}
                                            </span>
                                            {!bucket.style.is_active ? (
                                                <span className="shrink-0 rounded border border-slate-300 px-1.5 text-[11px] text-slate-500">
                                                    ปิดใช้งาน
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                                            {bucket.activeItems.length > 0
                                                ? `${bucket.activeItems.length} ชิ้นงาน · ${bucket.activeItems
                                                      .map((row) => row.name)
                                                      .slice(0, 3)
                                                      .join(
                                                          ', ',
                                                      )}${bucket.activeItems.length > 3 ? ' …' : ''}`
                                                : bucket.items.length > 0
                                                  ? `${bucket.items.length} ชิ้นงาน · ปิดใช้งานทั้งหมด`
                                                  : 'ยังไม่มีชิ้นงาน'}
                                        </span>
                                    </span>
                                    <ChevronRight className="size-4 shrink-0 text-slate-300" />
                                </Link>

                                <span className="flex shrink-0 items-center gap-1">
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        title={`แก้ไขชื่อ${word}`}
                                        aria-label={`แก้ไข ${bucket.label}`}
                                        onClick={() =>
                                            openEditStyle(bucket.style)
                                        }
                                    >
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        title={
                                            bucket.style.is_active
                                                ? 'ปิดการใช้งาน'
                                                : 'เปิดการใช้งาน'
                                        }
                                        aria-label={`${bucket.style.is_active ? 'ปิด' : 'เปิด'}การใช้งาน ${bucket.label}`}
                                        onClick={() =>
                                            toggleStyle(bucket.style)
                                        }
                                    >
                                        <Power
                                            className={`size-4 ${bucket.style.is_active ? 'text-emerald-600' : 'text-slate-400'}`}
                                        />
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        title={`ลบ${word}`}
                                        aria-label={`ลบ ${bucket.label}`}
                                        onClick={() =>
                                            setPendingDelete(bucket.style)
                                        }
                                        className="text-slate-400 hover:text-[#E21E26]"
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Dialog open={styleDialogOpen} onOpenChange={setStyleDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {editingStyle ? `แก้ไข${word}` : `เพิ่ม${word}`}
                        </DialogTitle>
                        <DialogDescription>
                            {editingStyle
                                ? `เปลี่ยนชื่อที่แสดง หรือปิดไม่ให้เลือก${word}นี้ในบิลใหม่`
                                : `เช่น ${category === 'PANTS' ? 'ขาสามส่วน' : 'แขนสามส่วน'} — จะมีใบงานผลิตและราคาค่าแรงเป็นของตัวเอง`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3">
                        <label className="grid gap-1.5 text-sm">
                            <span className="font-medium text-slate-700">
                                ชื่อ{word}
                            </span>
                            <Input
                                value={styleName}
                                onChange={(event) =>
                                    setStyleName(event.target.value)
                                }
                                placeholder={
                                    category === 'PANTS'
                                        ? 'เช่น ขาสามส่วน'
                                        : 'เช่น แขนสามส่วน'
                                }
                                className="bg-white"
                            />
                        </label>

                        <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={styleActive}
                                onChange={(event) =>
                                    setStyleActive(event.target.checked)
                                }
                                className="size-4"
                            />
                            เปิดใช้งาน (ให้เลือกได้ตอนเปิดบิล)
                        </label>

                        {editingStyle ? (
                            // The code is on every bill sold at this length
                            // and inside every sheet key, so it is shown and
                            // not offered for editing.
                            <p className="text-xs text-slate-500">
                                รหัสภายใน:{' '}
                                <span className="font-mono">
                                    {editingStyle.code}
                                </span>{' '}
                                · เปลี่ยนไม่ได้เพราะบิลเก่าอ้างอิงอยู่
                            </p>
                        ) : null}

                        {styleError ? (
                            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-[#E21E26]">
                                {styleError}
                            </p>
                        ) : null}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setStyleDialogOpen(false)}
                            disabled={savingStyle}
                        >
                            ยกเลิก
                        </Button>
                        <Button
                            type="button"
                            onClick={saveStyle}
                            disabled={savingStyle}
                        >
                            {savingStyle ? 'กำลังบันทึก…' : 'บันทึก'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={pendingDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingDelete(null);
                        setStyleError(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            ลบ{word} {pendingDelete?.name}
                        </DialogTitle>
                        <DialogDescription>
                            {pendingDelete &&
                            (pendingDelete.garment_type_count > 0 ||
                                pendingDelete.billed_line_count > 0)
                                ? `${word}นี้ถูกใช้อยู่ — มีชิ้นงาน ${pendingDelete.garment_type_count} รายการ และบิลที่ขายไปแล้ว ${pendingDelete.billed_line_count} รายการ ลบแล้วบิลเก่าจะอ่านไม่ออก แนะนำให้ปิดการใช้งานแทน`
                                : `ยังไม่มีชิ้นงานหรือบิลใดใช้${word}นี้ ลบแล้วกู้คืนไม่ได้`}
                        </DialogDescription>
                    </DialogHeader>

                    {styleError ? (
                        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-[#E21E26]">
                            {styleError}
                        </p>
                    ) : null}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPendingDelete(null)}
                            disabled={savingStyle}
                        >
                            ยกเลิก
                        </Button>
                        <Button
                            type="button"
                            onClick={confirmDelete}
                            disabled={savingStyle}
                            className="bg-[#E21E26] text-white hover:bg-[#C91820]"
                        >
                            {savingStyle ? 'กำลังลบ…' : 'ลบ'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
