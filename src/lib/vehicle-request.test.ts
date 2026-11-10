import { describe, it, expect } from 'vitest';
import { canUseFormTemplate, PERMISSIONS } from './permissions';
import { buildVehicleLayout, buildRequesterSnapshot, VEHICLE_APPROVER_ROLES, VEHICLE_REQUEST_FIELDS, isOtherSelected, validateVehicleCounts, canPlaceSubmitterSignature, REMOVED_VEHICLE_FIELD_KEYS, shortThaiDate, THAI_MONTHS_SHORT } from './vehicle-request';

/** แตกรายการในก้อน (group) ให้เป็นรายการแบนเพื่อค้น/นับ */
type AnyItem = ReturnType<typeof buildVehicleLayout> extends (infer B)[]
  ? B extends { kind: 'rows'; rows: (infer R)[] } ? R extends { items: (infer I)[] } ? I : never : never
  : never;
function flatItems(items: AnyItem[]): AnyItem[] {
  return items.flatMap((i) => (i.k === 'group' ? flatItems(i.items as AnyItem[]) : [i]));
}

const ctx = {
  data: { vehicleTypes: ['บัส'], purpose: 'ทดสอบ', extraDetails: 'a\nb' },
  requestDate: { day: '1', month: 'มกราคม', year: '2569' },
  requesterName: 'นายทดสอบ',
  requesterPosition: 'ผู้ช่วย',
  thaiDate: () => null,
};

describe('canUseFormTemplate', () => {
  it('blocks vehicle form without permission, allows admin and granted users, allows other forms', () => {
    expect(canUseFormTemplate({ role: 'EMPLOYEE', permissions: [] }, 'VEHICLE_REQUEST')).toBe(false);
    expect(canUseFormTemplate({ role: 'EMPLOYEE', permissions: [PERMISSIONS.FORMS_REQUEST_VEHICLE] }, 'VEHICLE_REQUEST')).toBe(true);
    expect(canUseFormTemplate({ role: 'ADMIN', permissions: [] }, 'VEHICLE_REQUEST')).toBe(true);
    expect(canUseFormTemplate({ role: 'EMPLOYEE', permissions: [] }, 'MEETING_ROOM_REQUEST')).toBe(true);
  });
});

describe('buildVehicleLayout', () => {
  it('checks only selected vehicle types and pads extra details to 3 lines', () => {
    const blocks = buildVehicleLayout(ctx);
    const boxes = flatItems(blocks.flatMap((b) => (b.kind === 'rows' ? b.rows : [])).flatMap((r) => r.items)).filter((i) => i.k === 'box');
    expect(boxes.filter((b) => b.k === 'box' && b.checked)).toHaveLength(1);
    expect(boxes).toHaveLength(9);
    const extra = blocks[2];
    expect(extra.kind === 'rows' && extra.rows.length).toBe(4);
  });
});

describe('addressTo', () => {
  const addr = (data: Record<string, unknown>) => {
    const row = buildVehicleLayout({ ...ctx, data }).flatMap((b) => (b.kind === 'rows' ? b.rows : [])).find((r) => r.items.some((i) => i.k === 'text' && i.v === 'ถึง บก.ปล่อยรถ'));
    return row?.items.find((i) => i.k === 'dot');
  };
  it('prints the selected option', () => {
    expect(addr({ addressTo: 'พระที่นั่งอัมพรสถาน' })).toMatchObject({ v: 'พระที่นั่งอัมพรสถาน' });
  });
  it('prints the free-text value when อื่นๆ is selected', () => {
    expect(addr({ addressTo: 'อื่นๆ', addressToOther: 'กอง X' })).toMatchObject({ v: 'กอง X' });
  });
});

