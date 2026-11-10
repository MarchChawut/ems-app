/**
 * ==================================================
 * Dashboard — StatCard
 * ==================================================
 * การ์ดสถิติสำหรับแถว KPI บนแดชบอร์ด
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: number | string;
  subtext: string;
  icon: LucideIcon;
  borderColor: string;
  bgColor: string;
  iconColor: string;
  href?: string;
}

export default function StatCard({
  title,
  value,
  subtext,
  icon: Icon,
  borderColor,
  bgColor,
  iconColor,
  href,
}: StatCardProps) {
  const router = useRouter();

  return (
    <div
      onClick={href ? () => router.push(href) : undefined}
      className={cn(
        'bg-white rounded-xl p-6 shadow-sm border border-slate-200',
        'border-l-4',
        borderColor,
        'hover:shadow-md transition-shadow',
        href && 'cursor-pointer',
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-sm mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-slate-800">{value}</h3>
          <p className="text-xs text-slate-400 mt-2">{subtext}</p>
        </div>
        <div className={cn('p-3 rounded-lg', bgColor)}>
          <Icon className={cn('w-6 h-6', iconColor)} />
        </div>
      </div>
    </div>
  );
}
