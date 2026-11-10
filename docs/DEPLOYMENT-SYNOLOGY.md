# EMS Admin - Employee Management System

ระบบบันทึกและจัดการพนักงานครบวงจร พัฒนาด้วย Next.js + TypeScript + MariaDB

## คุณสมบัติหลัก

- **ระบบจัดการพนักงาน** - เพิ่ม ลบ แก้ไขข้อมูลพนักงาน
- **ระบบจัดการงาน (Kanban)** - ติดตามสถานะงานแบบ Drag & Drop
- **ระบบบันทึกการลา** - ยื่นคำขอลาและอนุมัติผ่านระบบ
- **แดชบอร์ดสถิติ** - ภาพรวมของระบบทั้งหมด
- **ระบบความปลอดภัย** - Authentication แบบเข้มข้น พร้อมการป้องกัน Brute Force, XSS, SQL Injection

## สถาปัตยกรรมระบบ

```
┌─────────────────────────────────────────────────────────────┐
│                    Synology NAS                              │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  Container      │    │         Web Station              │ │
│  │  Manager        │    │                                  │ │
│  │                 │    │  ┌──────────────────────────┐   │ │
│  │  ┌───────────┐  │    │  │   Next.js Frontend       │   │ │
│  │  │ MariaDB 10│  │    │  │   (Port 3000)            │   │ │
│  │  │ (Port     │◄─┼────┼──┤                          │   │ │
│  │  │  3306)    │  │    │  │  - React Components      │   │ │
│  │  └───────────┘  │    │  │  - API Routes            │   │ │
│  │                 │    │  │  - Server-side Rendering │   │ │
│  └─────────────────┘    │  └──────────────────────────┘   │ │
│                         └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## ความต้องการของระบบ

- **Node.js** 18.x หรือสูงกว่า
- **MariaDB** 10.x
- **npm** หรือ **yarn**

## การติดตั้ง

### 1. ติดตั้ง MariaDB บน Synology NAS

#### วิธีที่ 1: ใช้ Container Manager

1. เปิด **Container Manager** บน Synology NAS
2. สร้างโปรเจกต์ใหม่และใช้ไฟล์ `docker-compose.yml` นี้
3. รันคำสั่ง:

```bash
# รัน MariaDB อย่างเดียว
docker-compose up -d

# รัน MariaDB + phpMyAdmin (สำหรับจัดการฐานข้อมูล)
docker-compose --profile admin up -d
```

4. phpMyAdmin จะอยู่ที่ `http://your-synology-ip:8080`

#### วิธีที่ 2: ใช้ Package Center

1. ติดตั้ง **MariaDB 10** จาก Package Center
2. ติดตั้ง **phpMyAdmin** จาก Package Center (optional)
3. สร้าง database และ user ผ่าน phpMyAdmin:

```sql
CREATE DATABASE ems_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ems_user'@'%' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON ems_db.* TO 'ems_user'@'%';
FLUSH PRIVILEGES;
```

### 2. ตั้งค่าโปรเจกต์

1. คัดลอกไฟล์ `.env.example` เป็น `.env`:

```bash
cp .env.example .env
```

2. แก้ไขค่าใน `.env`:

```env
# การเชื่อมต่อ MariaDB
DATABASE_URL="mysql://ems_user:your_password@your-synology-ip:3306/ems_db"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-min-32-characters-long"
NEXTAUTH_URL="http://localhost:3000"

# ความปลอดภัย
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=30
SESSION_EXPIRY_HOURS=24
```

### 3. ติดตั้ง Dependencies

```bash
npm install
```

### 4. สร้างตารางฐานข้อมูล

```bash
# สร้าง migration
npx prisma migrate dev --name init

# หรือใช้ db push (สำหรับ development)
npx prisma db push
```

### 5. Seed ข้อมูลเริ่มต้น

```bash
npm run db:seed
```

ข้อมูลเริ่มต้น:
- **Admin**: username: `admin`, password: `admin123`
- **Users**: 4 คน (พร้อมข้อมูลตัวอย่าง)

### 6. รันแอปพลิเคชัน

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

เข้าใช้งานที่ `http://localhost:3000`

## การ Deploy บน Synology Web Station

### 1. Build โปรเจกต์

```bash
npm run build
```

### 2. คัดลอกไฟล์ไปยัง Web Station

```bash
# คัดลอกไฟล์ทั้งหมดไปยังโฟลเดอร์ของ Web Station
rsync -avz --exclude=node_modules --exclude=.git ./ admin@your-synology-ip:/volume1/web/ems-app/
```