describe('buildRequesterSnapshot', () => {
  it('builds name/position/กอง/กรม like the printed form', () => {
    expect(
      buildRequesterSnapshot({
        prefix: 'นาย',
        name: 'สมชาย ใจดี',
        position: 'จนท.',
        positionSecond: 'เจ้าหน้าที่งานในพระองค์',
        positionLevel: 3,
        department: 'กองการศึกษา วิจัย และพัฒนา',
        division: 'ศูนย์เทคโนโลยีดิจิทัล หน่วยราชการในพระองค์',
      })
    ).toEqual({
      name: 'นายสมชาย ใจดี',
      position: 'เจ้าหน้าที่งานในพระองค์ ระดับ 3',
      division: 'การศึกษา วิจัย และพัฒนา',
      bureau: 'ศูนย์เทคโนโลยีดิจิทัล หน่วยราชการในพระองค์',
      phone: '',
      section: '',
    });
  });
  it('falls back to position and empty strings', () => {
    expect(buildRequesterSnapshot({ name: 'ก', position: 'ผู้อำนวยการกอง' })).toEqual({
      name: 'ก',
      position: 'ผู้อำนวยการกอง',
      division: '',
      bureau: '',
      phone: '',
      section: '',
    });
  });
  it('layout prints the stored requesterName snapshot over the creator name', () => {
    const blocks = buildVehicleLayout({ ...ctx, data: { requesterName: 'นายเลือก ชื่อ' } });
    const dots = blocks.flatMap((b) => (b.kind === 'rows' ? b.rows : [])).flatMap((r) => r.items).filter((i) => i.k === 'dot');
    expect(dots.some((i) => i.k === 'dot' && i.v === 'นายเลือก ชื่อ')).toBe(true);
  });
});

describe('approver (ผบ.ชา.)', () => {
  it('only MANAGER/DIRECTOR may be approvers, and approverUserId is an optional user field', () => {
    expect([...VEHICLE_APPROVER_ROLES]).toEqual(['MANAGER', 'DIRECTOR']);
    expect(VEHICLE_REQUEST_FIELDS.find((f) => f.key === 'approverUserId')).toMatchObject({ inputType: 'user', required: false });
  });
  it('layout prints stored approverName and approverPosition', () => {
    const blocks = buildVehicleLayout({ ...ctx, data: { approverName: 'พ.อ.ผู้อนุมัติ', approverPosition: 'ผู้อำนวยการกอง' } });
    const cols = blocks.filter((b) => b.kind === 'cols').flatMap((b) => (b.kind === 'cols' ? b.right : []));
    const vals = cols.flatMap((r) => r.items).filter((i) => i.k === 'dot').map((i) => (i.k === 'dot' ? i.v : ''));
    expect(vals).toContain('พ.อ.ผู้อนุมัติ');
    expect(vals).toContain('ผู้อำนวยการกอง');
  });
});

describe('department', () => {
  const dept = (data: Record<string, unknown>) => {
    const row = buildVehicleLayout({ ...ctx, data }).flatMap((b) => (b.kind === 'rows' ? b.rows : [])).find((r) => r.items.some((i) => i.k === 'text' && i.v === 'ส่วนราชการ'));
    return row?.items.find((i) => i.k === 'dot');
  };
  it('prints the selected option', () => {
    expect(dept({ department: 'ศูนย์เทคโนโลยีดิจิทัล หน่วยราชการในพระองค์' })).toMatchObject({ v: 'ศูนย์เทคโนโลยีดิจิทัล หน่วยราชการในพระองค์' });
  });
  it('prints the free-text value when อื่นๆ is selected', () => {
    expect(dept({ department: 'อื่นๆ', departmentOther: 'หน่วย X' })).toMatchObject({ v: 'หน่วย X' });
  });
});

describe('vehicleOther / isOtherSelected', () => {
  it('detects อื่นๆ in string and array values', () => {
    expect(isOtherSelected('อื่นๆ')).toBe(true);
    expect(isOtherSelected(['บัส', 'อื่นๆ'])).toBe(true);
    expect(isOtherSelected(['บัส'])).toBe(false);
    expect(isOtherSelected(undefined)).toBe(false);
    expect(isOtherSelected('')).toBe(false);
  });
  const other = (data: Record<string, unknown>) => {
    const row = buildVehicleLayout({ ...ctx, data }).flatMap((b) => (b.kind === 'rows' ? b.rows : [])).find((r) => r.items.some((i) => i.k === 'text' && i.v === 'อื่นๆ'));
    return row?.items.find((i) => i.k === 'dot');
  };
  it('prints vehicleOther only when อื่นๆ is ticked', () => {
    expect(other({ vehicleTypes: ['บัส'], vehicleOther: 'รถพิเศษ' })).toMatchObject({ v: '' });
    expect(other({ vehicleTypes: ['อื่นๆ'], vehicleOther: 'รถพิเศษ' })).toMatchObject({ v: 'รถพิเศษ' });
  });
});

