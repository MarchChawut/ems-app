#!/bin/sh
# ==================================================
# Deploy สคริปต์ — รันจากเครื่อง dev เอง (ไม่ใช่บน NAS)
# ==================================================
# ใช้สำหรับอัปเดตโค้ดบน Synology NAS + รีสตาร์ท ems-reminder-check.timer / ems-cron-healthcheck.timer
# ต้องตั้งค่า NAS_HOST/NAS_USER/NAS_PATH ก่อนรัน (หรือแก้ default ด้านล่าง)
#
# ครั้งแรกต้องทำตาม "Manual one-time steps" ใน plan ก่อน (สร้าง logs/,
# worker/.env.worker, ติดตั้ง systemd unit) — สคริปต์นี้แค่ build+rsync+restart
#
# ตัวอย่างการใช้งาน:
#   NAS_HOST=it-home423-1 NAS_USER=2morrow ./systemd/deploy.sh

set -e

NAS_HOST="${NAS_HOST:-it-home423-1}"
NAS_USER="${NAS_USER:-2morrow}"
NAS_PATH="${NAS_PATH:-/volume1/web/ems-app}"

echo "==> Build โปรเจกต์ (local)"
pnpm build

echo "==> Sync ไฟล์ไปยัง $NAS_USER@$NAS_HOST:$NAS_PATH"
rsync -avz \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude '.env.worker' \
  --exclude .next/cache \
  ./ "$NAS_USER@$NAS_HOST:$NAS_PATH/"

echo "==> ติดตั้ง dependencies + generate prisma client + apply migrations บน NAS"
ssh "$NAS_USER@$NAS_HOST" "cd $NAS_PATH && pnpm install --prod && pnpm exec prisma generate && pnpm exec prisma migrate deploy"

echo "==> รีสตาร์ท ems-reminder-check.timer + ems-cron-healthcheck.timer บน NAS"
ssh "$NAS_USER@$NAS_HOST" "sudo systemctl daemon-reload && sudo systemctl restart ems-reminder-check.timer ems-cron-healthcheck.timer && sudo systemctl status ems-reminder-check.timer ems-cron-healthcheck.timer --no-pager"

cat <<'EOF'

==> Deploy เสร็จแล้ว

หากยังไม่เคยทำ ให้ทำ manual one-time steps เหล่านี้บน NAS ด้วย (ดูรายละเอียดใน
plan file / systemd/ems-reminder-check.service / systemd/ems-cron-healthcheck.service):
  0. (ครั้งเดียว ตอน migrate จาก worker เดิม) ปิดและถอด service เดิมทิ้งก่อนติดตั้งของใหม่
     ไม่งั้น worker เก่า (แบบ persistent) กับ timer ใหม่จะรันซ้อนกัน:
     sudo systemctl disable --now ems-reminder-worker
     sudo rm -f /etc/systemd/system/ems-reminder-worker.service
     sudo systemctl daemon-reload
  1. หา user ที่รันแอป Next.js อยู่แล้ว (ps aux | grep "next start") แล้วใส่ใน
     User= ของ systemd/ems-reminder-check.service และ systemd/ems-cron-healthcheck.service
  2. mkdir -p <NAS_PATH>/logs
  3. สร้าง worker/.env.worker (chmod 600) ใส่ CRON_SECRET (ค่าเดียวกับใน .env)
     — ems-cron-healthcheck.service ใช้ .env เต็มไฟล์ (DATABASE_URL + LINE token)
     ไม่ใช่ worker/.env.worker เพราะต้อง query DB และยิง LINE เอง
  4. ตรวจ DSM Control Panel > Regional Options > Time Zone = Bangkok (GMT+7)
  5. ติดตั้ง systemd units ครั้งแรก:
     sudo cp systemd/ems-reminder-check.service systemd/ems-reminder-check.timer \
             systemd/ems-cron-healthcheck.service systemd/ems-cron-healthcheck.timer \
             /etc/systemd/system/
     sudo systemctl daemon-reload
     sudo systemctl enable --now ems-reminder-check.timer
     sudo systemctl enable --now ems-cron-healthcheck.timer
  6. ตั้ง DSM Task Scheduler รายสัปดาห์ให้รัน systemd/rotate-worker-log.sh
  7. (ไม่บังคับ) สมัคร healthchecks.io แล้วใส่ HEALTHCHECK_PING_URL ใน
     worker/.env.worker เพื่อเปิด dead man's switch (ปิด gap กรณี systemd/timer
     บนเครื่องตายทั้งระบบ ซึ่ง ems-cron-healthcheck เองก็จะไม่ทำงานด้วยในเคสนั้น)
EOF