### 3. ตั้งค่า Web Station

1. เปิด **Web Station** บน DSM
2. สร้าง Virtual Host ใหม่:
   - **Hostname**: ems.your-domain.com (หรือ IP)
   - **Document Root**: `/web/ems-app`
   - **Port**: 3000 (หรือพอร์ตที่ต้องการ)
   - **HTTPS**: แนะนำให้เปิดใช้งาน

### 4. ตั้งค่า Reverse Proxy (แนะนำ)

1. ไปที่ **Control Panel** > **Application Portal** > **Reverse Proxy**
2. สร้าง rule ใหม่:
   - **Source**: `https://ems.your-domain.com`
   - **Destination**: `http://localhost:3000`

### 5. ตั้งค่าระบบแจ้งเตือน (Reminder Cron)

ใช้รูปแบบเดียวกันทั้ง Synology และ Linux server:
`Task Scheduler / cron → scripts/cron-reminders.sh (curl) → Next.js API → Prisma → MariaDB → LINE`

ดูขั้นตอนเต็ม (Synology Task Scheduler / Linux crontab / systemd timer) ใน
[docs/CRON_SETUP.md](docs/CRON_SETUP.md)

## โครงสร้างโปรเจกต์

```
ems-admin/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.ts            # Seed data
├── src/
│   ├── app/
│   │   ├── api/           # API Routes
│   │   │   ├── auth/      # Authentication APIs
│   │   │   ├── users/     # User APIs
│   │   │   ├── tasks/     # Task APIs
│   │   │   ├── leaves/    # Leave APIs
│   │   │   └── dashboard/ # Dashboard APIs
│   │   ├── dashboard/     # Dashboard pages
│   │   │   ├── page.tsx   # Dashboard home
│   │   │   ├── tasks/     # Tasks page
│   │   │   ├── leaves/    # Leaves page
│   │   │   └── employees/ # Employees page
│   │   ├── page.tsx       # Login page
│   │   └── layout.tsx     # Root layout
│   ├── components/        # React components
│   ├── lib/
│   │   ├── prisma.ts      # Prisma client
│   │   ├── auth.ts        # Auth utilities
│   │   ├── security.ts    # Security functions
│   │   └── utils.ts       # Utility functions
│   └── types/
│       └── index.ts       # TypeScript types
├── docker-compose.yml     # Docker Compose config
├── next.config.js         # Next.js config
├── tailwind.config.ts     # Tailwind CSS config
├── tsconfig.json          # TypeScript config
└── package.json           # Dependencies
```

## ระบบความปลอดภัย

### Authentication
- Session-based authentication ด้วย secure cookies
- รหัสผ่านเข้ารหัสด้วย bcrypt (12 rounds)
- Session หมดอายุอัตโนมัติหลัง 24 ชั่วโมง

### การป้องกัน Brute Force
- จำกัดจำนวนครั้งการเข้าสู่ระบบผิดพลาด (5 ครั้ง)
- บล็อก IP เป็นเวลา 30 นาทีหากเกินกำหนด
- บันทึกประวัติการพยายามเข้าสู่ระบบทั้งหมด

### การป้องกัน XSS
- Sanitize ข้อมูล input ทั้งหมด
- Content Security Policy (CSP) headers
- Escape HTML entities

### การป้องกัน SQL Injection
- ใช้ Prisma ORM (Parameterized queries)
- ตรวจสอบ patterns ที่น่าสงสัย
- Input validation ด้วย Zod schema

### Security Headers
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security`
- `Content-Security-Policy`

## API Documentation

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | เข้าสู่ระบบ |
| POST | `/api/auth/logout` | ออกจากระบบ |
| GET | `/api/auth/session` | ตรวจสอบ session |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | ดึงรายชื่อผู้ใช้ทั้งหมด |
| POST | `/api/users` | สร้างผู้ใช้ใหม่ |
| GET | `/api/users/[id]` | ดึงข้อมูลผู้ใช้ |
| PATCH | `/api/users/[id]` | อัปเดตข้อมูลผู้ใช้ |
| DELETE | `/api/users/[id]` | ลบผู้ใช้ |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | ดึงรายการงานทั้งหมด |
| POST | `/api/tasks` | สร้างงานใหม่ |
| PATCH | `/api/tasks/[id]` | อัปเดตงาน |
| DELETE | `/api/tasks/[id]` | ลบงาน |

### Leaves

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leaves` | ดึงรายการลาทั้งหมด |
| POST | `/api/leaves` | สร้างรายการลา |
| PATCH | `/api/leaves/[id]` | อนุมัติ/ไม่อนุมัติการลา |
| DELETE | `/api/leaves/[id]` | ลบรายการลา |

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | ดึงข้อมูลสถิติแดชบอร์ด |

