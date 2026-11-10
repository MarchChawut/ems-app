/**
 * ==================================================
 * Dashboard — LeaveChart
 * ==================================================
 * กราฟแท่งสถิติการลาแยกตามรายบุคคล
 */

'use client';

import React from 'react';
import { Calendar } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { leaveTypeConfig, fmtDays } from './leaveTypeConfig';

interface LeaveChartProps {
  chartData: Record<string, any>[];
  activeLeaveTypes: string[];
}

export default function LeaveChart({ chartData, activeLeaveTypes }: LeaveChartProps) {
  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {activeLeaveTypes.map((type) => (
          <div key={type} className="flex items-center gap-1.5 text-xs">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: leaveTypeConfig[type].color }}
            />
            <span className="text-slate-600">{leaveTypeConfig[type].label}</span>
          </div>
        ))}
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={Math.max(400, chartData.length * 60)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            barCategoryGap="20%"
            barGap={2}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
              label={{
                value: 'วัน',
                position: 'insideBottomRight',
                offset: -5,
                style: { fontSize: 12, fill: '#94a3b8' },
              }}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 13, fill: '#334155' }}
              tickLine={false}
              axisLine={false}
              width={120}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                fontSize: '13px',
              }}
              formatter={(value: any, name?: string) => {
                const cfg = leaveTypeConfig[name || ''];
                return [`${fmtDays(value)} วัน`, cfg?.label || name];
              }}
            />
            <Legend
              formatter={(value: string) => {
                const cfg = leaveTypeConfig[value];
                return cfg?.label || value;
              }}
              wrapperStyle={{ fontSize: '13px' }}
            />

            {activeLeaveTypes.map((type) => (
              <Bar
                key={type}
                dataKey={type}
                fill={leaveTypeConfig[type].color}
                radius={[0, 4, 4, 0]}
                barSize={16}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-center py-12">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">ไม่มีข้อมูลการลาในช่วงที่เลือก</p>
        </div>
      )}
    </div>
  );
}
