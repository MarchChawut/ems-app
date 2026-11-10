#!/bin/sh
# ==================================================
# Cron Reminder Trigger (curl-based, portable)
# ==================================================
# ยิง GET /api/cron/reminders ทุก 1 นาที ตามสถาปัตยกรรม:
#   Task Scheduler / cron -> curl -> Next.js API -> Prisma -> MariaDB -> LINE
#
# ใช้ได้ทั้ง:
#   - Synology DSM: Control Panel > Task Scheduler > Scheduled Task > User-defined script
#     ตั้งรันทุก 1 นาที ด้วยคำสั่ง: /volume1/web/ems-admin/scripts/cron-reminders.sh
#   - Linux server: crontab -e แล้วเพิ่ม:
#     * * * * * /opt/ems-admin/scripts/cron-reminders.sh
#
# ต้องการแค่ sh + curl (ไม่ต้องมี Node ในเส้นทางนี้)
#
# Env (อ่านจาก worker/.env.worker ก่อน แล้ว fallback .env ของแอป):
#   CRON_SECRET           (จำเป็น) ต้องตรงกับ .env ของแอป
#   REMINDER_TARGET_URL   (ไม่บังคับ) default http://127.0.0.1:3000/api/cron/reminders
#   HEALTHCHECK_PING_URL  (ไม่บังคับ) Healthchecks.io dead man's switch
#   CRON_LOG_FILE         (ไม่บังคับ) default <app>/logs/worker.log

set -u

# หา root ของแอปจากตำแหน่งสคริปต์ (scripts/ อยู่ใต้ root เสมอ)
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_ROOT=$(dirname "$SCRIPT_DIR")

# โหลด env: .env.worker ก่อน (least privilege) แล้ว fallback .env
# ไม่ทับค่าที่ตั้งมาแล้วจาก environment ภายนอก
load_env() {
  [ -f "$1" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      \#*|'') continue ;;
    esac
    key=${line%%=*}
    key=$(printf '%s' "$key" | tr -d ' ')
    case "$key" in
      CRON_SECRET|REMINDER_TARGET_URL|HEALTHCHECK_PING_URL|CRON_LOG_FILE) ;;
      *) continue ;;
    esac
    # ข้ามถ้าตั้งค่าไว้แล้ว
    eval "current=\${$key:-}"
    [ -n "$current" ] && continue
    value=${line#*=}
    # ตัด quote หัวท้าย
    value=$(printf '%s' "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    eval "$key=\$value"
  done < "$1"
}

load_env "$APP_ROOT/worker/.env.worker"
load_env "$APP_ROOT/.env"

TARGET_URL=${REMINDER_TARGET_URL:-http://127.0.0.1:3000/api/cron/reminders}
LOG_FILE=${CRON_LOG_FILE:-$APP_ROOT/logs/worker.log}

mkdir -p "$(dirname "$LOG_FILE")"

ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }

log() {
  printf '%s [cron-reminders] %s\n' "$(ts)" "$1" >> "$LOG_FILE"
}

ping_healthcheck() {
  [ -n "${HEALTHCHECK_PING_URL:-}" ] || return 0
  curl -fsS -m 10 -o /dev/null "$HEALTHCHECK_PING_URL$1" 2>/dev/null || true
}

if [ -z "${CRON_SECRET:-}" ]; then
  log "ERROR: ไม่ได้ตั้งค่า CRON_SECRET (worker/.env.worker หรือ .env)"
  exit 1
fi

HTTP_CODE=$(curl -sS -m 50 -o /tmp/ems-cron-reminders-body.$$ -w '%{http_code}' \
  -H "x-cron-secret: $CRON_SECRET" "$TARGET_URL" 2>>"$LOG_FILE") || {
  log "ERROR: curl ล้มเหลว (เชื่อมต่อ $TARGET_URL ไม่ได้)"
  ping_healthcheck '/fail'
  rm -f /tmp/ems-cron-reminders-body.$$
  exit 1
}

BODY=$(cat /tmp/ems-cron-reminders-body.$$ 2>/dev/null || true)
rm -f /tmp/ems-cron-reminders-body.$$

if [ "$HTTP_CODE" = "200" ]; then
  log "OK status=$HTTP_CODE body=$BODY"
  ping_healthcheck ''
  exit 0
else
  log "ERROR: status=$HTTP_CODE body=$BODY"
  ping_healthcheck '/fail'
  exit 1
fi
