/**
 * ==================================================
 * Tasks Page - หน้าจัดการงาน (Kanban Board)
 * ==================================================
 * แสดงงานในรูปแบบ Kanban Board พร้อมฟังก์ชัน:
 * - Drag & Drop
 * - จัดการ Column (เพิ่ม/ลบ/ย้ายลำดับ)
 */

'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  X,
  Settings,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Clock,
  Eye,
  Save,
  CheckSquare,
  Square,
  FolderOpen,
  FolderPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Task, TaskPriority, TaskFolder, User } from '@/types';
import { useCurrentUser } from '@/contexts/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

/**
 * ข้อมูลคอลัมน์
 */
interface Column {
  id: number;
  name: string;
  color: string;
  order: number;
  isDefault: boolean;
}

/**
 * สีของ priority
 */
const priorityColors: Record<TaskPriority, { bg: string; text: string; label: string }> = {
  LOW: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'ต่ำ' },
  MEDIUM: { bg: 'bg-amber-100', text: 'text-amber-600', label: 'ปานกลาง' },
  HIGH: { bg: 'bg-rose-100', text: 'text-rose-600', label: 'สูง' },
  URGENT: { bg: 'bg-purple-100', text: 'text-purple-600', label: 'เร่งด่วน' },
};

/**
 * สีของคอลัมน์
 */
const columnColors: Record<string, { border: string; bg: string }> = {
  slate: { border: 'border-slate-300', bg: 'bg-slate-200' },
  blue: { border: 'border-blue-300', bg: 'bg-blue-200' },
  emerald: { border: 'border-emerald-300', bg: 'bg-emerald-200' },
  amber: { border: 'border-amber-300', bg: 'bg-amber-200' },
  rose: { border: 'border-rose-300', bg: 'bg-rose-200' },
  purple: { border: 'border-purple-300', bg: 'bg-purple-200' },
};

/**
 * หน้าจัดการงาน (Kanban Board)
 */
