/**
 * ==================================================
 * User Context - แชร์ข้อมูลผู้ใช้ปัจจุบันให้ทุกหน้าใน Dashboard
 * ==================================================
 * ผู้ใช้จะถูกดึงครั้งเดียวใน dashboard/layout.tsx (Server Component)
 * แล้วส่งลงมาผ่าน Context นี้ แทนที่แต่ละหน้าจะยิง /api/auth/session ซ้ำเอง
 */

'use client';

import { createContext, useContext } from 'react';
import { SessionUser } from '@/types';

const UserContext = createContext<SessionUser | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/**
 * ใช้ใน Client Component ใต้ dashboard/layout.tsx เท่านั้น
 * (layout รับประกันว่ามี user แล้วก่อน render children)
 */
export function useCurrentUser(): SessionUser {
  const user = useContext(UserContext);
  if (!user) {
    throw new Error('useCurrentUser ต้องถูกเรียกใช้ภายใน UserProvider');
  }
  return user;
}
