import { describe, it, expect } from 'vitest';
import { DEFAULT_ORG, directorShort, directorTitle, orgSettingSchema, unitSelectionOf } from './org-settings';
import { applyOrgToVehicleFields, DEPARTMENT_OPTIONS, OTHER_OPTION } from './vehicle-request';

describe('org settings', () => {
  it('default division is the new name (no longer "สำนักพระราชวัง")', () => {
    expect(DEFAULT_ORG.divisionName).toBe('ศูนย์เทคโนโลยีดิจิทัล หน่วยราชการในพระองค์');
    expect(DEFAULT_ORG.divisionName).not.toContain('สำนักพระราชวัง');
    expect(DEFAULT_ORG.departmentName.startsWith('กอง')).toBe(true);
  });

  it('builds director titles from the department name', () => {
    const org = { divisionName: 'ก', departmentName: 'กองทดสอบ' };
    expect(directorTitle(org)).toBe('ผู้อำนวยการกองทดสอบ');
    expect(directorShort(org)).toBe('ผอ.กองทดสอบ');
  });

  it('validates PATCH body: trims, rejects empty/too long, needs at least one field', () => {
    expect(orgSettingSchema.safeParse({ divisionName: '  ใหม่  ' })).toMatchObject({ success: true, data: { divisionName: 'ใหม่' } });
    expect(orgSettingSchema.safeParse({ departmentName: '   ' }).success).toBe(false);
    expect(orgSettingSchema.safeParse({ divisionName: 'ก'.repeat(201) }).success).toBe(false);
    expect(orgSettingSchema.safeParse({ departmentName: 'ก'.repeat(101) }).success).toBe(false);
    expect(orgSettingSchema.safeParse({}).success).toBe(false);
  });

  it('unitSelectionOf: main when empty or equal to the org value, other for a seconded unit', () => {
    expect(unitSelectionOf('', 'X')).toBe('main');
    expect(unitSelectionOf(null, 'X')).toBe('main');
    expect(unitSelectionOf('X', 'X')).toBe('main');
    expect(unitSelectionOf('กองอื่น', 'X')).toBe('other');
  });
});

describe('applyOrgToVehicleFields', () => {
  const tpl = {
    systemKey: 'VEHICLE_REQUEST',
    fields: [
      { key: 'department', options: ['เก่า', OTHER_OPTION] },
      { key: 'purpose', options: null },
    ],
  };
  it('puts the current division name first in the department options for the vehicle form only', () => {
    const out = applyOrgToVehicleFields(tpl, { divisionName: 'ใหม่', departmentName: 'กองx' });
    expect(out.fields[0].options).toEqual(['ใหม่', OTHER_OPTION]);
    expect(out.fields[1].options).toBeNull();
    expect(tpl.fields[0].options).toEqual(['เก่า', OTHER_OPTION]); // ไม่แก้ของเดิม
  });
  it('leaves other templates untouched', () => {
    const other = { systemKey: 'MEETING_ROOM_REQUEST', fields: [{ key: 'department', options: ['เก่า'] }] };
    expect(applyOrgToVehicleFields(other, { divisionName: 'ใหม่', departmentName: 'x' })).toBe(other);
  });
  it('seed options start from the default division', () => {
    expect(DEPARTMENT_OPTIONS[0]).toBe(DEFAULT_ORG.divisionName);
  });
});

describe('org names reject control and bidi characters (document header spoofing)', () => {
  it.each(['a\nb', 'a\tb', 'a\u0000b', 'a\u202Eb', 'a\u2066b', 'a\u200Fb', 'a\u007Fb'])('rejects %j', (v) => {
    expect(orgSettingSchema.safeParse({ divisionName: v }).success).toBe(false);
    expect(orgSettingSchema.safeParse({ departmentName: v }).success).toBe(false);
  });
  it('still accepts normal Thai names with spaces', () => {
    expect(orgSettingSchema.safeParse({ divisionName: 'ศูนย์เทคโนโลยีดิจิทัล หน่วยราชการในพระองค์' }).success).toBe(true);
  });
});