## คำสั่งที่ใช้บ่อย

```bash
# Development
npm run dev              # รัน development server
npm run build            # Build สำหรับ production
npm start                # รัน production server

# Database
npm run db:generate      # สร้าง Prisma client
npm run db:migrate       # รัน migration
npm run db:studio        # เปิด Prisma Studio
npm run db:seed          # Seed ข้อมูลเริ่มต้น

# Lint
npm run lint             # ตรวจสอบโค้ด
```

## การแก้ไขปัญหา

### ปัญหาการเชื่อมต่อ MariaDB

```bash
# ตรวจสอบว่า MariaDB รันอยู่หรือไม่
docker ps | grep mariadb

# ดู logs
docker logs ems-mariadb

# ทดสอบการเชื่อมต่อ
mysql -h your-synology-ip -P 3306 -u ems_user -p
```

### ปัญหา Prisma

```bash
# รีเซ็ต Prisma
npx prisma generate
npx prisma db push

# ดู query logs
DEBUG="prisma:*" npm run dev
```

## 🎓 เรียนรู้การทำงานของฟีเจอร์ค้นหา (Step-by-step สำหรับผู้เริ่มต้น)

ส่วนนี้อธิบายว่า **ฟีเจอร์ค้นหา** ในระบบทำงานอย่างไร ตั้งแต่ผู้ใช้พิมพ์คำค้นหา จนถึงผลลัพธ์ขึ้นมาแสดงบนหน้าจอ โดยใช้ตัวอย่างจริงจาก **หน้า "การลา" (Leaves)** ซึ่งมี flow ครบทุกขั้นตอน ทุกโค้ดที่แปะไว้เป็นโค้ดจริงในโปรเจกต์ (มีระบุไฟล์ + เลขบรรทัดกำกับ) เปิดไฟล์จริงตามไปดูควบคู่กันได้เลย

ไฟล์หลักที่เกี่ยวข้อง:
- `src/app/dashboard/leaves/page.tsx` — หน้าจอฝั่งผู้ใช้ (input, ปุ่ม, การแสดงผล)
- `src/app/api/leaves/search/route.ts` — API ฝั่ง server ที่ค้นข้อมูลในฐานข้อมูล

### ขั้นที่ 1 — วางช่องกรอกค้นหา (Input Box)

ก่อนอื่นต้องมีช่องให้ผู้ใช้พิมพ์คำค้นหา ในหน้า Leaves มี 2 แบบ คือค้นด้วยชื่อ กับค้นด้วยวันที่ (`src/app/dashboard/leaves/page.tsx:912-936`):

```tsx
<input
  type="text"
  placeholder="พิมพ์ชื่อพนักงาน..."
  value={searchName}
  onChange={(e) => setSearchName(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }}
  className="w-full pl-10 pr-4 py-2 rounded-lg border ..."
/>
```

- `value={searchName}` ผูกช่อง input เข้ากับตัวแปร state ชื่อ `searchName` — นี่คือสิ่งที่ทำให้ input "จำ" ค่าที่พิมพ์ไว้ได้
- `onChange` คือ event ที่ React จะเรียกทุกครั้งที่ผู้ใช้พิมพ์แม้แต่ตัวอักษรเดียว

### ขั้นที่ 2 — เก็บคำที่พิมพ์ไว้ในตัวแปร (State)

ตัวแปร `searchName` ที่เห็นด้านบนถูกประกาศไว้ด้วย `useState` (`page.tsx:121-124`):

```tsx
const [searchType, setSearchType] = useState<'name' | 'date'>('name');
const [searchName, setSearchName] = useState('');
const [searchDate, setSearchDate] = useState('');
const [searchFormCategory, setSearchFormCategory] = useState<LeaveFormCategory | null>(null);
```

ทุกครั้งที่ผู้ใช้พิมพ์ใน input จากขั้นที่ 1 ค่าจะถูกอัปเดตเข้ามาเก็บใน state เหล่านี้แบบ real-time ผ่าน `setSearchName(e.target.value)` — เปรียบเหมือน "กล่องเก็บค่า" ที่ React คอยจำไว้ให้ตลอดเวลาที่หน้าจอยังเปิดอยู่

