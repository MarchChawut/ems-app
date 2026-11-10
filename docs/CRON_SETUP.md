# การตั้งค่าระบบแจ้งเตือน (Reminder Cron)

สถาปัตยกรรมเดียวกันทั้งสองสภาพแวดล้อม (Synology ปัจจุบัน / Linux server ราชการในอนาคต):

```
Task Scheduler / cron
        │  ทุก 1 นาที
        ▼
scripts/cron-reminders.sh (curl http://127.0.0.1:3000/api/cron/reminders)
        ▼
Next.js API Route (ตรวจ x-cron-secret + DB lock กันรันซ้อน)
        ▼
Prisma → MariaDB (หา task ที่ถึงเวลา + claim แบบ atomic กันส่งซ้ำ)
        ▼
LINE Messaging API (ส่งเข้ากลุ่ม)
```

จุดสำคัญ: cron ยิงเข้า **localhost** เท่านั้น ไม่ต้องเปิด inbound จากอินเทอร์เน็ต
จึงทำงานได้หลังไฟร์วอลล์ของหน่วยงานราชการ

## ขั้นตอนร่วม (ทำครั้งเดียว ทั้งสองสภาพแวดล้อม)

1. ตรวจว่า `.env` ของแอปมี `CRON_SECRET` (สุ่มด้วย `openssl rand -hex 32`)
2. สร้าง env ของ worker:

   ```sh
   cp worker/.env.worker.example worker/.env.worker
   chmod 600 worker/.env.worker
   # แก้ CRON_SECRET ให้ตรงกับ .env
   ```

3. `mkdir -p logs`
4. ตรวจ timezone เครื่อง = Asia/Bangkok (`date`) — บน DSM ดูที่
   Control Panel > Regional Options
5. ทดสอบด้วยมือ:

   ```sh
   ./scripts/cron-reminders.sh && tail -1 logs/worker.log
   ```

   ต้องเห็น `OK status=200`

## Synology DSM (ปัจจุบัน)

ใช้ **Task Scheduler** (ทนต่อ DSM update ต่างจาก systemd unit ที่ DSM อาจล้างทิ้ง):

1. Control Panel > Task Scheduler > Create > Scheduled Task > User-defined script
2. General: Task = `EMS Reminder Check`, User = user เดียวกับที่รัน `next start`
3. Schedule: Run daily, Frequency = **Every minute**, First run 00:00, Last run 23:59
4. Task Settings > Run command:

   ```sh
   /volume1/web/ems-app/scripts/cron-reminders.sh
   ```

5. OK > เลือก task > Run เพื่อทดสอบ แล้วดู `logs/worker.log`

Health check (แจ้ง LINE ถ้า cron ค้าง) — สร้างอีก task รันทุก 5 นาที:

```sh
cd /volume1/web/ems-app && /usr/local/bin/npx tsx worker/cron-healthcheck.ts >> logs/worker.log 2>&1
```

Log rotation — task รายสัปดาห์:

```sh
/volume1/web/ems-app/systemd/rotate-worker-log.sh
```

## Linux server (อนาคต)

### ทางเลือก A: crontab (ง่ายสุด ตรงตามแผนภาพ)

`crontab -e` ด้วย user ที่รันแอป:

```cron
* * * * *   /opt/ems-app/scripts/cron-reminders.sh
*/5 * * * * cd /opt/ems-app && npx tsx worker/cron-healthcheck.ts >> logs/worker.log 2>&1
0 3 * * 0   /opt/ems-app/systemd/rotate-worker-log.sh
```

### ทางเลือก B: systemd timer (ถ้าต้องการ Persistent=true catch-up หลัง reboot)

ใช้ unit ใน `systemd/` — ก่อนติดตั้งแก้ใน `.service` ทั้งสองไฟล์:
`WorkingDirectory=`, `ExecStart=` (path จริงของ npm/npx จาก `which npm`),
`User=` (user ที่รันแอป), และ path ใน `StandardOutput/StandardError`

```sh
sudo cp systemd/ems-reminder-check.{service,timer} \
        systemd/ems-cron-healthcheck.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ems-reminder-check.timer ems-cron-healthcheck.timer
systemctl list-timers 'ems-*'
```

หมายเหตุ: เลือก A หรือ B อย่างเดียว อย่ารันทั้งคู่ (แม้ API มี lock + atomic claim
กันส่งซ้ำอยู่แล้ว แต่จะเปลือง run และ log ปนกัน)

## กลไกกันพลาดที่มีในระบบ

ตาราง `cron_execution_logs` บันทึกทุก run, DB lock (`cron-lock.ts`) กันรันซ้อน,
atomic claim (`updateMany` เงื่อนไข `reminderSentAt: null`) กันส่งซ้ำ,
`worker/cron-healthcheck.ts` แจ้ง LINE ถ้า cron หยุดเดิน, และ
`HEALTHCHECK_PING_URL` (Healthchecks.io) เป็น dead man's switch ภายนอก

## Troubleshooting

ดู log: `tail -f logs/worker.log` — ถ้า `curl ล้มเหลว` แปลว่าแอปไม่ได้รันที่
port 3000 (ตรวจ `REMINDER_TARGET_URL`), ถ้า `status=401` แปลว่า `CRON_SECRET`
ใน `worker/.env.worker` ไม่ตรงกับ `.env` ของแอป, ถ้าส่งแล้วเวลาเพี้ยน ตรวจ
timezone เครื่องและค่า `TZ` ใน `.env`
