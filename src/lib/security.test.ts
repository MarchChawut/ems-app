import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  loginSchema,
  passkeyLoginSchema,
  createUserSchema,
  changePasswordSchema,
  createTaskSchema,
  createLeaveSchema,
  signaturePlacementSchema,
  createSupplyCategorySchema,
  createSupplySchema,
  createTransactionSchema,
  createAssetCategorySchema,
  createAssetSchema,
  createCheckoutSchema,
  createDocumentRegisterSchema,
  isRateLimited,
  recordLoginAttempt,
  getLoginAttempts,
  generateSecureToken,
  generateAvatarInitials,
} from './security';

describe('hashPassword / verifyPassword', () => {
  it('hashes a password and verifies it back successfully', async () => {
    const hash = await hashPassword('MyPassword123');
    expect(hash).not.toBe('MyPassword123');
    expect(await verifyPassword('MyPassword123', hash)).toBe(true);
  });

  it('rejects an incorrect password against the hash', async () => {
    const hash = await hashPassword('MyPassword123');
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid username/password', () => {
    expect(loginSchema.safeParse({ username: 'john_doe', password: 'password123' }).success).toBe(true);
  });

  it('rejects a username shorter than 3 characters', () => {
    expect(loginSchema.safeParse({ username: 'ab', password: 'password123' }).success).toBe(false);
  });

  it('rejects a username with disallowed characters', () => {
    expect(loginSchema.safeParse({ username: 'john doe!', password: 'password123' }).success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(loginSchema.safeParse({ username: 'john_doe', password: 'short' }).success).toBe(false);
  });
});

describe('passkeyLoginSchema', () => {
  it('accepts a valid username with no password field', () => {
    expect(passkeyLoginSchema.safeParse({ username: 'john_doe' }).success).toBe(true);
  });

  it('rejects an invalid username', () => {
    expect(passkeyLoginSchema.safeParse({ username: 'jo' }).success).toBe(false);
  });
});

describe('createUserSchema', () => {
  const base = {
    email: 'john@example.com',
    username: 'john_doe',
    password: 'Password123',
    name: 'John Doe',
    role: 'EMPLOYEE' as const,
  };

  it('accepts a fully valid payload', () => {
    expect(createUserSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(createUserSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects a password missing an uppercase letter', () => {
    expect(createUserSchema.safeParse({ ...base, password: 'password123' }).success).toBe(false);
  });

  it('rejects a password missing a digit', () => {
    expect(createUserSchema.safeParse({ ...base, password: 'PasswordOnly' }).success).toBe(false);
  });

  it('rejects an invalid role', () => {
    expect(createUserSchema.safeParse({ ...base, role: 'OWNER' }).success).toBe(false);
  });

  it('allows a nullable/omitted prefix', () => {
    expect(createUserSchema.safeParse({ ...base, prefix: null }).success).toBe(true);
    expect(createUserSchema.safeParse(base).success).toBe(true);
  });
});

describe('changePasswordSchema', () => {
  it('accepts when newPassword matches confirmPassword', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'old',
        newPassword: 'NewPassword123',
        confirmPassword: 'NewPassword123',
      }).success
    ).toBe(true);
  });

  it('rejects when confirmPassword does not match newPassword', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'old',
      newPassword: 'NewPassword123',
      confirmPassword: 'Different123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['confirmPassword']);
    }
  });

  it('rejects an empty currentPassword', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: '',
        newPassword: 'NewPassword123',
        confirmPassword: 'NewPassword123',
      }).success
    ).toBe(false);
  });
});

describe('createTaskSchema', () => {
  it('accepts a minimal valid task', () => {
    expect(createTaskSchema.safeParse({ title: 'Task', priority: 'LOW' }).success).toBe(true);
  });

  it('rejects an empty title', () => {
    expect(createTaskSchema.safeParse({ title: '', priority: 'LOW' }).success).toBe(false);
  });

  it('rejects an invalid priority', () => {
    expect(createTaskSchema.safeParse({ title: 'Task', priority: 'CRITICAL' }).success).toBe(false);
  });

  it('rejects a non-positive columnId', () => {
    expect(createTaskSchema.safeParse({ title: 'Task', priority: 'LOW', columnId: 0 }).success).toBe(false);
  });
});

