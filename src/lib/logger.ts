/**
 * ==================================================
 * Logger Service - ระบบบันทึก Log สำหรับ Production
 * ==================================================
 * แทนการใช้ console.log/console.error โดยตรง
 * Production: structured JSON ผ่าน pino (sync write ป้องกัน log หายก่อน process.exit)
 * Development: ANSI pretty-print เดิม
 *
 * การใช้งาน:
 * import { logger } from '@/lib/logger';
 * logger.info('User logged in', { userId: 123 });
 * logger.error('Database connection failed', { error });
 */

import pino from 'pino';

// Log Levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const VALID_LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  context?: {
    url?: string;
    method?: string;
    userAgent?: string;
    ip?: string;
  };
}

// Configuration
// LOG_LEVEL พิมพ์ผิด/ไม่ตรงกับ 4 ค่านี้ -> fallback เป็น 'info' (pino จะ throw ถ้า level ไม่ถูกต้อง)
const LOG_LEVEL: LogLevel = VALID_LOG_LEVELS.includes(process.env.LOG_LEVEL as LogLevel)
  ? (process.env.LOG_LEVEL as LogLevel)
  : 'info';

// pino instance สำหรับ production เท่านั้น
// sync: true ป้องกัน sonic-boom buffer ทำให้บรรทัดสุดท้ายหายก่อน process.exit() ใน worker (Type=oneshot)
const pinoLogger =
  process.env.NODE_ENV === 'production'
    ? pino(
        {
          level: LOG_LEVEL,
          base: null,
          messageKey: 'message',
          timestamp: pino.stdTimeFunctions.isoTime,
          formatters: {
            level: (label) => ({ level: label }),
          },
        },
        pino.destination({ sync: true })
      )
    : null;

// Log level priority (ใช้เฉพาะ dev path)
const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * ตรวจสอบว่าควร log หรือไม่ (dev path เท่านั้น - prod ให้ pino จัดการ level เอง)
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_PRIORITY[level] >= LOG_PRIORITY[LOG_LEVEL];
}

/**
 * ล้างข้อมูล sensitive ออกจาก log
 */
function sanitizeData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  
  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'authorization',
    'cookie',
    'session',
    'credential',
    'totp',
    'otp',
    'backupcode',
    'privatekey',
    'apikey',
    'signature', // ลายเซ็นดิจิทัล/ข้อมูล WebAuthn (ไม่ใช่รูปลายเซ็นพนักงาน)
  ];
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (value instanceof Error) {
      // Error message/stack เป็น non-enumerable -> Object.entries จะได้ {} ต้องดึงออกมาเอง
      sanitized[key] = {
        name: value.name,
        message: value.message,
        ...(typeof (value as { code?: unknown }).code !== 'undefined'
          ? { code: (value as { code?: unknown }).code }
          : {}),
        stack: value.stack,
      };
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * สร้าง log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
  context?: LogEntry['context']
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    data: sanitizeData(data),
    context,
  };
}

/**
 * แสดง log ใน console (development mode) หรือส่งเข้า pino (production)
 */
function logToConsole(entry: LogEntry): void {
  if (pinoLogger) {
    pinoLogger[entry.level]({ data: entry.data, context: entry.context }, entry.message);
    return;
  }

  const colors: Record<LogLevel, string> = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m',  // Green
    warn: '\x1b[33m',  // Yellow
    error: '\x1b[31m', // Red
  };
  
  const reset = '\x1b[0m';
  const color = colors[entry.level];
  
  let output = `${color}[${entry.level.toUpperCase()}]${reset} ${entry.timestamp} - ${entry.message}`;
  
  if (entry.data) {
    output += `\n  Data: ${JSON.stringify(entry.data, null, 2)}`;
  }
  
  if (entry.context) {
    output += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
  }
  
  switch (entry.level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'debug':
      console.debug(output);
      break;
    default:
      console.log(output);
  }
}

/**
 * Logger Class
 */
class Logger {
  private log(level: LogLevel, message: string, data?: Record<string, unknown>, context?: LogEntry['context']): void {
    if (!shouldLog(level)) {
      return;
    }
    
    const entry = createLogEntry(level, message, data, context);
    logToConsole(entry);
  }
  
  debug(message: string, data?: Record<string, unknown>, context?: LogEntry['context']): void {
    this.log('debug', message, data, context);
  }
  
  info(message: string, data?: Record<string, unknown>, context?: LogEntry['context']): void {
    this.log('info', message, data, context);
  }
  
  warn(message: string, data?: Record<string, unknown>, context?: LogEntry['context']): void {
    this.log('warn', message, data, context);
  }
  
  error(message: string, data?: Record<string, unknown>, context?: LogEntry['context']): void {
    this.log('error', message, data, context);
  }
  
  /**
   * สร้าง logger ที่มี context คงที่
   */
  withContext(context: LogEntry['context']): Logger {
    const childLogger = new Logger();

    childLogger['log'] = (level: LogLevel, message: string, data?: Record<string, unknown>, additionalContext?: LogEntry['context']) => {
      this.log(level, message, data, { ...context, ...additionalContext });
    };

    return childLogger;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for testing
export { Logger };