### ขั้นที่ 3 — เมื่อกดค้นหา นำคำค้นหาไปประกอบเป็น URL

เมื่อผู้ใช้สั่งค้นหา (จะกดปุ่มหรือกด Enter ก็ตาม — ดูขั้นที่ 5) ฟังก์ชัน `handleSearch` จะถูกเรียก และส่วนแรกที่มันทำคือแปลงคำค้นหาให้กลายเป็น URL (`page.tsx:282-291`):

```tsx
const params: string[] = [];
if (searchType === 'name' && searchName) {
  params.push(`name=${encodeURIComponent(searchName)}`);
} else if (searchType === 'date' && searchDate) {
  params.push(`date=${searchDate}`);
}
if (searchFormCategory) {
  params.push(`formCategory=${searchFormCategory}`);
}
const url = `/api/leaves/search?${params.join('&')}`;
```

- สร้าง array `params` ไว้เก็บเงื่อนไขค้นหาแต่ละอย่างเป็น string
- เช็คว่าผู้ใช้กำลังค้นด้วยชื่อหรือวันที่ แล้ว `push` เป็น `name=...` หรือ `date=...`
- `encodeURIComponent(searchName)` ใช้เข้ารหัสอักขระพิเศษ (เช่น เว้นวรรค, ภาษาไทย) ไม่ให้ URL พัง
- สุดท้าย `join('&')` รวมทุกเงื่อนไขเป็น query string เดียว แล้วประกอบเป็น URL เต็ม เช่น `/api/leaves/search?name=สมชาย`

### ขั้นที่ 4 — ส่ง URL ไปถาม Server ด้วย fetch แล้วรอผลลัพธ์

ต่อจากขั้นที่ 3 โค้ดจะยิง URL นั้นไปหา server ทันที (`page.tsx:293-294`):

```tsx
const response = await fetch(url);
const data = await response.json();
```

ฝั่ง server ที่ไฟล์ `src/app/api/leaves/search/route.ts` จะรับ URL นี้ อ่านค่าที่แนบมาด้วย (`route.ts:42-47`):

```ts
const { searchParams } = new URL(request.url);
const name = searchParams.get('name');
const date = searchParams.get('date');
```

แล้วนำไปค้นในฐานข้อมูลจริงผ่าน Prisma (`route.ts:84-102`):

```ts
const leaves = await prisma.leave.findMany({
  where,
  include: { user: { select: { id: true, name: true, /* ... */ } } },
  orderBy: { startDate: 'desc' },
  take: 200,
});

return NextResponse.json({ success: true, data: leaves, count: leaves.length });
```

พูดง่ายๆ คือ: **ฝั่งหน้าจอ "ถาม"** ด้วย URL → **ฝั่ง server "ตอบกลับ"** เป็นข้อมูล JSON

### ขั้นที่ 5 — จัดการปุ่มกดค้นหา และปุ่ม Enter

สังเกตว่าใน input ของขั้นที่ 1 มี `onKeyDown` ที่เช็คว่าเป็นปุ่ม Enter หรือไม่ และนอกจากนั้นยังมีปุ่ม "ค้นหา" แยกไว้ต่างหาก (`page.tsx:938-943`):

```tsx
<button onClick={handleSearch} className="px-4 py-2 bg-indigo-600 text-white rounded-lg ...">
  ค้นหา
</button>
```

จุดสำคัญคือ **ทั้งสองทางเรียกฟังก์ชันเดียวกัน** คือ `handleSearch` — ไม่ว่าผู้ใช้จะกด Enter หรือคลิกปุ่ม ผลลัพธ์คือเหมือนกันทุกประการ เพราะ logic ทั้งหมด (ขั้นที่ 3-4) อยู่ในฟังก์ชันเดียว ไม่ต้องเขียนซ้ำสองที่

### ขั้นที่ 6 — แสดงผลลัพธ์บนหน้าจอ

เมื่อ `data` กลับมาจาก server แล้ว (ขั้นที่ 4) ต้องมีพื้นที่แสดงผล ส่วนนี้อยู่ใน JSX ท้ายไฟล์ (`page.tsx:1051-1057`):

```tsx
{leaves.length === 0 ? (
  <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
    <p className="text-slate-500">ไม่มีข้อมูลการลา</p>
  </div>
) : (
  leaves.map((leave) => (
    <div key={leave.id} className="bg-white rounded-xl shadow-sm border ...">
      {/* รายละเอียดการลาแต่ละรายการ */}
    </div>
  ))
)}
```