describe('createLeaveSchema', () => {
  const base = {
    type: 'SICK' as const,
    startDate: '2026-07-06',
    endDate: '2026-07-06',
    reason: 'Not feeling well',
  };

  it('accepts a valid single-day leave', () => {
    expect(createLeaveSchema.safeParse(base).success).toBe(true);
  });

  it('rejects when endDate is before startDate', () => {
    expect(createLeaveSchema.safeParse({ ...base, startDate: '2026-07-06', endDate: '2026-07-05' }).success).toBe(
      false
    );
  });

  it('rejects a malformed date', () => {
    expect(createLeaveSchema.safeParse({ ...base, startDate: '06-07-2026' }).success).toBe(false);
  });

  it('rejects an invalid leave type', () => {
    expect(createLeaveSchema.safeParse({ ...base, type: 'VACATION' }).success).toBe(false);
  });

  it('rejects hours outside the 0-24 range', () => {
    expect(createLeaveSchema.safeParse({ ...base, hours: 25 }).success).toBe(false);
    expect(createLeaveSchema.safeParse({ ...base, hours: -1 }).success).toBe(false);
  });

  it('rejects malformed outTime/backTime', () => {
    expect(createLeaveSchema.safeParse({ ...base, outTime: '9:00' }).success).toBe(false);
    expect(createLeaveSchema.safeParse({ ...base, backTime: '17:00' }).success).toBe(true);
  });

  it('rejects hourly ordination leave but allows full/half day', () => {
    expect(createLeaveSchema.safeParse({ ...base, type: 'ORDINATION', hours: 2 }).success).toBe(false);
    expect(createLeaveSchema.safeParse({ ...base, type: 'ORDINATION' }).success).toBe(true);
    expect(createLeaveSchema.safeParse({ ...base, type: 'ORDINATION', isHalfDay: true }).success).toBe(true);
    // ประเภทอื่นยังลารายชั่วโมงได้
    expect(createLeaveSchema.safeParse({ ...base, type: 'PERSONAL', hours: 2 }).success).toBe(true);
  });
});

