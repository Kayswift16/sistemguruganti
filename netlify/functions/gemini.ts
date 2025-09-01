import { GoogleGenAI, Type } from "@google/genai";
import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

interface Teacher {
  id: string;
  name: string;
}

interface ScheduleEntry {
  day: string;
  time: string;
  class: string;
  subject: string;
  teacherId: string;
}

interface Substitution {
  day: string;
  time: string;
  class: string;
  subject: string;
  absentTeacherName: string;
  substituteTeacherId: string;
  substituteTeacherName: string;
  justification: string;
}

const generatePrompt = (
  absentTeacher: Teacher,
  reason: string,
  allTeachers: Teacher[],
  timetable: ScheduleEntry[],
  absenceDay: string,
): string => {
  const upperCaseAbsenceDay = absenceDay.toUpperCase();
  
  const relevantTimetableForDay = timetable.filter(entry => entry.day.toUpperCase() === upperCaseAbsenceDay);
  
  const absentTeacherSchedule = relevantTimetableForDay.filter(entry => entry.teacherId === absentTeacher.id);

  const availableTeachers = allTeachers.filter(t => t.id !== absentTeacher.id);

  return `
    Anda adalah Penolong Kanan Pentadbiran yang bijak di sebuah sekolah. Tugas anda adalah untuk mencari guru ganti terbaik untuk guru yang tidak hadir pada hari tertentu.

    MAKLUMAT KES:
    - Hari Tidak Hadir: ${absenceDay}
    - Guru Tidak Hadir: ${absentTeacher.name} (ID: ${absentTeacher.id})
    - Sebab Tidak Hadir: ${reason}
    - Jadual Waktu Penuh Sekolah untuk Hari ${absenceDay}: ${JSON.stringify(relevantTimetableForDay)}
    - Senarai Semua Guru Yang Boleh Mengganti: ${JSON.stringify(availableTeachers)}

    TUGASAN:
    Berdasarkan data yang diberikan, sila laksanakan langkah-langkah berikut untuk hari ${absenceDay} SAHAJA:
    1. Kenal pasti semua slot waktu mengajar untuk guru yang tidak hadir, ${absentTeacher.name}, pada hari ${absenceDay}.
    2. Untuk setiap slot waktu tersebut, cari semua guru yang tidak mempunyai kelas pada masa yang sama pada hari ${absenceDay}.
    3. Daripada senarai guru yang berkelapangan, cadangkan SATU guru ganti yang paling sesuai untuk setiap slot.
    4. Gunakan kriteria berikut untuk membuat cadangan:
        a. Keutamaan Tertinggi: Guru yang mengajar subjek yang sama.
        b. Keutamaan Kedua: Guru yang mengajar di tahun (kelas) yang sama.
        c. Keutamaan Ketiga: Guru yang mempunyai beban waktu mengajar paling sedikit pada hari tersebut untuk mengimbangi beban kerja.
    5. Sediakan justifikasi ringkas untuk setiap cadangan anda.
    6. JANGAN cadangkan guru yang sudah ada kelas pada slot masa tersebut.
    7. Kembalikan jawapan anda dalam format JSON sahaja, mengikut skema yang ditetapkan. Jangan sertakan sebarang teks atau penjelasan di luar struktur JSON.
    
    Berikut adalah jadual guru yang tidak hadir pada hari ${absenceDay}:
    ${JSON.stringify(absentTeacherSchedule)}
  `;
};

const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      day: { type: Type.STRING },
      time: { type: Type.STRING },
      class: { type: Type.STRING },
      subject: { type: Type.STRING },
      substituteTeacherId: { type: Type.STRING },
      substituteTeacherName: { type: Type.STRING },
      justification: { type: Type.STRING },
    },
    required: ["day", "time", "class", "subject", "substituteTeacherId", "substituteTeacherName", "justification"]
  },
};

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "API_KEY environment variable is not set" }) };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const { absentTeachersInfo, allTeachers, timetable, absenceDay } = JSON.parse(event.body || '{}');

    if (!absentTeachersInfo || !allTeachers || !timetable || !absenceDay) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters in request body." }) };
    }
    
    const promises = absentTeachersInfo.map(async ({ teacher, reason }: { teacher: Teacher, reason: string }) => {
      const prompt = generatePrompt(teacher, reason, allTeachers, timetable, absenceDay);
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.2,
        },
      });

      const jsonText = response.text.trim();
      const result = JSON.parse(jsonText) as Omit<Substitution, 'absentTeacherName'>[];
      
      return result.map(sub => ({
        ...sub,
        absentTeacherName: teacher.name,
      }));
    });

    const results = await Promise.all(promises);
    const flatResults = results.flat();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flatResults),
    };

  } catch (error: any) {
    console.error("Error in Netlify function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "An internal server error occurred." }),
    };
  }
};

export { handler };