- ถ้า `leaves` (state ที่เก็บผลลัพธ์) ว่างเปล่า → แสดงข้อความ "ไม่มีข้อมูล"
- ถ้ามีข้อมูล → ใช้ `.map()` วนลูปสร้างการ์ดแสดงผลทีละรายการ

### ขั้นที่ 7 — เมื่อค้นหาใหม่ ให้ลบผลลัพธ์เก่าก่อนแสดงผลใหม่

นี่คือจุดที่มักสับสนที่สุดสำหรับผู้เริ่มต้น: **ไม่ต้องเขียนโค้ดลบผลลัพธ์เก่าออกเองเลย** กลับไปดู `handleSearch` อีกครั้ง (`page.tsx:296-297`):

```tsx
if (data.success) {
  setLeaves(data.data);       // <-- บรรทัดนี้แหละคือคำตอบ
  setHasMoreLeaves(false);
}
```

`setLeaves(data.data)` คือการ**แทนที่ state ทั้งก้อน** ด้วยข้อมูลใหม่ ไม่ใช่การ "เพิ่มต่อท้าย" ของเดิม เพราะฉะนั้นพอ state เปลี่ยน React จะรู้ทันทีว่าต้อง render ใหม่ทั้งหมดตามขั้นที่ 6 — ผลลัพธ์เก่าที่เคยแสดงอยู่จึงหายไปเองโดยอัตโนมัติ แล้วผลลัพธ์ใหม่ก็เข้ามาแทนที่ ไม่ต้องมีโค้ด "ลบ DOM" แยกต่างหากแต่อย่างใด

### ขั้นที่ 8 (โบนัส) — ปุ่มรีเซ็ตการค้นหา

นอกจากปุ่มค้นหา ยังมีปุ่ม "รีเซ็ต" ที่ล้างคำค้นหาแล้วโหลดรายการเริ่มต้นกลับมา ใช้ pattern เดียวกับขั้นที่ 3-4 (`page.tsx:311-329`):

```tsx
const resetSearch = async () => {
  setSearchName('');
  setSearchDate('');
  setSearchFormCategory(null);

  const response = await fetch(`/api/leaves?page=1&limit=${LEAVES_PAGE_SIZE}`);
  const data = await response.json();
  if (data.success) {
    setLeaves(data.data);
    setLeavesPage(1);
    setHasMoreLeaves(Boolean(data.meta?.hasMore));
  }
};
```

### สรุป Flow แบบภาพรวม

```
พิมพ์ในช่อง input → onChange เก็บลง state (searchName)
     ↓ (กด Enter หรือคลิกปุ่ม "ค้นหา")
handleSearch() → ประกอบ URL จาก state
     ↓
fetch(url) → เรียก API /api/leaves/search
     ↓
Server ค้นในฐานข้อมูล (Prisma) → ตอบกลับ JSON
     ↓
setLeaves(data.data) → แทนที่ผลลัพธ์เก่าด้วยผลลัพธ์ใหม่ทั้งก้อน
     ↓
React render การ์ดผลลัพธ์ใหม่บนหน้าจอทันที
```

### เกร็ดเสริม — Pattern อื่นที่ใช้ในโปรเจกต์นี้

ในหน้า Employees, Documents, Supplies และ Assets ก็มีช่องค้นหาเหมือนกัน แต่ใช้วิธีที่ต่างออกไป: แทนที่จะยิง `fetch` ไปหา server ใหม่ทุกครั้ง จะใช้ `useMemo` **กรองข้อมูลที่โหลดมาไว้แล้วในเครื่อง** (client-side filter) ซึ่งเร็วกว่าเพราะไม่ต้องรอ server แต่ใช้ได้เฉพาะกรณีที่ข้อมูลทั้งหมดโหลดมาอยู่ในเครื่องแล้ว ลองเปิดไฟล์เหล่านี้เทียบดูเป็นแบบฝึกหัดต่อยอด:
- `src/app/dashboard/employees/page.tsx`
- `src/app/dashboard/documents/page.tsx`
- `src/app/dashboard/supplies/page.tsx`
- `src/app/dashboard/assets/page.tsx`

## License

MIT License

## ผู้พัฒนา

EMS Development Team

## การสนับสนุน

หากมีปัญหาหรือคำถาม กรุณาติดต่อผู้ดูแลระบบ

----------------- 

## after clone the project from github
pnpm i
↓
สร้าง .env (DATABASE_URL)
↓
npx prisma db push
↓
npx prisma generate
↓
pnpm run db:seed (ถ้ามี)
↓
pnpm dev
