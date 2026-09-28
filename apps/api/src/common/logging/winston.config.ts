import * as path from 'path';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

/**
 * Winston logger configuration for the EpiReels API.
 *
 * The bootstrapping entry point replaces the default Nest logger with
 * `WinstonModule.createLogger(buildWinstonConfig())` so every
 * `Logger` / `LoggerService` injected across the app flows through the
 * same transports.
 *
 * Output destinations:
 *
 *   - `console` — always on. Coloured, human-readable during dev.
 *
 *   - `logs/combined-%DATE%.log` — every level, JSON per line, daily
 *      rotation (`winston-daily-rotate-file`). Files older than 14 days
 *      are pruned to keep the directory bounded.
 *
 *   - `logs/error-%DATE%.log` — `error` level only, same rotation
 *      policy. Keeping the failure stream separate makes it trivial to
 *      ship the file to an alert tool without sifting through info logs.
 *
 * Configuration via environment variables (see `apps/api/.env.example`):
 *
 *   - `LOG_LEVEL`   – minimum level (default: `info`, `debug` in dev).
 *   - `LOG_DIR`     – directory for rotated files (default: `./logs`
 *                     resolved against `process.cwd()`).
 *   - `LOG_DISABLE_FILE` – set to `true` to skip file transports
 *                     (useful for unit tests / ephemeral CI runners).
 */
export function buildWinstonConfig(): winston.LoggerOptions {
  const isDev = process.env.NODE_ENV !== 'production';
  const level =
    process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');
  const logDir = path.resolve(process.cwd(), process.env.LOG_DIR ?? './logs');
  const disableFile = (process.env.LOG_DISABLE_FILE ?? 'false').toLowerCase() === 'true';

  const consoleFormat = isDev
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike('EpiReels', {
          colors: true,
          prettyPrint: true,
        }),
      )
    : winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        winston.format.printf((info) => {
          const { timestamp, level: lvl, message, context, ms, ...rest } =
            info as winston.Logform.TransformableInfo & {
              context?: string;
              ms?: string;
            };
          const ctx = context ? ` [${context}]` : '';
          const meta = Object.keys(rest).length
            ? ` ${JSON.stringify(rest)}`
            : '';
          return `${timestamp} ${lvl}${ctx}${ms ? ` ${ms}` : ''}: ${message}${meta}`;
        }),
      );

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ];

  if (!disableFile) {
    const fileJson = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json(),
    );

    transports.push(
      new DailyRotateFile({
        dirname: logDir,
        filename: 'combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        format: fileJson,
      }),
      new DailyRotateFile({
        level: 'error',
        dirname: logDir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
        format: fileJson,
      }),
    );
  }

  return {
    level,
    levels: winston.config.npm.levels,
    transports,
    // Don't blow up the process when stderr isn't writable (e.g. CI
    // sandboxes that disconnect after the test). Winston's default
    // handlers already swallow write errors, this just guards against
    // rejecting the global promise.
    exitOnError: false,
  };
}
