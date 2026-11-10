# SPEC — ปรับปรุงการค้นหาครุภัณฑ์ (Assets Search Enhancement)

> Module: Assets (ครุภัณฑ์) · Page: `src/app/dashboard/assets/page.tsx`
> Created: 2026-06-18

---

## 1. Objective (วัตถุประสงค์)

ทำให้การค้นหาครุภัณฑ์ในหน้า `/dashboard/assets` **ค้นหาง่ายและเร็วขึ้น** สำหรับเจ้าหน้าที่พัสดุ โดยลดการพิมพ์ซ้ำและช่วยกรองรายการจำนวนมาก (ปัจจุบัน ~414 รายการ) ให้แคบลงอย่างรวดเร็ว

**Target users:** เจ้าหน้าที่/ผู้ดูแลครุภัณฑ์ (role: MANAGER, ADMIN, SUPER_ADMIN, รวมถึง EMPLOYEE ที่ดูได้)

**ปัญหาปัจจุบัน:**
- ค้นหามีแค่ช่อง text เดียว กรอง client-side จาก `name / assetTag / serialNumber / model / brand`
- ไม่มีตัวกรองหมวดหมู่ / สถานที่ / แผนก ใน toolbar (มีแค่ status chips)
- ต้องพิมพ์คำค้นซ้ำทุกครั้ง ไม่มีประวัติ

---

## 2. Core Features & Acceptance Criteria

### F1 — ดรอปดาวน์ "คำที่เคยค้นหา" (Search History)
- เก็บคำค้นล่าสุดใน **`localStorage`** (key เฉพาะของหน้านี้ เช่น `assets:searchHistory`)
- เมื่อ focus ที่ช่องค้นหา (และช่องว่าง) → แสดงรายการคำที่เคยค้นล่าสุด
- คลิกคำในรายการ → เติมลงช่องค้นหาและกรองทันที
- บันทึกคำค้นเมื่อผู้ใช้ค้นจริง (เช่น เมื่อพิมพ์แล้วหยุด/มีผลลัพธ์ หรือกด Enter) — ไม่บันทึกทุก keystroke
- เก็บไม่เกิน **10 คำ** ล่าสุด, ไม่ซ้ำ (คำใหม่ดันขึ้นบนสุด), ตัดคำว่าง/ช่องว่างล้วนทิ้ง
- มีปุ่มลบคำเดี่ยว (×) และ/หรือ "ล้างประวัติทั้งหมด"
- **AC:** รีเฟรชหน้าแล้วประวัติยังอยู่ · เปิด incognito/ล้าง storage แล้วประวัติหาย · ไม่มีคำซ้ำ · ไม่เกิน 10 รายการ

### F2 — Autocomplete ในช่องค้นหา (suggestions จากข้อมูลจริง)
- ขณะพิมพ์ แสดง suggestion จากค่าจริงในชุดข้อมูล `assets` ได้แก่ `name`, `assetTag`, `brand`, `model` ที่ match กับคำพิมพ์
- รวมกับ F1: เมื่อช่องว่าง = แสดงประวัติ; เมื่อพิมพ์ = แสดง suggestion ที่ match (จำกัดจำนวน เช่น 8 รายการ)
- คลิก suggestion → เติมและกรองทันที
- **AC:** พิมพ์บางส่วนของชื่อ/รหัส แล้วเห็นรายการ match แบบ case-insensitive และรองรับภาษาไทย

### F3 — ดรอปดาวน์ตัวกรอง: หมวดหมู่ / สถานที่ / แผนก
- เพิ่ม `<select>` 3 ตัวใน toolbar ใต้/ข้างช่องค้นหา:
  - **หมวดหมู่** — ตัวเลือกจาก `categories` (state ที่ดึงมาแล้ว)
  - **สถานที่** — ตัวเลือก distinct จาก `assets[].location` (เรียงแบบไทย)
  - **แผนก** — ตัวเลือก distinct จาก `assets[].department` (เรียงแบบไทย)
- ทุกตัวมี option แรก "-- ทั้งหมด --" (ค่าว่าง = ไม่กรอง)
- ตัวกรองทำงาน **ร่วมกัน (AND)** กับ search text และ status chip ที่มีอยู่เดิม
- มีปุ่ม "ล้างตัวกรอง" รวมเมื่อมีตัวกรองใด active (รวม status เดิม)
- ตัวนับ `{filteredAssets.length} รายการ` อัปเดตตามผลกรองรวม
- **AC:** เลือกหมวดหมู่+สถานที่พร้อมกัน → เห็นเฉพาะรายการที่ตรงทั้งสอง · ล้างแล้วกลับมาครบ

### Non-goals (ไม่ทำในรอบนี้)
- ไม่ย้ายการค้นหา/กรองไปทำที่ฝั่ง server/API (ยังกรอง client-side เหมือนเดิม)
- ไม่เพิ่ม pagination
- ไม่แก้ schema / Prisma / migration
- ไม่เก็บประวัติค้นหาใน DB (เป็น per-browser ผ่าน localStorage)

