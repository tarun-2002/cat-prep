/**
 * ISO 8601 week number and ISO week-year for a calendar date (YYYY-MM-DD, local).
 * Week 1 is the week with the first Thursday of the ISO year.
 */
export function isoWeekFromDateOnly(dateString: string): { isoYear: number; week: number } {
  const parts = dateString.split("-");
  if (parts.length !== 3) return { isoYear: 0, week: 0 };
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  const date = new Date(y, m, d, 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return { isoYear: 0, week: 0 };

  const thursday = new Date(date);
  thursday.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const isoYear = thursday.getFullYear();

  const week1Monday = new Date(isoYear, 0, 4, 12, 0, 0, 0);
  week1Monday.setDate(week1Monday.getDate() - ((week1Monday.getDay() + 6) % 7));

  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));

  const diffDays = Math.round((weekStart.getTime() - week1Monday.getTime()) / 86400000);
  const week = 1 + Math.floor(diffDays / 7);
  return { isoYear, week };
}
