import { describe, it, expect } from 'vitest';
import { buildTemplateDataSchema, type TemplateFieldLike } from './dynamic-form-validation';

describe('buildTemplateDataSchema', () => {
  it('rejects a select value that is not one of the field options', () => {
    const fields: TemplateFieldLike[] = [
      { key: 'vehicleType', inputType: 'select', required: true, options: ['รถตู้', 'รถเก๋ง'] },
    ];
    const schema = buildTemplateDataSchema(fields);
    const result = schema.safeParse({ vehicleType: 'เครื่องบิน' });
    expect(result.success).toBe(false);
  });

  it('accepts a select value that matches a field option', () => {
    const fields: TemplateFieldLike[] = [
      { key: 'vehicleType', inputType: 'select', required: true, options: ['รถตู้', 'รถเก๋ง'] },
    ];
    const schema = buildTemplateDataSchema(fields);
    const result = schema.safeParse({ vehicleType: 'รถตู้' });
    expect(result.success).toBe(true);
  });

  it('falls back to a plain string when a select field has no options (malformed template)', () => {
    const fields: TemplateFieldLike[] = [{ key: 'vehicleType', inputType: 'select', required: true }];
    const schema = buildTemplateDataSchema(fields);
    expect(schema.safeParse({ vehicleType: 'anything' }).success).toBe(true);
    expect(schema.safeParse({ vehicleType: '' }).success).toBe(false);
  });

  it('rejects a malformed date value', () => {
    const fields: TemplateFieldLike[] = [{ key: 'travelDate', inputType: 'date', required: true }];
    const schema = buildTemplateDataSchema(fields);
    expect(schema.safeParse({ travelDate: 'not-a-date' }).success).toBe(false);
    expect(schema.safeParse({ travelDate: '2026-08-04' }).success).toBe(true);
  });

  it('rejects a malformed time value', () => {
    const fields: TemplateFieldLike[] = [{ key: 'departTime', inputType: 'time', required: true }];
    const schema = buildTemplateDataSchema(fields);
    expect(schema.safeParse({ departTime: 'noon' }).success).toBe(false);
    expect(schema.safeParse({ departTime: '08:30' }).success).toBe(true);
  });

  it('still enforces required on plain text fields', () => {
    const fields: TemplateFieldLike[] = [{ key: 'purpose', inputType: 'text', required: true }];
    const schema = buildTemplateDataSchema(fields);
    expect(schema.safeParse({ purpose: '' }).success).toBe(false);
    expect(schema.safeParse({ purpose: 'ประชุม' }).success).toBe(true);
  });

  it('allows an optional field to be omitted or null', () => {
    const fields: TemplateFieldLike[] = [{ key: 'note', inputType: 'text', required: false }];
    const schema = buildTemplateDataSchema(fields);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ note: null }).success).toBe(true);
  });
});

describe('checkbox / tel fields', () => {
  const fields: TemplateFieldLike[] = [
    { key: 'vehicleTypes', inputType: 'checkbox', required: true, options: ['บัส', 'มินิบัส'] },
    { key: 'phone', inputType: 'tel', required: false },
  ];
  const schema = buildTemplateDataSchema(fields);

  it('accepts multiple valid checkbox values', () => {
    expect(schema.safeParse({ vehicleTypes: ['บัส', 'มินิบัส'] }).success).toBe(true);
  });
  it('rejects a value outside options', () => {
    expect(schema.safeParse({ vehicleTypes: ['เรือ'] }).success).toBe(false);
  });
  it('rejects an empty required checkbox list', () => {
    expect(schema.safeParse({ vehicleTypes: [] }).success).toBe(false);
  });
  it('rejects non-phone characters', () => {
    expect(schema.safeParse({ vehicleTypes: ['บัส'], phone: 'abc' }).success).toBe(false);
    expect(schema.safeParse({ vehicleTypes: ['บัส'], phone: '02-123 4567' }).success).toBe(true);
  });
});

describe('user field', () => {
  const schema = buildTemplateDataSchema([{ key: 'requesterUserId', inputType: 'user', required: true }]);
  it('accepts a positive integer id and rejects strings/zero', () => {
    expect(schema.safeParse({ requesterUserId: 5 }).success).toBe(true);
    expect(schema.safeParse({ requesterUserId: '5' }).success).toBe(false);
    expect(schema.safeParse({ requesterUserId: 0 }).success).toBe(false);
  });
});