---

## 3. Project Structure / Touch Points

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/app/dashboard/assets/page.tsx` | งานหลักทั้งหมด — state ใหม่, ตัวกรอง, ดรอปดาวน์, logic ค้นหา |
| (อาจเพิ่ม) hook เล็ก ๆ ในไฟล์เดียวกัน | `useSearchHistory` แบบ local helper ถ้าช่วยให้อ่านง่ายขึ้น — ไม่บังคับแยกไฟล์ |

- **ไม่** สร้าง API ใหม่ · **ไม่** แตะ `api/assets`, `api/asset-categories`
- คงรูปแบบเดิม: client component (`'use client'`), Tailwind utility classes, lucide-react icons, helper `cn()`

---

## 4. Code Style

- ตามแนวเดิมของไฟล์ทั้งหมด: TypeScript, React hooks, ฟังก์ชัน helper ด้านบนไฟล์
- ใช้ pattern ดรอปดาวน์ autocomplete เดิมที่มีในฟอร์ม (brand/model/location/department) เป็นต้นแบบ — `onFocus`/`onBlur` พร้อม `setTimeout(...,150)`, `onMouseDown` สำหรับเลือก, distinct ด้วย `[...new Set(...)]`, sort ด้วย `localeCompare(.., 'th')`
- UI ภาษาไทยทั้งหมด, สีและ spacing ตาม theme เดิม (indigo/slate, `rounded-lg`, `text-sm`)
- localStorage access ต้อง guard `typeof window !== 'undefined'` และ try/catch กัน JSON พัง
- ไม่เพิ่ม dependency ใหม่

---

## 5. Testing Strategy

ตรวจด้วยมือบน dev server (ตามลักษณะหน้าจอ admin):
1. **F1:** ค้นหลายคำ → refresh → เห็นประวัติ; เลือกจากประวัติ → กรองถูก; ลบ/ล้างได้; ไม่เกิน 10 และไม่ซ้ำ
2. **F2:** พิมพ์บางส่วน (ไทย+อังกฤษ) → เห็น suggestion match; คลิกแล้วกรอง
3. **F3:** เลือกหมวดหมู่/สถานที่/แผนก เดี่ยวและรวมกัน + ร่วมกับ status chip และ search → ผลถูกต้อง (AND); ปุ่มล้างคืนค่าครบ; ตัวนับถูก
4. **Regression:** การ ยืม/คืน/แก้ไข/ลบ/Export/หมวดหมู่/ประวัติ/ตรวจสภาพ ยังทำงานปกติ
5. Build ผ่าน: `pnpm build` (หรือ typecheck) ไม่มี error ใหม่

> หมายเหตุ: โปรเจกต์นี้ไม่มี test runner สำหรับ UI — ใช้ manual verification + typecheck/build เป็นเกณฑ์

---

## 6. Boundaries

**Always (ทำเสมอ):**
- กรอง client-side เหมือนเดิม, รวมตัวกรองทั้งหมดแบบ AND
- รองรับภาษาไทย (localeCompare/`toLowerCase`)
- guard localStorage และไม่ทำให้หน้าพังถ้า storage ใช้ไม่ได้
- รักษาความสามารถเดิมทั้งหมดของหน้า assets

**Ask first (ถามก่อน):**
- ถ้าจะแตะ API / Prisma / schema
- ถ้าจะเพิ่ม dependency หรือแยก component/ไฟล์ใหม่ขนาดใหญ่
- ถ้าจะเปลี่ยน UX หลัก (เช่น ย้าย search ไป server-side, ใส่ pagination)

**Never (ห้าม):**
- ห้าม commit/push เว้นแต่ผู้ใช้สั่ง
- ห้ามแก้โมดูลอื่น (employees/leaves/supplies) โดยไม่จำเป็น
- ห้ามเก็บข้อมูล sensitive ลง localStorage (เก็บแค่ string คำค้นทั่วไป)
- ห้ามส่งข้อมูลขึ้น cloud (ตาม routing rule ของ TRD)

---

## ✅ Implementation Outline (ลำดับงานหลังอนุมัติ)
1. เพิ่ม state: `categoryFilter`, `locationFilter`, `departmentFilter`, `searchHistory`, `searchFocused`
2. โหลด/บันทึก `searchHistory` ↔ localStorage (helper + effect)
3. ขยาย `filteredAssets` ให้รวม category/location/department (AND)
4. แก้ block Search ให้มีดรอปดาวน์ประวัติ+autocomplete (อิง pattern เดิมในฟอร์ม)
5. เพิ่มแถวดรอปดาวน์ตัวกรอง 3 ตัว + ปุ่มล้างตัวกรองรวม + ตัวนับ
6. ทดสอบตาม §5 และ build
