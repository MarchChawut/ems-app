'use client';

import { useRef, useState } from 'react';

export interface LoadMoreMeta {
  total: number;
  limit: number;
  hasMore: boolean;
}

/**
 * State + logic ที่ใช้ร่วมกันสำหรับ list แบบ "โหลดเพิ่ม" (ประวัติแบบฟอร์ม, รายชื่อพนักงานในหน้าจัดการสิทธิ์)
 *
 * - `loadMore()` คำนวณ skip จาก `items.length` ปัจจุบันเสมอ (ไม่ใช่จาก page ที่โหลดครั้งแรก) กัน
 *   รายการซ้ำเมื่อมีการเพิ่มข้อมูลใหม่แบบ optimistic (prepend) เข้า list ระหว่างทาง ก่อนกด "โหลดเพิ่ม"
 * - กันกดซ้ำเร็วๆ (double-click) ด้วย ref แทนอาศัย `disabled` ของปุ่มอย่างเดียว เพราะ state update
 *   ไม่ได้ block คำสั่งที่ยิงมาในช่วง tick เดียวกัน
 */
export function useLoadMore<T>(
  initialItems: T[],
  initialMeta: LoadMoreMeta,
  fetchPage: (skip: number, limit: number) => Promise<{ items: T[]; meta: LoadMoreMeta } | null>
) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [meta, setMeta] = useState<LoadMoreMeta>(initialMeta);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  async function loadMore() {
    if (loadingRef.current || !meta.hasMore) return;
    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);
    try {
      const result = await fetchPage(items.length, meta.limit);
      if (result) {
        setItems((prev) => [...prev, ...result.items]);
        setMeta(result.meta);
      } else {
        setError('ไม่สามารถดึงข้อมูลได้');
      }
    } catch {
      setError('ไม่สามารถดึงข้อมูลได้');
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }

  /** แทนที่ list ทั้งหมดด้วยข้อมูลชุดใหม่ (เช่น เริ่มค้นหาใหม่ = กลับไปหน้าแรก) */
  function reset(newItems: T[], newMeta: LoadMoreMeta) {
    setItems(newItems);
    setMeta(newMeta);
    setError(null);
  }

  return { items, setItems, meta, setMeta, isLoadingMore, error, setError, loadMore, reset };
}
