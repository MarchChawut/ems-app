import React from 'react';
import { redirect } from 'next/navigation';
import { User as UserIcon, Mail, Phone, MapPin, Cake, Building2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getFullProfile } from '@/lib/profile';
import { roleConfig } from '@/lib/role-badge';
import SignatureUploader from '@/components/profile/SignatureUploader';

function formatDate(d: Date | string | null | undefined) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <Icon size={18} className="text-slate-400 mt-0.5 shrink-0" />
      <div>
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-sm text-slate-700 font-medium">{value || '-'}</div>
      </div>
    </div>
  );
}

export default async function ProfilePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/');
  }

  const user = await getFullProfile(currentUser.id);
  if (!user) {
    return <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">ไม่พบข้อมูลผู้ใช้</div>;
  }

  const role = roleConfig[user.role];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">ข้อมูลส่วนตัว</h1>
        <p className="text-slate-500 mt-1 text-sm">ข้อมูลของคุณในระบบ (ดูอย่างเดียว หากต้องการแก้ไขกรุณาติดต่อฝ่ายบุคคล/ผู้ดูแลระบบ)</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 flex items-center gap-4 border-b border-slate-100">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-xl border border-indigo-200 shrink-0">
            {user.avatar || user.name.charAt(0)}
          </div>
          <div>
            <div className="font-bold text-lg text-slate-800">{user.prefix ?? ''}{user.name}</div>
            <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${role.bg} ${role.text}`}>
              {role.label}
            </span>
          </div>
        </div>

        <div className="p-6">
          <InfoRow icon={UserIcon} label="ชื่อผู้ใช้" value={user.username} />
          <InfoRow icon={Mail} label="อีเมล" value={user.email ?? ''} />
          <InfoRow icon={Phone} label="เบอร์โทรศัพท์" value={user.phone ?? ''} />
          <InfoRow icon={Cake} label="วันเกิด" value={formatDate(user.birthday)} />
          <InfoRow icon={Building2} label="กอง" value={user.department ?? ''} />
          <InfoRow icon={Building2} label="สังกัด" value={user.division ?? ''} />
          <InfoRow icon={UserIcon} label="ตำแหน่ง" value={user.position ?? ''} />
          {user.positionSecond && (
            <InfoRow
              icon={UserIcon}
              label="ตำแหน่งรอง"
              value={user.positionLevel ? `${user.positionSecond} ระดับ ${user.positionLevel}` : user.positionSecond}
            />
          )}
          <InfoRow icon={MapPin} label="ที่อยู่" value={user.address ?? ''} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <SignatureUploader userId={user.id} signatureFileId={user.signatureFileId} />
      </div>
    </div>
  );
}
