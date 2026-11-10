import { describe, it, expect } from 'vitest';
import { disabledLeaveTypeMessage } from './leave-type-options';
import { resolveFeatures } from './features';

describe('disabledLeaveTypeMessage', () => {
  it('allows everything by default', () => {
    const f = resolveFeatures([]);
    for (const t of ['SICK', 'LATE_ARRIVAL', 'EARLY_LEAVE', undefined, null]) expect(disabledLeaveTypeMessage(t, f)).toBeNull();
  });
  it('blocks only the disabled option', () => {
    const f = resolveFeatures([{ featureKey: 'leaves', enabled: true, options: { lateArrival: false } }]);
    expect(disabledLeaveTypeMessage('LATE_ARRIVAL', f)).not.toBeNull();
    expect(disabledLeaveTypeMessage('EARLY_LEAVE', f)).toBeNull();
    expect(disabledLeaveTypeMessage('SICK', f)).toBeNull();
  });
  it('blocks both when the whole leaves feature is off', () => {
    const f = resolveFeatures([{ featureKey: 'leaves', enabled: false }]);
    expect(disabledLeaveTypeMessage('LATE_ARRIVAL', f)).not.toBeNull();
    expect(disabledLeaveTypeMessage('EARLY_LEAVE', f)).not.toBeNull();
  });
});