describe('signaturePlacementSchema', () => {
  it('accepts a valid placement and null (hidden)', () => {
    expect(signaturePlacementSchema.safeParse({ x: 0, y: -2, width: 30 }).success).toBe(true);
    expect(signaturePlacementSchema.safeParse(null).success).toBe(true);
  });

  it('rejects out-of-range or malformed placement', () => {
    expect(signaturePlacementSchema.safeParse({ x: 500, y: 0, width: 30 }).success).toBe(false);
    expect(signaturePlacementSchema.safeParse({ x: 0, y: 0, width: 2 }).success).toBe(false);
    expect(signaturePlacementSchema.safeParse({ x: 0, y: 0 }).success).toBe(false);
    expect(signaturePlacementSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('createSupplyCategorySchema', () => {
  it('accepts a valid category', () => {
    expect(createSupplyCategorySchema.safeParse({ name: 'Office supplies' }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(createSupplyCategorySchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('createSupplySchema', () => {
  it('accepts a minimal valid supply', () => {
    expect(createSupplySchema.safeParse({ name: 'Pen', type: 'STOCK' }).success).toBe(true);
  });

  it('rejects an invalid type', () => {
    expect(createSupplySchema.safeParse({ name: 'Pen', type: 'INVALID' }).success).toBe(false);
  });

  it('rejects a negative minimumQuantity', () => {
    expect(createSupplySchema.safeParse({ name: 'Pen', type: 'STOCK', minimumQuantity: -1 }).success).toBe(false);
  });

  it('rejects thresholdRed out of the 1-99 range', () => {
    expect(createSupplySchema.safeParse({ name: 'Pen', type: 'STOCK', thresholdRed: 0 }).success).toBe(false);
    expect(createSupplySchema.safeParse({ name: 'Pen', type: 'STOCK', thresholdRed: 100 }).success).toBe(false);
  });
});

describe('createTransactionSchema', () => {
  it('accepts a valid RECEIVE transaction', () => {
    expect(createTransactionSchema.safeParse({ supplyId: 1, type: 'RECEIVE', quantity: 10 }).success).toBe(true);
  });

  it('rejects a non-positive quantity', () => {
    expect(createTransactionSchema.safeParse({ supplyId: 1, type: 'ISSUE', quantity: 0 }).success).toBe(false);
  });

  it('rejects a non-positive supplyId', () => {
    expect(createTransactionSchema.safeParse({ supplyId: 0, type: 'ISSUE', quantity: 1 }).success).toBe(false);
  });

  it('rejects an invalid transaction type', () => {
    expect(createTransactionSchema.safeParse({ supplyId: 1, type: 'STEAL', quantity: 1 }).success).toBe(false);
  });
});

describe('createAssetCategorySchema', () => {
  it('accepts a valid category', () => {
    expect(createAssetCategorySchema.safeParse({ name: 'Electronics' }).success).toBe(true);
  });

  it('rejects a name over the max length', () => {
    expect(createAssetCategorySchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
  });
});

describe('createAssetSchema', () => {
  it('accepts a minimal valid asset', () => {
    expect(createAssetSchema.safeParse({ name: 'Laptop' }).success).toBe(true);
  });

  it('rejects an invalid status', () => {
    expect(createAssetSchema.safeParse({ name: 'Laptop', status: 'LOST' }).success).toBe(false);
  });

  it('rejects an invalid condition', () => {
    expect(createAssetSchema.safeParse({ name: 'Laptop', condition: 'BROKEN' }).success).toBe(false);
  });

  it('rejects a malformed acquisitionDate', () => {
    expect(createAssetSchema.safeParse({ name: 'Laptop', acquisitionDate: '07/06/2026' }).success).toBe(false);
  });

  it('rejects a negative acquisitionCost', () => {
    expect(createAssetSchema.safeParse({ name: 'Laptop', acquisitionCost: -1 }).success).toBe(false);
  });
});

describe('createCheckoutSchema', () => {
  it('accepts a valid checkout', () => {
    expect(createCheckoutSchema.safeParse({ assetId: 1, holderId: 2 }).success).toBe(true);
  });

  it('rejects a non-positive assetId or holderId', () => {
    expect(createCheckoutSchema.safeParse({ assetId: 0, holderId: 2 }).success).toBe(false);
    expect(createCheckoutSchema.safeParse({ assetId: 1, holderId: 0 }).success).toBe(false);
  });
});

describe('createDocumentRegisterSchema', () => {
  const base = {
    date: '2026-07-06',
    subject: 'Test memo',
    direction: 'RECEIVE' as const,
    category: 'MEMO' as const,
  };

  it('accepts a valid document register entry', () => {
    expect(createDocumentRegisterSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty subject', () => {
    expect(createDocumentRegisterSchema.safeParse({ ...base, subject: '' }).success).toBe(false);
  });

  it('rejects an invalid direction', () => {
    expect(createDocumentRegisterSchema.safeParse({ ...base, direction: 'BOTH' }).success).toBe(false);
  });

  it('rejects an invalid category', () => {
    expect(createDocumentRegisterSchema.safeParse({ ...base, category: 'OTHER' }).success).toBe(false);
  });
});

describe('rate limiting (isRateLimited / recordLoginAttempt / getLoginAttempts)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not rate limited before any attempts', () => {
    expect(isRateLimited('user-fresh')).toBe(false);
    expect(getLoginAttempts('user-fresh')).toEqual({ count: 0, remainingAttempts: 5, isLocked: false });
  });

  it('locks out after MAX_LOGIN_ATTEMPTS failed attempts', () => {
    const id = 'user-lockout';
    for (let i = 0; i < 4; i++) {
      recordLoginAttempt(id, false);
      expect(isRateLimited(id)).toBe(false);
    }
    recordLoginAttempt(id, false);
    expect(isRateLimited(id)).toBe(true);

    const status = getLoginAttempts(id);
    expect(status?.count).toBe(5);
    expect(status?.remainingAttempts).toBe(0);
    expect(status?.isLocked).toBe(true);
  });

  it('a successful attempt clears the failure count', () => {
    const id = 'user-success';
    recordLoginAttempt(id, false);
    recordLoginAttempt(id, false);
    recordLoginAttempt(id, true);

    expect(isRateLimited(id)).toBe(false);
    expect(getLoginAttempts(id)).toEqual({ count: 0, remainingAttempts: 5, isLocked: false });
  });

  it('lockout expires after LOCKOUT_DURATION elapses', () => {
    const id = 'user-expiring';
    for (let i = 0; i < 5; i++) recordLoginAttempt(id, false);
    expect(isRateLimited(id)).toBe(true);

    vi.advanceTimersByTime(30 * 60 * 1000 + 1);

    expect(isRateLimited(id)).toBe(false);
  });
});

describe('generateSecureToken', () => {
  it('generates a token of the requested length', () => {
    expect(generateSecureToken(32)).toHaveLength(32);
    expect(generateSecureToken(64)).toHaveLength(64);
  });

  it('defaults to length 32 when not specified', () => {
    expect(generateSecureToken()).toHaveLength(32);
  });

  it('generates distinct tokens across calls', () => {
    expect(generateSecureToken(32)).not.toBe(generateSecureToken(32));
  });
});

describe('generateAvatarInitials', () => {
  it('returns a single uppercase initial for a one-word name', () => {
    expect(generateAvatarInitials('john')).toBe('J');
  });

  it('returns first+last initials for a multi-word name', () => {
    expect(generateAvatarInitials('John Middle Doe')).toBe('JD');
  });

  it('returns "U" for an empty name', () => {
    expect(generateAvatarInitials('')).toBe('U');
  });

  it('trims and collapses extra whitespace before extracting initials', () => {
    expect(generateAvatarInitials('  John   Doe  ')).toBe('JD');
  });
});
