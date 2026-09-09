# Order Management UI Theme: Sidebar + Timeline Button

เอกสารนี้ใช้เป็นมาตรฐานเดียวในการคุมงาน UI ของโปรเจกต์ โดยอ้างอิงจากโค้ดที่ใช้งานจริง

## 1) Brand Color Palette (Approved)

- Primary Red: #E21E26 (RGB 226, 30, 38)
- Primary Blue: #174395 (RGB 23, 67, 149)
- Blue Hover: #12367A (RGB 18, 54, 122)
- White: #FFFFFF (RGB 255, 255, 255)

## 2) Global Token Baseline

อ้างอิงไฟล์ resources/css/app.css

- --primary: #E21E26
- --primary-foreground: #ffffff
- --ring: #E21E26

Sidebar tokens

- --sidebar: #111318
- --sidebar-foreground: #cbd5e1
- --sidebar-primary: #E21E26
- --sidebar-primary-foreground: #ffffff
- --sidebar-accent: #E21E26
- --sidebar-accent-foreground: #ffffff
- --sidebar-border: #2b313d
- --sidebar-ring: #E21E26

## 3) Component Spec: Sidebar

อ้างอิงไฟล์ resources/js/components/ui/sidebar.tsx

Sidebar menu active state

- background: #E21E26
- text: #FFFFFF
- radius: rounded-xl
- shadow: shadow-sm

Class (source of truth)

- bg-[#E21E26] text-white rounded-xl shadow-sm

ใช้กับทั้ง

- sidebarMenuButtonVariants.active.true
- sidebarMenuSubButtonVariants.active.true

## 4) Component Spec: Timeline Button

ใช้เหมือนกันทั้งหน้า Counter และหน้า Production

Visual spec

- Background: #174395
- Border: #174395
- Text: #FFFFFF
- Hover background: #12367A
- Hover border: #12367A
- Hover text: #FFFFFF

Class (source of truth)

- h-7 border-[#174395] bg-[#174395] px-2 text-[11px] text-white transition-colors duration-150 ease-out hover:border-[#12367A] hover:bg-[#12367A] hover:text-white

Applied in

- resources/js/pages/Counter.tsx
- resources/js/components/domain/production/ProductionKanbanBoard.tsx

## 5) Do/Don't สำหรับความสม่ำเสมอ

Do

- ใช้ค่า HEX ตามเอกสารนี้ตรงๆ
- ใช้คลาส Timeline Button เดียวกันทั้ง Counter และ Production
- ใช้ active state ของ Sidebar ตาม variant ที่กำหนด

Don't

- ห้ามสลับไปใช้โทน cyan/amber/blue อื่นนอกเหนือจาก palette นี้โดยไม่อัปเดตเอกสาร
- ห้ามสร้างคลาสใหม่ที่ให้พฤติกรรม Timeline button แตกต่างจากมาตรฐาน

## 6) Fast QA Checklist

- ปุ่ม Timeline ใน Counter เป็นพื้นหลังน้ำเงินและตัวอักษรขาว
- ปุ่ม Timeline ใน Production เป็นพื้นหลังน้ำเงินและตัวอักษรขาว
- Sidebar active menu และ submenu เป็นแดงตัวอักษรขาว
- Hover ของ Timeline เป็น #12367A ทั้งสองหน้า

---

Last updated: 2026-07-30
Owner: Frontend UI Theme