describe('coordinator & phones', () => {
  it('snapshot includes phone (empty when missing)', () => {
    expect(buildRequesterSnapshot({ name: 'ก', phone: ' 081-111-2222 ' }).phone).toBe('081-111-2222');
    expect(buildRequesterSnapshot({ name: 'ก' }).phone).toBe('');
  });
  it('coordinatorUserId is an optional user field', () => {
    expect(VEHICLE_REQUEST_FIELDS.find((f) => f.key === 'coordinatorUserId')).toMatchObject({ inputType: 'user', required: false });
  });
  it('layout prints coordinator, coordinator phone and requester phone', () => {
    const blocks = buildVehicleLayout({ ...ctx, data: { coordinator: 'นายผู้ประสาน', coordinatorPhone: '02-111', phone: '081-999' } });
    const vals = blocks.flatMap((b) => (b.kind === 'rows' ? b.rows : b.kind === 'cols' ? [...b.left, ...b.right] : [])).flatMap((r) => r.items).filter((i) => i.k === 'dot').map((i) => (i.k === 'dot' ? i.v : ''));
    expect(vals).toEqual(expect.arrayContaining(['นายผู้ประสาน', '02-111', '081-999']));
  });
});

describe('counts / section / removed fields / submitter', () => {
  it('validateVehicleCounts rejects 0, negatives and decimals; accepts positive ints and empty', () => {
    expect(validateVehicleCounts({ vehicleCount: -3 })).not.toBeNull();
    expect(validateVehicleCounts({ vehicleCount: 0 })).not.toBeNull();
    expect(validateVehicleCounts({ tripCount: 1.5 })).not.toBeNull();
    expect(validateVehicleCounts({ passengerCount: -1 })).not.toBeNull();
    expect(validateVehicleCounts({ vehicleCount: 1, tripCount: null, passengerCount: '' })).toBeNull();
  });
  it('snapshot returns trimmed section', () => {
    expect(buildRequesterSnapshot({ name: 'ก', section: ' ตรวจสอบปฏิบัติการ ' }).section).toBe('ตรวจสอบปฏิบัติการ');
    expect(buildRequesterSnapshot({ name: 'ก' }).section).toBe('');
  });
  it('returnTime and driverName are no longer fields', () => {
    const keys = VEHICLE_REQUEST_FIELDS.map((f) => f.key);
    for (const k of REMOVED_VEHICLE_FIELD_KEYS) expect(keys).not.toContain(k);
  });
  it('only the logged-in submitter may place/hide the signature', () => {
    expect(canPlaceSubmitterSignature({ submitterUserId: 7 }, 7)).toBe(true);
    expect(canPlaceSubmitterSignature({ submitterUserId: 8 }, 7)).toBe(false);
    expect(canPlaceSubmitterSignature({ submitterUserId: null, submitterName: 'อื่น' }, 7)).toBe(false);
    expect(canPlaceSubmitterSignature({}, 7)).toBe(false);
  });
  it('layout prints submitter name/phone and anchors the signature to the right column', () => {
    const blocks = buildVehicleLayout({ ...ctx, data: { submitterName: 'นายผู้จัดทำ', submitterPhone: '02-999' } });
    const last = blocks.filter((b) => b.kind === 'cols').pop();
    expect(last && last.kind === 'cols' && last.signatureAnchor).toBe('right');
    const vals = (last && last.kind === 'cols' ? last.right : []).flatMap((r) => r.items).filter((i) => i.k === 'dot').map((i) => (i.k === 'dot' ? i.v : ''));
    expect(vals).toEqual(expect.arrayContaining(['นายผู้จัดทำ', '02-999']));
  });
});

