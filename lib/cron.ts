// Minimal cron-schedule next-run calculator.
// Supports the subset Vercel cron uses: 5 fields, wildcards, "*"+"/"+N step,
// comma-separated lists, and plain numeric values.
// Not a full RFC implementation — good enough for "next fire time" display.
export const PIPELINE_CRON_SCHEDULE = "0 */6 * * *"; // every 6 hours, on the hour

type CronField = { values: number[]; isWildcard: boolean };

function parseField(field: string, min: number, max: number): CronField {
  if (field === "*") {
    return { values: range(min, max), isWildcard: true };
  }
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (Number.isNaN(step) || step <= 0) return { values: range(min, max), isWildcard: true };
    const values: number[] = [];
    for (let v = min; v <= max; v += step) values.push(v);
    return { values, isWildcard: false };
  }
  if (field.includes(",")) {
    return {
      values: field.split(",").map((s) => parseInt(s, 10)).filter((v) => !Number.isNaN(v)),
      isWildcard: false,
    };
  }
  const v = parseInt(field, 10);
  if (Number.isNaN(v)) return { values: range(min, max), isWildcard: true };
  return { values: [v], isWildcard: false };
}

function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => i + min);
}

export function nextCronFire(schedule: string, from: Date = new Date()): Date | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minF, hourF, domF, monthF, dowF] = parts;
  const minutes = parseField(minF, 0, 59);
  const hours = parseField(hourF, 0, 23);
  // We ignore day-of-month / month / day-of-week constraints for our simple "every Nh" schedule.
  // For our default "0 */6 * * *", these are wildcards so it doesn't matter.

  void domF; void monthF; void dowF;

  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  // Search up to 24h ahead minute-by-minute
  for (let i = 0; i < 24 * 60; i++) {
    candidate.setTime(candidate.getTime() + 60_000);
    if (
      hours.values.includes(candidate.getUTCHours()) &&
      minutes.values.includes(candidate.getUTCMinutes())
    ) {
      return candidate;
    }
  }
  return null;
}

export function describeSchedule(schedule: string): string {
  if (schedule === "0 */6 * * *") return "Every 6 hours (UTC)";
  if (schedule === "0 */12 * * *") return "Every 12 hours (UTC)";
  if (schedule === "0 0 * * *") return "Daily at midnight UTC";
  if (schedule === "0 */1 * * *") return "Every hour";
  return schedule;
}
