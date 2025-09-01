import { Teacher, ScheduleEntry, Substitution } from '../types';

export const generateSubstitutionPlan = async (
  absentTeachersInfo: { teacher: Teacher; reason: string }[],
  allTeachers: Teacher[],
  timetable: ScheduleEntry[],
  absenceDay: string,
): Promise<Substitution[]> => {
  try {
    const response = await fetch('/.netlify/functions/gemini', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            absentTeachersInfo,
            allTeachers,
            timetable,
            absenceDay
        }),
    });

    if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error || `Request failed with status ${response.status}`);
    }

    const results = await response.json();
    return results.sort((a: Substitution, b: Substitution) => a.time.localeCompare(b.time));

  } catch (error) {
    console.error("Error calling Netlify function:", error);
    if (error instanceof Error) {
        throw new Error(`Gagal menjana pelan guru ganti: ${error.message}`);
    }
    throw new Error("Gagal menjana pelan guru ganti. Sila cuba lagi.");
  }
};