export default function TasksPageClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const { role: userRole } = currentUser;
  const canManageFolders = hasPermission(currentUser, PERMISSIONS.TASKS_MANAGE_FOLDERS);

  // บอร์ด 2 แบบ: ส่วนรวม (ทุกคนเห็น แก้ไขได้เฉพาะ ADMIN/SUPER_ADMIN) | ส่วนตัว (เห็น/แก้ไขได้เฉพาะเจ้าของ)
  // สิทธิ์จริงบังคับที่ API (src/lib/task-access.ts) — ตัวแปรนี้ใช้ซ่อน/แสดงปุ่มเท่านั้น
  const [scope, setScope] = useState<'shared' | 'private'>('shared');
  const isBoardAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(userRole);
  const canEditBoard = scope === 'private' || isBoardAdmin;

  // State สำหรับเก็บรายการงาน
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // State สำหรับเก็บคอลัมน์
  const [columns, setColumns] = useState<Column[]>([]);
  
  // State สำหรับเก็บรายชื่อผู้ใช้
  const [users, setUsers] = useState<User[]>([]);
  
  // State สำหรับสถานะการโหลด
  const [isLoading, setIsLoading] = useState(true);
  
  // State สำหรับข้อผิดพลาด
  const [error, setError] = useState<string | null>(null);
  
  // State สำหรับเปิด/ปิด Modal สร้างงาน
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  
  // State สำหรับเปิด/ปิด Modal จัดการคอลัมน์
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  
  // State สำหรับข้อมูลงานใหม่
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM' as TaskPriority,
    columnId: '',
    assigneeId: '',
    reminderAt: '',
  });
  
  // State สำหรับข้อมูลคอลัมน์ใหม่
  const [newColumn, setNewColumn] = useState({
    name: '',
    color: 'slate',
  });
  
  // State สำหรับงานที่กำลังลาก
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  // State สำหรับ Task Detail Modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM' as TaskPriority,
    columnId: '',
    assigneeId: '',
    reminderAt: '',
  });

  // State สำหรับ checkbox เลือกงาน
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());

  // State สำหรับแสดงงานที่เก็บถาวร
  const [showArchived, setShowArchived] = useState(false);

  // State สำหรับแฟ้มเก็บถาวรงาน
  const [folders, setFolders] = useState<TaskFolder[]>([]);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderFilter, setFolderFilter] = useState<number | 'ALL'>('ALL');
  // เป้าหมายที่กำลังจะเก็บถาวร (รอเลือกแฟ้มก่อนยืนยัน) - single = งานเดียว, bulk = งานที่เลือกไว้หลายรายการ
  const [archiveTarget, setArchiveTarget] = useState<{ type: 'single'; taskId: number } | { type: 'bulk' } | null>(null);
  const [archiveFolderChoice, setArchiveFolderChoice] = useState('');

  /**
   * ดึงข้อมูลจาก API (คอลัมน์/งาน/ผู้ใช้ ไม่ขึ้นต่อกัน ยิงพร้อมกันได้)
   */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const tasksUrl = `/api/tasks?scope=${scope}${showArchived ? '&showArchived=true' : ''}`;
        const [columnsResponse, tasksResponse, usersResponse, foldersResponse] = await Promise.all([
          fetch('/api/columns'),
          fetch(tasksUrl),
          fetch('/api/users'),
          fetch('/api/task-folders'),
        ]);

        const [columnsData, tasksData, usersData, foldersData] = await Promise.all([
          columnsResponse.json(),
          tasksResponse.json(),
          usersResponse.json(),
          foldersResponse.json(),
        ]);

        if (columnsResponse.ok && columnsData.success) {
          setColumns(columnsData.data);
        }

        if (tasksResponse.ok && tasksData.success) {
          setTasks(tasksData.data);
        }

        if (usersResponse.ok && usersData.success) {
          setUsers(usersData.data);
        }

        if (foldersResponse.ok && foldersData.success) {
          setFolders(foldersData.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    setSelectedTaskIds(new Set()); // เปลี่ยนบอร์ด/ตัวกรอง: ล้างงานที่เลือกค้างไว้ (กันลบ/เก็บถาวรข้ามบอร์ดโดยไม่ตั้งใจ)
  }, [showArchived, scope]);

  /**
   * ฟังก์ชันเริ่มลากงาน
   */
  const handleDragStart = (task: Task) => {
    if (!canEditBoard) return; // งานส่วนรวม: ย้ายได้เฉพาะ ADMIN/SUPER_ADMIN
    setDraggedTask(task);
  };

  /**
   * ฟังก์ชันอนุญาตให้วาง
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  /**
   * ฟังก์ชันวางงานในคอลัมน์ใหม่
   */
  const handleDrop = async (e: React.DragEvent, columnId: number) => {
    e.preventDefault();
    
    if (!canEditBoard || !draggedTask || draggedTask.columnId === columnId) return;
    
    // อัปเดต UI ทันที (Optimistic Update)
    const updatedTasks = tasks.map(t =>
      t.id === draggedTask.id ? { ...t, columnId } : t
    );
    setTasks(updatedTasks);
    
    try {
      // ส่งข้อมูลไปยัง API
      const response = await fetch(`/api/tasks/${draggedTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId }),
      });
      
      if (!response.ok) {
        // ถ้าไม่สำเร็จ ให้คืนค่าเดิม
        setTasks(tasks);
        const data = await response.json();
        throw new Error(data.message || 'ไม่สามารถอัปเดตสถานะได้');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setDraggedTask(null);
    }
  };

  /**
   * ฟังก์ชันสร้างงานใหม่
   */
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newTask.title.trim()) return;
    
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTask,
          columnId: newTask.columnId ? parseInt(newTask.columnId) : columns[0]?.id,
          assigneeId: newTask.assigneeId ? parseInt(newTask.assigneeId) : undefined,
          scope,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'ไม่สามารถสร้างงานได้');
      }
      
      if (data.success) {
        setTasks([...tasks, data.data]);
        setIsTaskModalOpen(false);
        setNewTask({
          title: '',
          description: '',
          priority: 'MEDIUM',
          columnId: '',
          assigneeId: '',
          reminderAt: '',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ฟังก์ชันสร้างคอลัมน์ใหม่
   */
  const handleCreateColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newColumn.name.trim()) return;
    
    try {
      const response = await fetch('/api/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newColumn),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'ไม่สามารถสร้างคอลัมน์ได้');
      }
      
      if (data.success) {
        setColumns([...columns, data.data]);
        setNewColumn({ name: '', color: 'slate' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ฟังก์ชันลบคอลัมน์
   */
  const handleDeleteColumn = async (columnId: number) => {
    const column = columns.find(c => c.id === columnId);
    
    // ตรวจสอบว่ามีงานในคอลัมน์หรือไม่ (แปลงเป็น number เพื่อเปรียบเทียบ)
    const tasksInColumn = tasks.filter(t => Number(t.columnId) === columnId);
    if (tasksInColumn.length > 0) {
      alert(`ไม่สามารถลบคอลัมน์นี้ได้ เนื่องจากมีงาน ${tasksInColumn.length} รายการอยู่ในคอลัมน์`);
      return;
    }
    
    if (!confirm('ต้องการลบคอลัมน์นี้ใช่หรือไม่?')) return;
    
    try {
      const response = await fetch(`/api/columns/${columnId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'ไม่สามารถลบคอลัมน์ได้');
      }
      
      setColumns(columns.filter(c => c.id !== columnId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ฟังก์ชันสร้างแฟ้มเก็บถาวรงานใหม่
   */
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const response = await fetch('/api/task-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'ไม่สามารถสร้างแฟ้มได้');
      }

      if (data.success) {
        setFolders([...folders, data.data]);
        setNewFolderName('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ฟังก์ชันลบแฟ้มเก็บถาวรงาน (งานที่เคยอยู่ในแฟ้มจะกลายเป็นไม่มีแฟ้ม ไม่ถูกลบตาม)
   */
  const handleDeleteFolder = async (folderId: number) => {
    if (!confirm('ต้องการลบแฟ้มนี้ใช่หรือไม่? งานที่เก็บไว้ในแฟ้มจะไม่ถูกลบ แต่จะไม่มีแฟ้มอีกต่อไป')) return;

    try {
      const response = await fetch(`/api/task-folders/${folderId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'ไม่สามารถลบแฟ้มได้');
      }

      setFolders(folders.filter(f => f.id !== folderId));
      if (folderFilter === folderId) setFolderFilter('ALL');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ยืนยันเก็บถาวร (หลังเลือกแฟ้มในหน้าต่างยืนยัน) - ใช้ได้ทั้งงานเดียวและแบบเลือกหลายรายการ
   */
  const confirmArchive = async () => {
    if (!archiveTarget) return;
    const folderId = archiveFolderChoice ? parseInt(archiveFolderChoice) : null;

    if (archiveTarget.type === 'single') {
      await handleArchiveTask(archiveTarget.taskId, true, folderId);
    } else {
      await handleBulkArchive(folderId);
    }

    setArchiveTarget(null);
    setArchiveFolderChoice('');
  };

  /**
   * ฟังก์ชันย้ายลำดับคอลัมน์ (ขึ้น)
   */
  const moveColumnUp = async (index: number) => {
    if (index === 0) return;
    
    const sortedColumns = [...columns].sort((a, b) => a.order - b.order);
    const newOrder = [...sortedColumns];
    [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
    
    // อัปเดต UI ทันที
    setColumns(newOrder.map((col, i) => ({ ...col, order: i })));
    
    // ส่งไป API
    try {
      await fetch('/api/columns/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnIds: newOrder.map(c => c.id) }),
      });
    } catch (err) {
      setError('ไม่สามารถบันทึกลำดับคอลัมน์ได้');
    }
  };

  /**
   * ฟังก์ชันย้ายลำดับคอลัมน์ (ลง)
   */
  const moveColumnDown = async (index: number) => {
    const sortedColumns = [...columns].sort((a, b) => a.order - b.order);
    if (index === sortedColumns.length - 1) return;
    
    const newOrder = [...sortedColumns];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    
    // อัปเดต UI ทันที
    setColumns(newOrder.map((col, i) => ({ ...col, order: i })));
    
    // ส่งไป API
    try {
      await fetch('/api/columns/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnIds: newOrder.map(c => c.id) }),
      });
    } catch (err) {
      setError('ไม่สามารถบันทึกลำดับคอลัมน์ได้');
    }
  };

  /**
   * ฟังก์ชันลบงาน
   */
  const handleDeleteTask = async (taskId: number) => {
    if (!confirm('ต้องการลบงานนี้ใช่หรือไม่?')) return;
    
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'ไม่สามารถลบงานได้');
      }
      
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * เปิด Task Detail Modal
   */
  const openTaskDetail = (task: Task) => {
    setSelectedTask(task);
    setIsEditing(false);
    setEditForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      columnId: String(task.columnId),
      assigneeId: task.assigneeId ? String(task.assigneeId) : '',
      reminderAt: task.reminderAt ? new Date(task.reminderAt).toISOString().slice(0, 16) : '',
    });
    setIsDetailModalOpen(true);
  };

  /**
   * บันทึกการแก้ไข Task
   */
  const handleSaveEdit = async () => {
    if (!selectedTask || !editForm.title.trim()) return;

    try {
      const response = await fetch(`/api/tasks/${selectedTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description || null,
          priority: editForm.priority,
          columnId: editForm.columnId ? parseInt(editForm.columnId) : undefined,
          assigneeId: editForm.assigneeId ? parseInt(editForm.assigneeId) : null,
          reminderAt: editForm.reminderAt || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'ไม่สามารถอัปเดตงานได้');

      if (data.success) {
        setTasks(tasks.map(t => t.id === selectedTask.id ? data.data : t));
        setSelectedTask(data.data);
        setIsEditing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * เก็บถาวร / ยกเลิกเก็บถาวร Task
   */
  const handleArchiveTask = async (taskId: number, archive: boolean, folderId?: number | null) => {
    try {
      const body: { archivedAt: string | null; folderId?: number | null } = {
        archivedAt: archive ? new Date().toISOString() : null,
      };
      if (archive) body.folderId = folderId ?? null;

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'เกิดข้อผิดพลาด');

      if (data.success) {
        if (archive && !showArchived) {
          setTasks(tasks.filter(t => t.id !== taskId));
        } else {
          setTasks(tasks.map(t => t.id === taskId ? data.data : t));
        }
        if (selectedTask?.id === taskId) {
          setIsDetailModalOpen(false);
          setSelectedTask(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * Toggle checkbox เลือกงาน
   */
  const toggleTaskSelection = (taskId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  /**
   * ลบงานที่เลือกทั้งหมด
   */
  const handleBulkDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    if (!confirm(`ต้องการลบงาน ${selectedTaskIds.size} รายการใช่หรือไม่?`)) return;

    try {
      for (const taskId of Array.from(selectedTaskIds)) {
        await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      }
      setTasks(tasks.filter(t => !selectedTaskIds.has(t.id)));
      setSelectedTaskIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * เก็บถาวรงานที่เลือกทั้งหมด
   */
  const handleBulkArchive = async (folderId?: number | null) => {
    if (selectedTaskIds.size === 0) return;

    try {
      for (const taskId of Array.from(selectedTaskIds)) {
        await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archivedAt: new Date().toISOString(), folderId: folderId ?? null }),
        });
      }
      if (!showArchived) {
        setTasks(tasks.filter(t => !selectedTaskIds.has(t.id)));
      }
      setSelectedTaskIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  // ตรวจสอบสิทธิ์จัดการคอลัมน์
  // คอลัมน์เป็นของส่วนกลางทั้งสองบอร์ด: จัดการได้เฉพาะ ADMIN/SUPER_ADMIN
  const canManageColumns = isBoardAdmin;

  // จัดกลุ่มงานตามคอลัมน์ (คำนวณครั้งเดียวแทนการ filter ซ้ำต่อคอลัมน์ทุก render)
  const tasksByColumn = useMemo(() => {
    // กรองตามแฟ้ม (มีผลเฉพาะงานที่เก็บถาวรแล้ว งานที่ยังไม่เก็บถาวรแสดงเสมอ)
    const visibleTasks =
      folderFilter === 'ALL' ? tasks : tasks.filter(t => !t.archivedAt || t.folderId === folderFilter);

    const map = new Map<number, typeof tasks>();
    for (const t of visibleTasks) {
      const key = Number(t.columnId);
      const arr = map.get(key);
      if (arr) arr.push(t); else map.set(key, [t]);
    }
    return map;
  }, [tasks, folderFilter]);

  // แสดง loading ขณะโหลดข้อมูล
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // เรียงคอลัมน์ตามลำดับ
  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      {/* หัวข้อหน้า */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">จัดการโปรเจค (Kanban)</h1>
          <p className="text-slate-500 mt-1">
            {canEditBoard
              ? 'ลากและวางงานเพื่อเปลี่ยนสถานะ · คลิกที่งานเพื่อดูรายละเอียด'
              : 'งานส่วนรวม — ดูได้ทุกคน แก้ไขได้เฉพาะผู้ดูแลระบบ · คลิกที่งานเพื่อดูรายละเอียด'}
          </p>
          {/* สลับบอร์ด ส่วนรวม / ส่วนตัว */}
          <div className="inline-flex mt-3 rounded-lg border border-slate-200 overflow-hidden bg-white" role="tablist">
            {([
              ['shared', 'ส่วนรวม'],
              ['private', 'ส่วนตัว'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={scope === key}
                onClick={() => setScope(key)}
                className={cn(
                  'px-4 py-1.5 text-sm font-medium transition-colors',
                  scope === key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Bulk actions */}
          {canEditBoard && selectedTaskIds.size > 0 && (
            <>
              <button
                onClick={() => setArchiveTarget({ type: 'bulk' })}
                className="flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-2 rounded-lg hover:bg-amber-200 transition-colors text-sm"
              >
                <Archive size={16} />
                <span>เก็บถาวร ({selectedTaskIds.size})</span>
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-2 bg-rose-100 text-rose-700 px-3 py-2 rounded-lg hover:bg-rose-200 transition-colors text-sm"
              >
                <Trash2 size={16} />
                <span>ลบ ({selectedTaskIds.size})</span>
              </button>
              <button
                onClick={() => setSelectedTaskIds(new Set())}
                className="flex items-center gap-2 bg-slate-100 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors text-sm"
              >
                <X size={16} />
                <span>ยกเลิก</span>
              </button>
            </>
          )}
          {/* Toggle แสดงงานที่เก็บถาวร */}
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm",
              showArchived
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {showArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            <span>{showArchived ? 'ซ่อนงานเก็บถาวร' : 'แสดงงานเก็บถาวร'}</span>
          </button>
          {/* ตัวกรองแฟ้ม - แสดงเฉพาะตอนเปิดดูงานเก็บถาวร */}
          {showArchived && folders.length > 0 && (
            <select
              value={folderFilter === 'ALL' ? 'ALL' : String(folderFilter)}
              onChange={(e) => setFolderFilter(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value))}
              className="text-sm rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="ALL">ทุกแฟ้ม</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          )}
          {canManageFolders && scope === 'shared' && (
            <button
              onClick={() => setIsFolderModalOpen(true)}
              className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <FolderOpen size={18} />
              <span>จัดการแฟ้ม</span>
            </button>
          )}
          {canManageColumns && (
            <button
              onClick={() => setIsColumnModalOpen(true)}
              className={cn(
                "flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg",
                "hover:bg-slate-200 transition-colors"
              )}
            >
              <Settings size={18} />
              <span>จัดการคอลัมน์</span>
            </button>
          )}
          {canEditBoard && (
          <button
            onClick={() => setIsTaskModalOpen(true)}
            className={cn(
              "flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg",
              "hover:bg-indigo-700 transition-colors shadow-sm"
            )}
          >
            <Plus size={18} />
            <span>เพิ่มงานใหม่</span>
          </button>
          )}
        </div>
      </div>

      {/* แสดงข้อผิดพลาด */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-500" />
          <p className="text-rose-600">{error}</p>
        </div>
      )}

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4 bg-slate-50 rounded-lg p-4 min-h-[calc(100vh-200px)]">
        <div className="flex gap-6 min-w-max">
          {sortedColumns.map((column) => {
            const colors = columnColors[column.color] || columnColors.slate;
            const columnTasks = tasksByColumn.get(column.id) || [];
            
            return (
              <div
                key={column.id}
                className={cn(
                  "w-80 rounded-xl p-4 border-2 min-h-[400px]",
                  colors.bg,
                  colors.border
                )}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {/* หัวข้อคอลัมน์ */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-900">{column.name}</h3>
                  <span className="bg-white px-2 py-1 rounded text-xs font-semibold text-slate-600 shadow-sm">
                    {columnTasks.length}
                  </span>
                </div>

                {/* รายการงาน */}
                <div className="space-y-3">
                  {columnTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable={canEditBoard}
                      onDragStart={() => handleDragStart(task)}
                      onClick={() => openTaskDetail(task)}
                      className={cn(
                        "bg-white p-4 rounded-lg shadow-sm border border-slate-200",
                        "cursor-pointer hover:shadow-md transition-all group relative",
                        selectedTaskIds.has(task.id) && "ring-2 ring-indigo-400",
                        task.archivedAt && "opacity-60"
                      )}
                    >
                      {/* Checkbox + ปุ่มลบ (เฉพาะผู้ที่แก้ไขบอร์ดนี้ได้) */}
                      {canEditBoard && (
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <button
                          onClick={(e) => toggleTaskSelection(task.id, e)}
                          className="text-slate-300 hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {selectedTaskIds.has(task.id) ? <CheckSquare size={14} className="text-indigo-500 !opacity-100" /> : <Square size={14} />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                          className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      )}

                      {/* Priority Badge + Archive Badge */}
                      <div className="mb-2 flex items-center gap-1.5 flex-wrap">
                        <span
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider",
                            priorityColors[task.priority].bg,
                            priorityColors[task.priority].text
                          )}
                        >
                          {priorityColors[task.priority].label}
                        </span>
                        {task.archivedAt && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-600 font-bold">
                            เก็บถาวร
                          </span>
                        )}
                        {task.archivedAt && task.folder && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                            <FolderOpen size={10} />
                            {task.folder.name}
                          </span>
                        )}
                        {task.reminderAt && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                            <Bell size={12} />
                            {new Date(task.reminderAt).toLocaleString('th-TH', { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      {/* ชื่องาน */}
                      <p className="font-medium text-slate-800 mb-3 pr-8">
                        {task.title}
                      </p>

                      {/* ผู้รับผิดชอบ */}
                      {task.assignee && (
                        <div className="flex items-center gap-2 mt-auto">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 border border-indigo-200">
                            {task.assignee.avatar || task.assignee.name.charAt(0)}
                          </div>
                          <span className="text-xs text-slate-500">
                            {task.assignee.name}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal สร้างงานใหม่ */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800">เพิ่มงานใหม่</h3>
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ชื่องาน <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="ระบุสิ่งที่ต้องทำ..."
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  รายละเอียด
                </label>
                <textarea
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none resize-none"
                  placeholder="รายละเอียดเพิ่มเติม..."
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  คอลัมน์
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                  value={newTask.columnId}
                  onChange={(e) => setNewTask({ ...newTask, columnId: e.target.value })}
                >
                  <option value="">เลือกคอลัมน์...</option>
                  {sortedColumns.map((col) => (
                    <option key={col.id} value={col.id}>{col.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ความสำคัญ
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                  value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as TaskPriority })}
                >
                  <option value="LOW">ต่ำ</option>
                  <option value="MEDIUM">ปานกลาง</option>
                  <option value="HIGH">สูง</option>
                  <option value="URGENT">เร่งด่วน</option>
                </select>
              </div>

              {scope === 'shared' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ผู้รับผิดชอบ
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                  value={newTask.assigneeId}
                  onChange={(e) => setNewTask({ ...newTask, assigneeId: e.target.value })}
                >
                  <option value="">เลือกพนักงาน...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
              )}

              {scope === 'shared' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <span className="flex items-center gap-1.5"><Clock size={14} /> กำหนดการ (วัน/เวลา)</span>
                </label>
                <input
                  type="datetime-local"
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                  value={newTask.reminderAt}
                  onChange={(e) => setNewTask({ ...newTask, reminderAt: e.target.value })}
                />
                <p className="text-xs text-slate-400 mt-1">เมื่อถึงเวลานี้ ระบบจะส่งแจ้งเตือนเข้ากลุ่ม LINE ให้อัตโนมัติ</p>
              </div>
              )}

              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 font-medium transition-colors"
              >
                บันทึกงาน
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal จัดการคอลัมน์ */}
      {isColumnModalOpen && canManageColumns && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800">จัดการคอลัมน์</h3>
              <button
                onClick={() => setIsColumnModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* รายการคอลัมน์ปัจจุบัน */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-3">คอลัมน์ปัจจุบัน (ลากเพื่อจัดเรียง)</h4>
                <div className="space-y-2">
                  {sortedColumns.map((column, index) => (
                    <div
                      key={column.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <GripVertical className="w-4 h-4 text-slate-400" />
                        <div
                          className={cn(
                            "w-4 h-4 rounded",
                            columnColors[column.color]?.bg || 'bg-slate-200'
                          )}
                        />
                        <span className="font-medium text-slate-700">{column.name}</span>
                        {column.isDefault && (
                          <span className="text-xs text-slate-400">(ค่าเริ่มต้น)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {/* ปุ่มย้ายขึ้น */}
                        <button
                          onClick={() => moveColumnUp(index)}
                          disabled={index === 0}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft size={16} className="rotate-90" />
                        </button>
                        {/* ปุ่มย้ายลง */}
                        <button
                          onClick={() => moveColumnDown(index)}
                          disabled={index === sortedColumns.length - 1}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronRight size={16} className="rotate-90" />
                        </button>
                        {/* ปุ่มลบ */}
                        {!column.isDefault && (
                          <button
                            onClick={() => handleDeleteColumn(column.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-100 rounded ml-2"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ฟอร์มเพิ่มคอลัมน์ใหม่ */}
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-3">เพิ่มคอลัมน์ใหม่</h4>
                <form onSubmit={handleCreateColumn} className="space-y-3">
                  <div>
                    <input
                      type="text"
                      placeholder="ชื่อคอลัมน์"
                      value={newColumn.name}
                      onChange={(e) => setNewColumn({ ...newColumn, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newColumn.name.trim()) {
                            handleCreateColumn(e);
                          }
                        }
                      }}
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-900 mb-2">สี</label>
                    <div className="flex gap-2">
                      {Object.entries(columnColors).map(([color, styles]) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewColumn({ ...newColumn, color })}
                          className={cn(
                            "w-8 h-8 rounded-lg border-2 transition-all",
                            styles.bg,
                            newColumn.color === color ? 'border-slate-800' : 'border-transparent'
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    เพิ่มคอลัมน์
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal จัดการแฟ้มเก็บถาวรงาน */}
      {isFolderModalOpen && canManageFolders && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800">จัดการแฟ้มเก็บถาวรงาน</h3>
              <button
                onClick={() => setIsFolderModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-3">แฟ้มปัจจุบัน</h4>
                {folders.length === 0 ? (
                  <p className="text-sm text-slate-400">ยังไม่มีแฟ้ม</p>
                ) : (
                  <div className="space-y-2">
                    {folders.map((folder) => (
                      <div
                        key={folder.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <FolderOpen size={16} className="text-slate-400" />
                          <span className="font-medium text-slate-700">{folder.name}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteFolder(folder.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-100 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-3">เพิ่มแฟ้มใหม่</h4>
                <form onSubmit={handleCreateFolder} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ชื่อแฟ้ม"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="flex-1 border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <FolderPlus size={16} />
                    เพิ่ม
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal เลือกแฟ้มก่อนเก็บถาวร */}
      {archiveTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Archive size={18} />
                เก็บถาวรงาน{archiveTarget.type === 'bulk' ? ` (${selectedTaskIds.size} รายการ)` : ''}
              </h3>
              <button
                onClick={() => { setArchiveTarget(null); setArchiveFolderChoice(''); }}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">เก็บเข้าแฟ้ม (ไม่บังคับ)</label>
                <select
                  value={archiveFolderChoice}
                  onChange={(e) => setArchiveFolderChoice(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">ไม่ระบุแฟ้ม</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setArchiveTarget(null); setArchiveFolderChoice(''); }}
                  className="px-4 py-2.5 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={confirmArchive}
                  className="flex items-center gap-2 bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-amber-700 transition-colors"
                >
                  <Archive size={16} />
                  เก็บถาวร
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal รายละเอียดงาน */}
      {isDetailModalOpen && selectedTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Eye size={18} />
                {isEditing ? 'แก้ไขงาน' : 'รายละเอียดงาน'}
              </h3>
              <div className="flex items-center gap-1">
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                    title="แก้ไข"
                  >
                    <Edit3 size={18} />
                  </button>
                )}
                <button
                  onClick={() => { setIsDetailModalOpen(false); setSelectedTask(null); setIsEditing(false); }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 overflow-y-auto">
              {isEditing ? (
                <>
                  {/* Edit Mode */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ชื่องาน <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">รายละเอียด</label>
                    <textarea
                      rows={3}
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none resize-none"
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">คอลัมน์</label>
                      <select
                        className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                        value={editForm.columnId}
                        onChange={(e) => setEditForm({ ...editForm, columnId: e.target.value })}
                      >
                        {sortedColumns.map((col) => (
                          <option key={col.id} value={col.id}>{col.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">ความสำคัญ</label>
                      <select
                        className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                        value={editForm.priority}
                        onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as TaskPriority })}
                      >
                        <option value="LOW">ต่ำ</option>
                        <option value="MEDIUM">ปานกลาง</option>
                        <option value="HIGH">สูง</option>
                        <option value="URGENT">เร่งด่วน</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ผู้รับผิดชอบ</label>
                    <select
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                      value={editForm.assigneeId}
                      onChange={(e) => setEditForm({ ...editForm, assigneeId: e.target.value })}
                    >
                      <option value="">ไม่ระบุ</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>{user.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      <span className="flex items-center gap-1.5"><Clock size={14} /> แจ้งเตือน (วัน/เวลา)</span>
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                      value={editForm.reminderAt}
                      onChange={(e) => setEditForm({ ...editForm, reminderAt: e.target.value })}
                    />
                    <p className="text-xs text-slate-400 mt-1">เมื่อถึงเวลานี้ ระบบจะส่งแจ้งเตือนเข้ากลุ่ม LINE ให้อัตโนมัติ</p>
                    {editForm.reminderAt && (
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, reminderAt: '' })}
                        className="text-xs text-rose-500 hover:text-rose-700 mt-1 flex items-center gap-1"
                      >
                        <BellOff size={12} /> ลบการแจ้งเตือน
                      </button>
                    )}
                  </div>
                  {/* ปุ่มบันทึก / ยกเลิก */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                    >
                      <Save size={16} /> บันทึก
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 font-medium transition-colors"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* View Mode */}
                  <div>
                    <h4 className="text-lg font-bold text-slate-800">{selectedTask.title}</h4>
                    {selectedTask.description && (
                      <p className="text-slate-600 mt-2 whitespace-pre-wrap">{selectedTask.description}</p>
                    )}
                    {!selectedTask.description && (
                      <p className="text-slate-400 mt-2 italic">ไม่มีรายละเอียด</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">สถานะ</span>
                      <p className="font-medium text-slate-800 mt-0.5">
                        {columns.find(c => c.id === selectedTask.columnId)?.name || '-'}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">ความสำคัญ</span>
                      <p className="mt-0.5">
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded font-bold",
                          priorityColors[selectedTask.priority].bg,
                          priorityColors[selectedTask.priority].text
                        )}>
                          {priorityColors[selectedTask.priority].label}
                        </span>
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">ผู้รับผิดชอบ</span>
                      <p className="font-medium text-slate-800 mt-0.5">
                        {selectedTask.assignee?.name || <span className="text-slate-400 italic">ไม่ระบุ</span>}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">สร้างเมื่อ</span>
                      <p className="font-medium text-slate-800 mt-0.5">
                        {new Date(selectedTask.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {/* แจ้งเตือน */}
                  <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      {selectedTask.reminderAt ? (
                        <>
                          <Bell size={14} className="text-amber-500" />
                          <span className="text-slate-600">แจ้งเตือน:</span>
                          <span className="font-medium text-slate-800">
                            {new Date(selectedTask.reminderAt).toLocaleString('th-TH', { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {selectedTask.reminderSentAt ? (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">ส่งเข้ากลุ่ม LINE แล้ว</span>
                          ) : (
                            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">รอส่ง</span>
                          )}
                        </>
                      ) : (
                        <>
                          <BellOff size={14} className="text-slate-400" />
                          <span className="text-slate-400">ไม่มีการแจ้งเตือน</span>
                        </>
                      )}
                    </div>

                    {/* แจ้งเตือนอัตโนมัติ (คำนวณจากวันที่ของแจ้งเตือนด้านบน) */}
                    {selectedTask.reminderDayBeforeAt && (
                      <div className="flex items-center gap-2 text-sm pl-[22px]">
                        <span className="text-slate-500">ล่วงหน้า 1 วัน:</span>
                        <span className="font-medium text-slate-700">
                          {new Date(selectedTask.reminderDayBeforeAt).toLocaleString('th-TH', { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {selectedTask.reminderDayBeforeSentAt ? (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">ส่งแล้ว</span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">รอส่ง</span>
                        )}
                      </div>
                    )}
                    {selectedTask.reminderOnDayAt && (
                      <div className="flex items-center gap-2 text-sm pl-[22px]">
                        <span className="text-slate-500">วันจริง:</span>
                        <span className="font-medium text-slate-700">
                          {new Date(selectedTask.reminderOnDayAt).toLocaleString('th-TH', { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {selectedTask.reminderOnDaySentAt ? (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">ส่งแล้ว</span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">รอส่ง</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Archive status */}
                  {selectedTask.archivedAt && (
                    <div className="bg-amber-50 rounded-lg p-3 flex items-center gap-2 text-sm flex-wrap">
                      <Archive size={14} className="text-amber-600" />
                      <span className="text-amber-700">
                        เก็บถาวรเมื่อ {new Date(selectedTask.archivedAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                      {selectedTask.folder && (
                        <span className="flex items-center gap-1 text-slate-600">
                          <FolderOpen size={14} />
                          {selectedTask.folder.name}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Actions (View Mode only; เฉพาะผู้ที่แก้ไขบอร์ดนี้ได้) */}
            {!isEditing && canEditBoard && (
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
                >
                  <Edit3 size={14} /> แก้ไข
                </button>
                {selectedTask.archivedAt ? (
                  <button
                    onClick={() => handleArchiveTask(selectedTask.id, false)}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-100 text-emerald-700 py-2 rounded-lg hover:bg-emerald-200 text-sm font-medium transition-colors"
                  >
                    <ArchiveRestore size={14} /> ยกเลิกเก็บถาวร
                  </button>
                ) : (
                  <button
                    onClick={() => setArchiveTarget({ type: 'single', taskId: selectedTask.id })}
                    className="flex-1 flex items-center justify-center gap-2 bg-amber-100 text-amber-700 py-2 rounded-lg hover:bg-amber-200 text-sm font-medium transition-colors"
                  >
                    <Archive size={14} /> เก็บถาวร
                  </button>
                )}
                <button
                  onClick={() => { handleDeleteTask(selectedTask.id); setIsDetailModalOpen(false); setSelectedTask(null); }}
                  className="flex items-center justify-center gap-2 bg-rose-100 text-rose-700 py-2 px-4 rounded-lg hover:bg-rose-200 text-sm font-medium transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