describe('footer layout (does not run off the page)', () => {
  const footer = () => buildVehicleLayout(ctx).filter((b) => b.kind === 'cols').pop();
  it('uses an 11:9 notes:signature split and wrapping notes', () => {
    const f = footer();
    expect(f && f.kind === 'cols' && f.ratio).toEqual([11, 9]);
    const notes = (f && f.kind === 'cols' ? f.left : []).slice(1).flatMap((r) => r.items);
    expect(notes.length).toBe(3);
    for (const n of notes) expect(n).toMatchObject({ k: 'text', wrap: true });
  });
  it('shortThaiDate gives day / abbreviated month / พ.ศ.', () => {
    expect(shortThaiDate('2026-11-09')).toEqual({ day: '9', month: 'พ.ย.', year: '2569' });
    expect(shortThaiDate('2026-01-31')?.month).toBe('ม.ค.');
    expect(THAI_MONTHS_SHORT).toHaveLength(12);
    expect(shortThaiDate('2026-13-01')).toBeNull();
    expect(shortThaiDate('bad')).toBeNull();
  });
  it('submit date prints with an abbreviated month', () => {
    const f = buildVehicleLayout({ ...ctx, data: { submitDate: '2026-11-10' } }).filter((b) => b.kind === 'cols').pop();
    const vals = (f && f.kind === 'cols' ? f.right : []).flatMap((r) => r.items).filter((i) => i.k === 'dot').map((i) => (i.k === 'dot' ? i.v : ''));
    expect(vals).toEqual(expect.arrayContaining(['10', 'พ.ย.', '2569']));
  });
});

describe('vehicle type row spacing', () => {
  const typeRow = () =>
    buildVehicleLayout(ctx).flatMap((b) => (b.kind === 'rows' ? b.rows : [])).find((r) => r.items.filter((i) => i.k === 'group').length === 8);
  it('is one row of 8 option groups (box + text), spread edge to edge so the last word is flush right', () => {
    const row = typeRow();
    expect(row).toBeDefined();
    expect(row?.spread).toBe(true);
    for (const g of row?.items ?? []) {
      expect(g.k).toBe('group');
      const inner = g.k === 'group' ? g.items.map((i) => i.k) : [];
      expect(inner).toEqual(['box', 'gap', 'text']);
    }
  });
  it('has no fixed gap between options (spacing comes from space-between)', () => {
    expect((typeRow()?.items ?? []).some((i) => i.k === 'gap')).toBe(false);
  });
});

describe('filled-in text is pen blue everywhere', () => {
  const blocks = () => buildVehicleLayout({ ...ctx, data: { phone: '081', approverName: 'ผบ', approverPosition: 'ตำแหน่ง', submitterName: 'จัดทำ', submitterPhone: '02' } });
  const dotsOf = (rows: { items: { k: string }[] }[]) => rows.flatMap((r) => r.items).filter((i) => i.k === 'dot') as { k: 'dot'; v: string; ink?: string }[];
  it('no filled value in the signing block is forced to black (requester name, phone, approver name/position)', () => {
    const signing = blocks().filter((b) => b.kind === 'cols')[0];
    const all = signing.kind === 'cols' ? dotsOf([...signing.left, ...signing.right]) : [];
    expect(all.map((d) => d.v)).toEqual(expect.arrayContaining(['081', 'ผบ', 'ตำแหน่ง', 'นายทดสอบ']));
    for (const d of all) expect(d.ink).not.toBe('black');
  });
  it('the submitter block at the bottom is blue too', () => {
    const footer = blocks().filter((b) => b.kind === 'cols').pop();
    const all = footer && footer.kind === 'cols' ? dotsOf(footer.right) : [];
    for (const d of all) expect(d.ink).not.toBe('black');
  });
  it('no dot anywhere in the form uses black ink', () => {
    const flat: { k: string; ink?: string }[] = [];
    const walk = (items: { k: string; items?: unknown }[]) => items.forEach((i) => (i.k === 'group' ? walk(i.items as never) : flat.push(i)));
    for (const b of blocks()) {
      if (b.kind === 'rows') b.rows.forEach((r) => walk(r.items as never));
      if (b.kind === 'cols') [...b.left, ...b.right].forEach((r) => walk(r.items as never));
    }
    expect(flat.filter((i) => i.k === 'dot' && i.ink === 'black')).toHaveLength(0);
  });
});

describe('count validation hardening', () => {
  it('accepts only real numbers 1..1000 (no numeric strings, no huge values)', () => {
    expect(validateVehicleCounts({ vehicleCount: 1000 })).toBeNull();
    expect(validateVehicleCounts({ vehicleCount: 1001 })).not.toBeNull();
    expect(validateVehicleCounts({ vehicleCount: 1e21 })).not.toBeNull();
    expect(validateVehicleCounts({ vehicleCount: '5' })).not.toBeNull();
    expect(validateVehicleCounts({ vehicleCount: '0x10' })).not.toBeNull();
    expect(validateVehicleCounts({ vehicleCount: Infinity })).not.toBeNull();
    expect(validateVehicleCounts({ vehicleCount: NaN })).not.toBeNull();
  });
});
