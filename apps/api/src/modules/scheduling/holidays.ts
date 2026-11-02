import { errors } from "../../lib/errors.ts";

export interface Holiday {
  date: string;
  name: string;
  type: "national_holiday" | "joint_leave";
}

export interface HolidayYear {
  holidays: Holiday[];
  sources: { title: string; url: string }[];
}

const cache = new Map<number, { expires: number; data: HolidayYear }>();

export async function indonesiaHolidays(year: number): Promise<HolidayYear> {
  const cached = cache.get(year);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const response = await fetch(`https://indonesian-holidays.ahrulsyamil.com/holidays/${year}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Provider unavailable");
    const body = await response.json() as { meta?: { year?: number; sources?: { title: string; url: string }[] }; data?: Holiday[] };
    if (body.meta?.year !== year || !Array.isArray(body.meta.sources) || !body.meta.sources.length || !Array.isArray(body.data) || !body.data.length || body.data.some((item) => !item.date?.startsWith(`${year}-`) || !item.name || !["national_holiday", "joint_leave"].includes(item.type))) throw new Error("Incomplete holiday data");
    const data = { holidays: body.data, sources: body.meta.sources };
    cache.set(year, { expires: Date.now() + 3_600_000, data });
    return data;
  } catch {
    throw errors.rule("HOLIDAY_DATA_UNAVAILABLE", `Indonesian holiday data for ${year} is unavailable. Try again when the official calendar is available.`);
  }
}
