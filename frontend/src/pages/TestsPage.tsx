import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList,
  Check, ArrowRight, ArrowLeft, RefreshCw, AlertCircle, Timer, CheckCircle2,
  Filter, Sparkles, GraduationCap, TrendingUp
} from 'lucide-react';

const AVAILABLE_GRADES = [6, 7, 8, 9, 10, 11];

interface Question {
  questionText: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface Test {
  _id?: string;
  grade: number;
  title: string;
  questions: Question[];
}

interface QuizResult {
  id: string;
  title: string;
  grade: number;
  score: number;
  total: number;
  date: string;
  answers: Record<number, number>;
  questions: Question[];
}

// Each quiz pulls exactly 20 questions, drawn from the visible pool.
const QUIZ_LENGTH = 20;

// Days since unix epoch (local midnight) — used as the daily window index.
const daysSinceEpoch = (): number => {
  const d = new Date();
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / (1000 * 60 * 60 * 24));
};

// Simple mulberry32 PRNG — good enough for daily shuffle, fully deterministic per seed.
const makeRng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const seededShuffle = <T,>(arr: T[], seed: number): T[] => {
  const rng = makeRng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Hash selected grades into a stable salt (so different grade combos rotate differently)
const gradesSalt = (grades: number[]): number => {
  return grades.slice().sort((a, b) => a - b).reduce((acc, g) => acc * 31 + g, 7);
};

const msUntilNextLocalMidnight = (): number => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
};

const STATIC_FALLBACK_TESTS: Record<string, Test[]> = {
  '11': [
    {
      title: "Konstitutsiya testlari",
      grade: 11,
      questions: [
        {
          questionText: "O'zbekiston Respublikasi Konstitutsiyasining 1-moddasiga ko'ra, O'zbekiston qanday davlat?",
          options: [
            "Suveren, demokratik, huquqiy, ijtimoiy va dunyoviy davlat",
            "Monarxiya shaklidagi unitar davlat",
            "Suveren, sotsialistik, dunyoviy davlat",
            "Federativ shakldagi demokratik davlat"
          ],
          correctAnswer: 0,
          explanation: "Konstitutsiyaning 1-moddasida: 'O‘zbekiston — boshqaruvning respublika shakliga ega bo‘lgan suveren, demokratik, huquqiy, ijtimoiy va dunyoviy davlat' deb belgilangan."
        },
        {
          questionText: "O'zbekiston Respublikasida davlat hokimiyatining birdan-bir manbai kim?",
          options: [
            "Oliy Majlis va deputatlar",
            "O'zbekiston Respublikasi Prezidenti",
            "O'zbekiston xalqi",
            "Vazirlar Mahkamasi"
          ],
          correctAnswer: 2,
          explanation: "Konstitutsiyaning 7-moddasida: 'Xalq davlat hokimiyatining birdan-bir manbaidir' deb belgilangan."
        },
        {
          questionText: "O'zbekiston Respublikasining davlat tili qaysi til?",
          options: [
            "Rus tili",
            "O'zbek tili",
            "Ingliz tili",
            "Qoraqalpoq tili"
          ],
          correctAnswer: 1,
          explanation: "Konstitutsiyaning 4-moddasiga muvofiq, O'zbekiston Respublikasining davlat tili o'zbek tilidir."
        },
        {
          questionText: "Konstitutsiyaga binoan, O'zbekiston Respublikasining poytaxti qaysi shahar?",
          options: [
            "Samarqand shahri",
            "Buxoro shahri",
            "Toshkent shahri",
            "Namangan shahri"
          ],
          correctAnswer: 2,
          explanation: "Konstitutsiyaning 6-moddasiga binoan O'zbekiston Respublikasining poytaxti - Toshkent shahri."
        },
        {
          questionText: "Jamiyat va davlat hayotining eng muhim masalalari qanday hal etiladi?",
          options: [
            "Faqat sudlar tomonidan",
            "Xalq muhokamasiga taqdim etiladi va referendumga qo'yiladi",
            "Prezident farmonlari orqali hal qilinadi",
            "Hokimlar qarorlari asosida hal etiladi"
          ],
          correctAnswer: 1,
          explanation: "Konstitutsiyaning 9-moddasida jamiyat va davlat hayotining eng muhim masalalari xalq muhokamasiga taqdim etilishi, referendumga qo'yilishi belgilangan."
        }
      ]
    },
    {
      title: "Mehnat huquqi testlari",
      grade: 11,
      questions: [
        {
          questionText: "Mehnat kodeksiga ko'ra, xodimning haftalik ish vaqti muddati necha soatdan oshmasligi kerak?",
          options: [
            "36 soatdan",
            "40 soatdan",
            "48 soatdan",
            "45 soatdan"
          ],
          correctAnswer: 1,
          explanation: "Mehnat kodeksiga muvofiq normal haftalik ish vaqti muddati 40 soatdan oshmasligi lozim."
        },
        {
          questionText: "Mehnat shartnomasi tuzishga odatda necha yoshdan yo'l qo'yiladi?",
          options: [
            "16 yoshdan",
            "18 yoshdan",
            "15 yoshdan",
            "14 yoshdan"
          ],
          correctAnswer: 0,
          explanation: "Mehnat shartnomasi tuzishga 16 yoshdan yo'l qo'yiladi (istisno hollarda 15 yoshdan)."
        },
        {
          questionText: "Xodimga yillik asosiy mehnat ta'tilining muddati kamida necha ish kuni qilib belgilanishi shart?",
          options: [
            "15 ish kuni",
            "18 ish kuni",
            "21 ish kuni",
            "24 ish kuni"
          ],
          correctAnswer: 3,
          explanation: "Yangi Mehnat kodeksiga binoan xodimlarga beriladigan yillik asosiy mehnat ta'tilining eng kam muddati 24 ish kunini tashkil etadi."
        }
      ]
    }
  ],
  '10': [
    {
      title: "Huquq asoslari testlari",
      grade: 10,
      questions: [
        {
          questionText: "Huquq normalarining davlat tomonidan majburiy qilib belgilangan xulq-atvor qoidalari tizimi nima deb ataladi?",
          options: [
            "Axloq qoidalari",
            "Huquq",
            "Konstitutsiya",
            "Qonunchilik"
          ],
          correctAnswer: 1,
          explanation: "Huquq normalarining davlat tomonidan muhofaza qilinadigan, majburiy xulq-atvor qoidalari tizimi huquq deb ataladi."
        },
        {
          questionText: "Davlat boshqaruv shakllari qaysilar?",
          options: [
            "Demokratik va diktatura",
            "Monarxiya va respublika",
            "Unitar va federativ",
            "Prezidentlik va parlamentar"
          ],
          correctAnswer: 1,
          explanation: "Davlat boshqaruv shakllari monarxiya (qirollik, amirlik) va respublika (prezidentlik, parlamentar, aralash) turlariga bo'linadi."
        }
      ]
    }
  ],
  '9': [
    {
      title: "Bola huquqlari to'g'risidagi konvensiya testlari",
      grade: 9,
      questions: [
        {
          questionText: "Bola huquqlari to'g'risidagi konvensiya BMT Bosh Assambleyasi tomonidan qachon qabul qilingan?",
          options: [
            "1989-yil 20-noyabrda",
            "1991-yil 1-sentabrda",
            "1948-yil 10-dekabrda",
            "2001-yil 11-sentabrda"
          ],
          correctAnswer: 0,
          explanation: "Bola huquqlari to'g'risidagi konvensiya BMT Bosh Assambleyasi tomonidan 1989-yil 20-noyabrda qabul qilingan."
        },
        {
          questionText: "Bola huquqlari to'g'risidagi konvensiyaga ko'ra, necha yoshga to'lmagan har qanday inson bola hisoblanadi?",
          options: [
            "16 yoshga",
            "18 yoshga",
            "14 yoshga",
            "21 yoshga"
          ],
          correctAnswer: 1,
          explanation: "Konvensiyaning 1-moddasiga ko'ra, har bir inson agar qonun bo'yicha u balog'at yoshiga ertaroq yetmagan bo'lsa, 18 yoshga to'lguniga qadar bola hisoblanadi."
        }
      ]
    }
  ]
};

// Extended question banks per grade (auto-attached to STATIC_FALLBACK_TESTS as bonus tests)
const EXTRA_BANK: Record<number, Question[]> = {
  6: [
    { questionText: "O'zbekiston Respublikasining nechta davlat ramzi bor?", options: ["2 ta", "3 ta", "4 ta", "5 ta"], correctAnswer: 1, explanation: "Davlat ramzlari uchta — bayroq, gerb va madhiya." },
    { questionText: "O'zbekiston Davlat bayrog'i nechta rangdan iborat?", options: ["2 ta", "3 ta", "4 ta", "5 ta"], correctAnswer: 1, explanation: "Bayroqda ko'k, oq va yashil ranglar mavjud." },
    { questionText: "O'zbekiston Mustaqillik kuni qaysi sanada nishonlanadi?", options: ["1-sentabr", "8-dekabr", "21-mart", "9-may"], correctAnswer: 0, explanation: "1991-yil 1-sentabr — O'zbekistonning Mustaqillik kuni." },
    { questionText: "O'zbekiston Konstitutsiyasi qachon qabul qilingan?", options: ["1990-yil", "1991-yil", "1992-yil 8-dekabr", "1995-yil"], correctAnswer: 2, explanation: "Yangi tahrirdagi Konstitutsiya 1992-yil 8-dekabrda qabul qilingan." },
    { questionText: "Davlat tili qaysi?", options: ["Rus tili", "O'zbek tili", "Tojik tili", "Qoraqalpoq tili"], correctAnswer: 1, explanation: "Konstitutsiya 4-moddasiga ko'ra davlat tili — o'zbek tili." },
    { questionText: "Poytaxt shahrimiz qaysi?", options: ["Samarqand", "Toshkent", "Buxoro", "Andijon"], correctAnswer: 1, explanation: "O'zbekiston Respublikasining poytaxti — Toshkent shahri." },
    { questionText: "Oila — bu nima?", options: ["Bir uyda yashovchi qo'shnilar", "Qarindoshlik bilan bog'langan kichik ijtimoiy guruh", "Maktab jamoasi", "Mahalla kengashi"], correctAnswer: 1, explanation: "Oila — qon-qarindoshlik va nikoh bilan bog'langan eng kichik ijtimoiy guruh." },
    { questionText: "Bola necha yoshigacha bolalik davri hisoblanadi?", options: ["14 yosh", "16 yosh", "18 yosh", "21 yosh"], correctAnswer: 2, explanation: "Konvensiyaga ko'ra inson 18 yoshga to'lguniga qadar bola sanaladi." },
    { questionText: "Mahalla — bu nima?", options: ["Davlat organi", "Fuqarolarning o'zini o'zi boshqarish organi", "Maktab", "Sud"], correctAnswer: 1, explanation: "Mahalla — fuqarolarning o'zini o'zi boshqaruv organi." },
    { questionText: "Vatan nima?", options: ["Faqat shahar", "Inson tug'ilib o'sgan, jonajon yurti", "Maktab", "Uy"], correctAnswer: 1, explanation: "Vatan — inson tug'ilib voyaga yetgan, qadrlaydigan yurti." },
    { questionText: "Qaysi belgisi bilan davlat ramzi 'gerb' tasvirlangan?", options: ["Olov", "Quyosh va Humo qushi", "Yulduz va oy", "Tog' cho'qqilari"], correctAnswer: 1, explanation: "Gerbda chiqayotgan quyosh va Humo qushi tasviri bor." },
    { questionText: "Maktabning asosiy vazifasi nima?", options: ["Bilim berish va tarbiyalash", "Pul ishlash", "Ko'ngilochar tadbirlar", "Sport o'ynash"], correctAnswer: 0, explanation: "Maktab — yoshlarga bilim berish va tarbiyalash maskani." },
    { questionText: "Fuqaro deganda kim tushuniladi?", options: ["Davlat bilan huquqiy aloqada bo'lgan shaxs", "Faqat ishlovchilar", "Faqat kattalar", "Kitob o'qiganlar"], correctAnswer: 0, explanation: "Fuqaro — davlat bilan huquqiy aloqada bo'lgan, huquq va majburiyatlarga ega shaxs." },
    { questionText: "Bayroqdagi yulduzlar soni nechta?", options: ["9 ta", "12 ta", "14 ta", "16 ta"], correctAnswer: 1, explanation: "Bayroqdagi yarim oy yonida 12 ta oq yulduz tasvirlangan." },
    { questionText: "Bayroqning oq rangi nimani anglatadi?", options: ["Tinchlik va poklik", "Hosildorlik", "Osmon", "Olov"], correctAnswer: 0, explanation: "Oq rang — tinchlik, poklik va saxiylik ramzi." },
    { questionText: "Konstitutsiya kuni qaysi sanada nishonlanadi?", options: ["1-sentabr", "8-dekabr", "21-mart", "9-may"], correctAnswer: 1, explanation: "8-dekabr — O'zbekiston Respublikasi Konstitutsiyasi kuni." },
    { questionText: "Oilada bolaning asosiy vazifasi nima?", options: ["Faqat o'qish", "Ota-ona va kichiklarga g'amxo'rlik, o'qish va mehnat qilish", "Faqat o'ynash", "Hech qanday majburiyat yo'q"], correctAnswer: 1, explanation: "Bola ota-onasini hurmat qilishi, ulardan g'amxo'rlik qilishi va o'qishi shart." },
    { questionText: "Madhiya muallifi (so'zlari) kim?", options: ["Abdulla Oripov", "Cho'lpon", "Hamid Olimjon", "Erkin Vohidov"], correctAnswer: 0, explanation: "Madhiya so'zlari shoir Abdulla Oripovga, musiqasi Mutal Burhonovga tegishli." },
    { questionText: "Davlat — bu nima?", options: ["Aholi yashaydigan hudud va uni boshqaruvchi organlar tizimi", "Faqat maktab", "Faqat mahalla", "Faqat oilalar"], correctAnswer: 0, explanation: "Davlat — muayyan hududda yashovchi xalqni boshqaruvchi siyosiy tashkilot." },
    { questionText: "Yoshlarni qo'llab-quvvatlash qaysi muassasa zimmasida?", options: ["Faqat ota-onalar", "Davlat, oila, ta'lim muassasalari va mahalla", "Faqat maktab", "Faqat oila"], correctAnswer: 1, explanation: "Yoshlarni tarbiyalash va qo'llab-quvvatlash — davlat, oila, ta'lim muassasalari va mahallaning umumiy vazifasi." },
    { questionText: "Bola maktabga qaysi yoshda boradi?", options: ["5 yoshda", "6 yoshda", "7 yoshda", "8 yoshda"], correctAnswer: 1, explanation: "Bola 6-7 yoshda umumiy o'rta ta'limga qabul qilinadi." },
    { questionText: "O'zbekistondagi rasmiy bayramlardan biri:", options: ["Halloween", "Navro'z bayrami", "Black Friday", "Yangi yil arafa"], correctAnswer: 1, explanation: "Navro'z (21-mart) — milliy bahor bayrami." }
  ],
  7: [
    { questionText: "O'zbekiston Respublikasi qaysi davlat boshqaruv shaklini tanlagan?", options: ["Monarxiya", "Respublika", "Diktatura", "Federatsiya"], correctAnswer: 1, explanation: "O'zbekiston — boshqaruvning respublika shakliga ega davlat." },
    { questionText: "Davlat hokimiyati nechta tarmoqqa bo'linadi?", options: ["2", "3", "4", "5"], correctAnswer: 1, explanation: "Davlat hokimiyati uchta tarmoqqa bo'linadi: qonun chiqaruvchi, ijro etuvchi va sud hokimiyati." },
    { questionText: "Qonun chiqaruvchi organ qaysi?", options: ["Vazirlar Mahkamasi", "Oliy Majlis", "Konstitutsiyaviy sud", "Bosh prokuratura"], correctAnswer: 1, explanation: "Qonun chiqaruvchi hokimiyat — Oliy Majlis." },
    { questionText: "Ijro etuvchi hokimiyat qaysi organda mujassam?", options: ["Oliy Majlis", "Vazirlar Mahkamasi", "Konstitutsiyaviy sud", "Markaziy Bank"], correctAnswer: 1, explanation: "Ijro etuvchi hokimiyat — Vazirlar Mahkamasi (hukumat)." },
    { questionText: "Sud hokimiyati maqsadi nima?", options: ["Qonun chiqarish", "Adolatni o'rnatish va huquqlarni himoya qilish", "Soliq yig'ish", "Bayramlar tashkil qilish"], correctAnswer: 1, explanation: "Sudlar adolatni o'rnatadi, huquqlarni himoya qiladi, qonun ustuvorligini ta'minlaydi." },
    { questionText: "Prezident kim?", options: ["Mahalla rahbari", "Davlat boshlig'i", "Sudya", "Vazir"], correctAnswer: 1, explanation: "Prezident — davlat boshlig'i, ichki va tashqi siyosatni belgilaydi." },
    { questionText: "Konstitutsiya nima?", options: ["Mahalliy nizom", "Davlatning eng oliy qonuni", "Sud qarori", "Prezident farmoni"], correctAnswer: 1, explanation: "Konstitutsiya — davlatning asosiy va eng oliy yuridik kuchga ega qonuni." },
    { questionText: "Konstitutsiyani o'zgartirish huquqi kimga tegishli?", options: ["Faqat Prezidentga", "Oliy Majlis yoki referendumga", "Vazirlar Mahkamasiga", "Hokimlarga"], correctAnswer: 1, explanation: "Konstitutsiya Oliy Majlis yoki umumxalq referendumi orqali o'zgartiriladi." },
    { questionText: "Saylov huquqi qaysi yoshdan?", options: ["16", "17", "18", "21"], correctAnswer: 2, explanation: "Fuqarolar 18 yoshdan saylash huquqiga ega bo'ladi." },
    { questionText: "Inson huquqlari xalqaro hujjati qachon qabul qilingan?", options: ["1945", "1948", "1966", "1989"], correctAnswer: 1, explanation: "Inson huquqlari umumjahon deklaratsiyasi 1948-yil 10-dekabrda qabul qilingan." },
    { questionText: "Fuqaroning asosiy majburiyatlaridan biri:", options: ["Konstitutsiya va qonunlarga rioya qilish", "Bayramlarga qatnashish", "Sport bilan shug'ullanish", "Sayohatga chiqish"], correctAnswer: 0, explanation: "Konstitutsiya va qonunlarga rioya qilish — har bir fuqaro va shaxsning asosiy majburiyati." },
    { questionText: "Oila — qaysi ijtimoiy institutga kiradi?", options: ["Siyosiy", "Eng asosiy va ibtidoiy ijtimoiy institut", "Iqtisodiy korxona", "Sport klubi"], correctAnswer: 1, explanation: "Oila — jamiyatning asosiy va eng kichik ijtimoiy institutidir." },
    { questionText: "Bola huquqlaridan biri:", options: ["Tinch yashash huquqi", "Pul olish huquqi", "Davlatdan benzin olish huquqi", "Avtomobil olish huquqi"], correctAnswer: 0, explanation: "Bola yashashga, ta'lim olishga, oilada o'sishga va tinchlikka haqli." },
    { questionText: "O'zbekiston qaysi yili BMTga a'zo bo'lgan?", options: ["1991", "1992", "1995", "2001"], correctAnswer: 1, explanation: "O'zbekiston 1992-yil 2-martda BMT ga a'zo bo'lgan." },
    { questionText: "Hokim kim?", options: ["Hududning rahbari", "Sud raisi", "Vazir", "Direktor"], correctAnswer: 0, explanation: "Hokim — viloyat, tuman yoki shahar ijro hokimiyati boshlig'i." },
    { questionText: "Davlatning asosiy belgilaridan biri:", options: ["Suverenitet (mustaqillik)", "Bayramlar", "Sport jamoalari", "Lavozim nomlari"], correctAnswer: 0, explanation: "Suverenitet, hudud, aholi, hokimiyat — davlatning asosiy belgilari." },
    { questionText: "Demokratiya so'zining ma'nosi:", options: ["Bir kishi hokimiyati", "Xalq hokimiyati", "Diniy hokimiyat", "Harbiy hokimiyat"], correctAnswer: 1, explanation: "Demokratiya yunoncha 'demos' (xalq) va 'kratos' (hokimiyat) — xalq hokimiyati." },
    { questionText: "Rezident qaysi muddatga saylanadi?", options: ["4 yil", "5 yil", "7 yil", "10 yil"], correctAnswer: 2, explanation: "O'zbekiston Respublikasi Prezidenti 7 yil muddatga saylanadi." },
    { questionText: "Konstitutsiyaviy sud nimani tekshiradi?", options: ["Soliq miqdorini", "Qonunlarning Konstitutsiyaga muvofiqligini", "Kassa hisoblarini", "Maktab dasturlarini"], correctAnswer: 1, explanation: "Konstitutsiyaviy sud qonun va hujjatlarning Konstitutsiyaga mosligini tekshiradi." },
    { questionText: "Oliy Majlis nechta palatadan iborat?", options: ["1", "2", "3", "4"], correctAnswer: 1, explanation: "Oliy Majlis ikki palatadan iborat: Qonunchilik palatasi va Senat." },
    { questionText: "O'zbekiston rasman qaysi sanadan mustaqil?", options: ["1991-yil 1-sentabr", "1992-yil 8-dekabr", "1990-yil 20-iyun", "1989-yil 21-oktabr"], correctAnswer: 0, explanation: "1991-yil 31-avgustda Mustaqillik to'g'risidagi qaror qabul qilingan, 1-sentabr — Mustaqillik kuni." },
    { questionText: "Fuqaroning asosiy huquqlaridan biri:", options: ["Faqat ishlash", "Ta'lim olish va hayot huquqi", "Faqat sayohat", "Faqat tomosha qilish"], correctAnswer: 1, explanation: "Hayot, erkinlik, ta'lim, mehnat va boshqalar — fuqaroning asosiy huquqlari." }
  ],
  8: [
    { questionText: "O'zbekiston Respublikasi Konstitutsiyasi necha bo'limdan iborat?", options: ["5", "6", "7", "8"], correctAnswer: 1, explanation: "Konstitutsiya 6 bo'lim, 26 bob va 155 moddadan iborat (yangi tahrirda)." },
    { questionText: "Konstitutsiya 1-moddasida O'zbekiston qanday davlat deb e'lon qilingan?", options: ["Federativ", "Suveren, demokratik, huquqiy, ijtimoiy va dunyoviy", "Konfederativ", "Monarxiya"], correctAnswer: 1, explanation: "1-moddada O'zbekiston suveren, demokratik, huquqiy, ijtimoiy va dunyoviy davlat deb tasdiqlangan." },
    { questionText: "'Dunyoviy davlat' atamasining ma'nosi:", options: ["Din davlatdan ajratilgan", "Davlat dini bor", "Faqat bitta din", "Hech qanday din yo'q"], correctAnswer: 0, explanation: "Dunyoviy davlatda din davlatdan ajratilgan, hech bir din davlat dini emas." },
    { questionText: "Bola huquqlari konvensiyasi nechanchi yilda qabul qilingan?", options: ["1948", "1966", "1989", "2001"], correctAnswer: 2, explanation: "BMT Bola huquqlari konvensiyasi 1989-yilda qabul qilingan." },
    { questionText: "Bolaning ta'lim olish huquqi konvensiyaning qaysi qismida ko'rsatilgan?", options: ["28-moddada", "12-moddada", "5-moddada", "1-moddada"], correctAnswer: 0, explanation: "Konvensiyaning 28-moddasi bolaning ta'lim olish huquqini tan oladi." },
    { questionText: "Konstitutsiyaning yangi tahriri qachon qabul qilindi?", options: ["2017", "2019", "2021", "2023"], correctAnswer: 3, explanation: "Konstitutsiyaning yangi tahriri 2023-yil 30-aprelda referendum yo'li bilan qabul qilindi." },
    { questionText: "Inson huquq va erkinliklari qaysi qonun bilan kafolatlanadi?", options: ["Mehnat kodeksi", "Konstitutsiya va qonunlar", "Maxsus farmon", "Ko'rsatma"], correctAnswer: 1, explanation: "Inson huquq va erkinliklari Konstitutsiya va qonunlar bilan kafolatlanadi." },
    { questionText: "Davlat ramzlari qaysi qonun bilan tasdiqlanadi?", options: ["Qonun", "Farmon", "Qaror", "Ko'rsatma"], correctAnswer: 0, explanation: "Davlat ramzlari faqat qonun bilan tasdiqlanadi (Konstitutsiya 5-moddasi)." },
    { questionText: "O'zbekiston Konstitutsiyasi qanday usulda qabul qilingan?", options: ["Prezident farmoni", "Oliy Majlis va xalq referendumi", "Vazirlar Mahkamasi qarori", "Sudlar qarori"], correctAnswer: 1, explanation: "Konstitutsiya Oliy Majlis yoki xalq referendumi orqali qabul qilinadi." },
    { questionText: "Inson hayoti — bu:", options: ["Ortga qaytariladigan boylik", "Daxlsiz huquq", "Davlat mulki", "Vaqtinchalik narsa"], correctAnswer: 1, explanation: "Inson hayoti daxlsiz huquqdir va davlat tomonidan himoya qilinadi." },
    { questionText: "Bolaning erkin fikr bildirish huquqi qaysi yoshgacha cheklanishi mumkin emas?", options: ["Hech qachon, biroq yoshiga moslab hisobga olinadi", "Faqat 18 yoshdan", "Faqat 12 yoshdan", "Faqat ota-ona ruxsati bilan"], correctAnswer: 0, explanation: "Bolaning erkin fikr bildirish huquqi — universal, biroq yosh va yetukligi inobatga olinadi." },
    { questionText: "Konstitutsiya bo'yicha mehnat qilish bu:", options: ["Faqat majburiy", "Huquq va sharafli vazifa", "Faqat erkaklarning ishi", "Faqat kattalarning ishi"], correctAnswer: 1, explanation: "Mehnat — har bir kishining huquqi va sharafli vazifasidir." },
    { questionText: "Bola necha yoshigacha ota-ona ta'minoti ostida bo'lishi shart?", options: ["14", "16", "18", "21"], correctAnswer: 2, explanation: "18 yoshgacha bola ota-ona ta'minotida bo'ladi." },
    { questionText: "Davlat tilini bilish kim uchun majburiy?", options: ["Faqat o'zbeklarga", "Davlat xizmatchilariga va davlat ishlarida qatnashganlarga", "Hech kimga", "Faqat o'qituvchilarga"], correctAnswer: 1, explanation: "Davlat tili — davlat ishlarini olib borishda asosiy til." },
    { questionText: "Konstitutsiyaning maqsadi nima?", options: ["Soliq olish", "Davlat va inson huquqlarini tartibga solish", "Bayramlar belgilash", "Sport ishlarini olib borish"], correctAnswer: 1, explanation: "Konstitutsiya davlat tuzilishi, hokimiyat tarmoqlari va inson huquqlarini belgilaydi." },
    { questionText: "Bola huquqlari konvensiyasiga ko'ra, bolaga eng yaxshi qarash kim tomonidan?", options: ["Faqat ota-onasi", "Ota-ona, davlat va jamiyat birgalikda", "Faqat o'qituvchi", "Faqat hukumat"], correctAnswer: 1, explanation: "Bolaning manfaatlari oila, davlat va jamiyat birgalikda himoya qiladi." },
    { questionText: "Konstitutsiya nimadan ustun?", options: ["Hech narsadan", "Barcha qonun va hujjatlardan", "Faqat farmondan", "Faqat qarordan"], correctAnswer: 1, explanation: "Konstitutsiya — eng oliy yuridik kuchga ega, barcha qonun va hujjatlar unga muvofiq bo'lishi kerak." },
    { questionText: "Madhiya muallifi kim?", options: ["Cho'lpon", "Abdulla Oripov", "Erkin Vohidov", "Hamid Olimjon"], correctAnswer: 1, explanation: "Madhiya so'zlari Abdulla Oripovga, musiqasi Mutal Burhonovga tegishli." },
    { questionText: "Inson huquqlari umumjahon deklaratsiyasi nechta moddadan iborat?", options: ["20", "30", "50", "100"], correctAnswer: 1, explanation: "1948-yilgi Inson huquqlari umumjahon deklaratsiyasi 30 moddadan iborat." },
    { questionText: "O'zbekiston BMT a'zoligi qaysi yili boshlangan?", options: ["1991", "1992", "1993", "1994"], correctAnswer: 1, explanation: "O'zbekiston Respublikasi 1992-yil 2-martda BMTga qabul qilingan." },
    { questionText: "Konstitutsiyaviy sud raisini kim tayinlaydi?", options: ["Vazirlar Mahkamasi", "Senatda Prezident taqdimi bilan", "Hokim", "Generalprokuror"], correctAnswer: 1, explanation: "Konstitutsiyaviy sud raisini Prezident taqdimi asosida Senat saylaydi." },
    { questionText: "Bola erta nikohga zo'rlanmasligi qaysi hujjatga asoslanadi?", options: ["Konvensiya va milliy qonunlar", "Hech narsa", "Maktab nizomi", "Mahalla qarori"], correctAnswer: 0, explanation: "Bola huquqlari konvensiyasi va milliy qonunlar erta nikohni taqiqlaydi." }
  ],
  9: [
    { questionText: "Bola huquqlari konvensiyasini O'zbekiston qachon ratifikatsiya qilgan?", options: ["1992-yil", "1994-yil", "1996-yil", "2001-yil"], correctAnswer: 0, explanation: "O'zbekiston Bola huquqlari konvensiyasini 1992-yilda ratifikatsiya qilgan." },
    { questionText: "Konvensiya nechta moddadan iborat?", options: ["30", "40", "54", "60"], correctAnswer: 2, explanation: "Bola huquqlari konvensiyasi 54 moddadan iborat." },
    { questionText: "Bola huquqlari konvensiyasining 3-moddasi nimaga bag'ishlangan?", options: ["Ta'limga", "Bola manfaatlarining ustuvorligiga", "Sog'liqqa", "O'yinga"], correctAnswer: 1, explanation: "3-modda — bola manfaatlari ustuvorligi tamoyili." },
    { questionText: "Bola erkin fikr bildirish huquqiga qaysi moddada ega?", options: ["12-modda", "20-modda", "5-modda", "1-modda"], correctAnswer: 0, explanation: "Konvensiyaning 12-moddasi bolaning fikrini hisobga olish huquqini ta'minlaydi." },
    { questionText: "Bola dam olish va o'yinga qaysi moddada haqli?", options: ["31-modda", "12-modda", "5-modda", "20-modda"], correctAnswer: 0, explanation: "31-modda — bolaning dam olish, o'yin va bo'sh vaqtdan foydalanish huquqi." },
    { questionText: "Bola haq oilada o'sishi qaysi moddada e'tirof etilgan?", options: ["7-modda", "12-modda", "18-modda", "27-modda"], correctAnswer: 0, explanation: "7-moddada bolaning ota-onasini bilish va u bilan o'sish huquqi." },
    { questionText: "Bola majburiy mehnatdan himoyalanadi — bu qaysi moddada?", options: ["32-modda", "12-modda", "1-modda", "40-modda"], correctAnswer: 0, explanation: "32-modda bolani iqtisodiy ekspluatatsiya va og'ir mehnatdan himoya qiladi." },
    { questionText: "Bolaning ta'lim olish huquqi qaysi moddada?", options: ["28-modda", "12-modda", "5-modda", "31-modda"], correctAnswer: 0, explanation: "28-modda bolaning ta'lim olish huquqini belgilaydi." },
    { questionText: "Bolaning sog'lig'i va tibbiy yordam huquqi qaysi moddada?", options: ["24-modda", "12-modda", "31-modda", "5-modda"], correctAnswer: 0, explanation: "24-modda bolaning sog'liqni saqlash va tibbiy yordam olish huquqini belgilaydi." },
    { questionText: "Konvensiya qaysi tashkilot tomonidan qabul qilingan?", options: ["BMT", "YUNESKO", "YUNISEF", "Yevropa Ittifoqi"], correctAnswer: 0, explanation: "Konvensiya BMT Bosh Assambleyasi tomonidan qabul qilingan." },
    { questionText: "Bola — bu necha yoshgacha?", options: ["14", "16", "18", "21"], correctAnswer: 2, explanation: "Konvensiya 1-moddasi: 18 yoshga to'lmagan har bir inson bola hisoblanadi." },
    { questionText: "Bola huquqlari kim tomonidan himoya qilinadi?", options: ["Faqat ota-ona", "Davlat, oila va jamiyat", "Faqat maktab", "Faqat sud"], correctAnswer: 1, explanation: "Bolani himoya qilish davlat, oila va jamiyatning umumiy mas'uliyati." },
    { questionText: "Bolaning fuqaroligini olish huquqi qaysi moddada?", options: ["7-modda", "12-modda", "20-modda", "30-modda"], correctAnswer: 0, explanation: "7-modda bolaning ism, familiya va fuqarolikka ega bo'lish huquqini belgilaydi." },
    { questionText: "Ota-onasiz qolgan bola davlatda nima oladi?", options: ["Hech narsa", "Maxsus himoya va yordam", "Faqat ovqat", "Faqat kiyim"], correctAnswer: 1, explanation: "20-modda — ota-onasiz qolgan bolalarga maxsus himoya va yordam beriladi." },
    { questionText: "Konvensiya qabul qilingan sanasi:", options: ["1989-yil 20-noyabr", "1991-yil 1-sentabr", "1948-yil 10-dekabr", "1992-yil 2-mart"], correctAnswer: 0, explanation: "1989-yil 20-noyabrda BMT Bosh Assambleyasi konvensiyani qabul qilgan." },
    { questionText: "Konvensiyaga ko'ra, bolaga jismoniy jazo:", options: ["Ruxsat etilgan", "Taqiqlanadi", "Faqat maktabda", "Faqat ota-onaga ruxsat"], correctAnswer: 1, explanation: "Bolaga jismoniy va ruhiy zo'ravonlik taqiqlanadi (19-modda)." },
    { questionText: "Bolaning ismi va familiyasiga ega bo'lish huquqi qaysi moddada?", options: ["7-modda", "12-modda", "31-modda", "1-modda"], correctAnswer: 0, explanation: "7-moddaga ko'ra, bola tug'ilishi bilan ismi va familiyasiga ega bo'ladi." },
    { questionText: "Bola mafkuraviy zo'ravonlikdan himoyalanadi — bu qaysi moddada?", options: ["19-modda", "12-modda", "31-modda", "28-modda"], correctAnswer: 0, explanation: "19-modda bolani har qanday zo'ravonlikdan himoya qilishni belgilaydi." },
    { questionText: "Konvensiya tamoyillaridan biri:", options: ["Bola manfaatlarining ustuvorligi", "Bola pul ishlashi", "Bola ishchi sifatida ishlatilishi", "Bola hech qanday huquqi yo'q"], correctAnswer: 0, explanation: "Bola manfaatlarining ustuvorligi — konvensiyaning bosh tamoyili (3-modda)." },
    { questionText: "Maxsus ehtiyojli bolalarning huquqi qaysi moddada?", options: ["23-modda", "12-modda", "1-modda", "5-modda"], correctAnswer: 0, explanation: "23-modda nogironligi bo'lgan bolaning maxsus g'amxo'rlik va ta'lim huquqini belgilaydi." },
    { questionText: "Bola erkin fikr, vijdon va din erkinligiga ega — bu qaysi moddada?", options: ["14-modda", "12-modda", "31-modda", "1-modda"], correctAnswer: 0, explanation: "14-modda bolaning fikr, vijdon va din erkinligini ta'minlaydi." },
    { questionText: "Konvensiyani O'zbekiston qaysi yili ratifikatsiya qildi?", options: ["1991", "1992", "1993", "1994"], correctAnswer: 1, explanation: "O'zbekiston 1992-yil 9-dekabrda konvensiyani ratifikatsiya qilgan." }
  ],
  10: [
    { questionText: "Huquq normalari kim tomonidan o'rnatiladi?", options: ["Mahallaning a'zolari tomonidan", "Davlat va vakolatli organlar tomonidan", "Faqat fuqarolar tomonidan", "Sport tashkilotlari tomonidan"], correctAnswer: 1, explanation: "Huquq normalari davlat va vakolatli organlar tomonidan o'rnatiladi va himoya qilinadi." },
    { questionText: "Huquqning manbalari deganda nima tushuniladi?", options: ["Faqat kitoblar", "Huquq normalarini ifodalovchi rasmiy hujjatlar", "Faqat sud qarorlari", "Mahalla qarorlari"], correctAnswer: 1, explanation: "Huquq manbalari — qonun, hujjat, sud amaliyoti kabi huquq normalarini ifodalovchi rasmiy shakllar." },
    { questionText: "Konstitutsiya qaysi huquq sohasiga tegishli?", options: ["Jinoyat", "Konstitutsiyaviy huquq", "Mehnat", "Soliq"], correctAnswer: 1, explanation: "Konstitutsiya — konstitutsiyaviy huquq sohasining asosiy manbasi." },
    { questionText: "Davlat boshqaruv shakllaridan biri:", options: ["Sport klubi", "Respublika", "Maktab", "Mahalla"], correctAnswer: 1, explanation: "Davlat boshqaruv shakllari: respublika va monarxiya." },
    { questionText: "Davlat tuzilishi shakli:", options: ["Faqat unitar", "Unitar, federativ va konfederativ", "Faqat federal", "Faqat konfederativ"], correctAnswer: 1, explanation: "Davlat tuzilishi shakllari — unitar, federativ va konfederativ." },
    { questionText: "O'zbekiston davlat tuzilishi shakli:", options: ["Federativ", "Unitar", "Konfederativ", "Avtonom"], correctAnswer: 1, explanation: "O'zbekiston Respublikasi — unitar davlat." },
    { questionText: "Ma'muriy huquqbuzarliklar uchun jazo turi:", options: ["Ozodlikdan mahrum qilish", "Jarima, ogohlantirish, ma'muriy qamoq", "Ta'lim olish", "Mehnat majburiyati"], correctAnswer: 1, explanation: "Ma'muriy javobgarlik — jarima, ogohlantirish, ma'muriy qamoq va h.k." },
    { questionText: "Fuqarolik huquqi nimani tartibga soladi?", options: ["Jinoyat sodir etganlarni", "Mulkiy va shaxsiy nomulkiy munosabatlarni", "Maktab dasturini", "Mahalla nizomini"], correctAnswer: 1, explanation: "Fuqarolik huquqi mulkiy va shaxsiy nomulkiy munosabatlarni tartibga soladi." },
    { questionText: "Mehnat huquqi qaysi munosabatlarni tartibga soladi?", options: ["Mehnat shartnomasi va mehnat sharoitlari", "Faqat sport", "Faqat ta'lim", "Faqat oila"], correctAnswer: 0, explanation: "Mehnat huquqi xodim va ish beruvchi o'rtasidagi munosabatlarni tartibga soladi." },
    { questionText: "Oila huquqi qaysi sohaga taalluqli?", options: ["Sport", "Nikoh, oila va bola tarbiyasi", "Soliq", "Jinoyat"], correctAnswer: 1, explanation: "Oila huquqi nikoh tuzish, oila munosabatlari va bola tarbiyasini tartibga soladi." },
    { questionText: "Jinoyat huquqi:", options: ["Bayramlarni belgilaydi", "Jinoyat va jazo masalalarini tartibga soladi", "Soliq olishni belgilaydi", "Pasportni rasmiylashtiradi"], correctAnswer: 1, explanation: "Jinoyat huquqi qaysi xatti-harakat jinoyat ekanligi va u uchun jazoni belgilaydi." },
    { questionText: "Jismoniy shaxs muomala layoqati to'liq qachon yuzaga keladi?", options: ["14 yosh", "16 yosh", "18 yosh", "21 yosh"], correctAnswer: 2, explanation: "Fuqarolik kodeksi: to'liq muomala layoqati 18 yoshda paydo bo'ladi." },
    { questionText: "Nikohga kirish yoshi (umumiy qoida bo'yicha):", options: ["16", "17", "18", "21"], correctAnswer: 2, explanation: "Oila kodeksiga ko'ra nikoh yoshi 18 (istisnolarda 17)." },
    { questionText: "Sud nima vakolatli?", options: ["Qonun chiqarish", "Adolatni amalga oshirish", "Pul chiqarish", "Soliq olish"], correctAnswer: 1, explanation: "Sud hokimiyati adolat sudlovini amalga oshiradi va qonun ustuvorligini ta'minlaydi." },
    { questionText: "Mulk huquqi nima?", options: ["Faqat o'ziniki", "Mulkka egalik, foydalanish va tasarruf etish huquqi", "Faqat sotish", "Faqat sotib olish"], correctAnswer: 1, explanation: "Mulk huquqi — mulkka egalik qilish, foydalanish va uni tasarruf etish vakolatlari yig'indisi." },
    { questionText: "Shartnoma — bu:", options: ["Pul to'lash", "Ikki yoki undan ortiq taraflarning kelishuvi", "Buyruq", "Farmon"], correctAnswer: 1, explanation: "Shartnoma — taraflarning huquq va majburiyat yuzaga keltirish bo'yicha kelishuvi." },
    { questionText: "Notarius nima qiladi?", options: ["Qonun chiqaradi", "Hujjatlarni rasmiy tasdiqlaydi va shahodatnoma beradi", "Soliq oladi", "Maktabda dars beradi"], correctAnswer: 1, explanation: "Notarius hujjatlarni guvohlantirish va boshqa notarial xatti-harakatlarni amalga oshiradi." },
    { questionText: "Konstitutsiyaviy sud qaysi vazifani bajaradi?", options: ["Faqat jinoyat ishi", "Qonunlarning Konstitutsiyaga muvofiqligini tekshirish", "Soliq olish", "Maktab attestatsiyasi"], correctAnswer: 1, explanation: "Konstitutsiyaviy sud qonun va hujjatlarning Konstitutsiyaga mosligini tekshiradi." },
    { questionText: "Prokuratura nimani nazorat qiladi?", options: ["Bayramlarni", "Qonunlarning ijro etilishini", "Maktab ishlarini", "Sport ishlarini"], correctAnswer: 1, explanation: "Prokuratura qonunlar ijrosini nazorat qiluvchi davlat organi." },
    { questionText: "Advokat kim?", options: ["Yuridik yordam beruvchi shaxs", "Sudya", "Vazir", "Hokim"], correctAnswer: 0, explanation: "Advokat — yuridik xizmat ko'rsatuvchi mustaqil yuridik mutaxassis." },
    { questionText: "Inson huquqlari qaysi hujjatda batafsil bayon etilgan?", options: ["Mehnat kodeksi", "Inson huquqlari umumjahon deklaratsiyasi", "Soliq kodeksi", "Maktab nizomi"], correctAnswer: 1, explanation: "1948-yilgi Inson huquqlari umumjahon deklaratsiyasi inson huquqlarini batafsil bayon qiladi." },
    { questionText: "Pravoporyadok (huquq-tartibot) nima?", options: ["Maktab tartibi", "Jamiyatda qonunlarning hayotda amal qilishi natijasidagi tartib", "Faqat sport tartibi", "Faqat maishiy tartib"], correctAnswer: 1, explanation: "Huquq-tartibot — huquq normalarining bajarilishi natijasidagi ijtimoiy tartib." }
  ],
  11: [
    { questionText: "Konstitutsiyaning yangi tahriri qachon kuchga kirgan?", options: ["2017-yil", "2019-yil", "2023-yil 1-may", "2024-yil"], correctAnswer: 2, explanation: "Konstitutsiya yangi tahriri 2023-yil 30-aprelda referendumda qabul qilinib, 1-maydan kuchga kirgan." },
    { questionText: "Yangi Konstitutsiya necha moddadan iborat?", options: ["120", "135", "155", "175"], correctAnswer: 2, explanation: "Yangi tahrirdagi Konstitutsiya 155 moddadan iborat." },
    { questionText: "Inson — bu:", options: ["Davlat mulki", "Oliy qadriyat", "Faqat fuqaro", "Faqat ishchi"], correctAnswer: 1, explanation: "Konstitutsiyada inson, uning hayoti, sha'ni va qadr-qimmati — oliy qadriyat." },
    { questionText: "Konstitutsiya 19-moddasi nimani belgilaydi?", options: ["Soliqlarni", "Inson huquqlari va erkinliklarini", "Bayramlarni", "Pul chiqarishni"], correctAnswer: 1, explanation: "19-modda inson huquq va erkinliklarining daxlsizligini belgilaydi." },
    { questionText: "Fuqarolik huquqi predmeti:", options: ["Jinoyat", "Mulkiy va shaxsiy nomulkiy munosabatlar", "Maktab dasturi", "Sport faoliyati"], correctAnswer: 1, explanation: "Fuqarolik huquqi mulkiy va shaxsiy nomulkiy munosabatlarni tartibga soladi." },
    { questionText: "Yuridik shaxs — bu:", options: ["Faqat shaxs", "Mulkka ega, sudda javob bera oladigan tashkilot", "Sudya", "Vazir"], correctAnswer: 1, explanation: "Yuridik shaxs — mustaqil mulkka ega, o'z nomidan sudda chiqa oladigan tashkilot." },
    { questionText: "Mehnat shartnomasi qancha muddatga tuzilishi mumkin?", options: ["Faqat 1 yil", "Faqat muddatsiz", "Muddatli yoki muddatsiz", "Faqat 5 yil"], correctAnswer: 2, explanation: "Mehnat shartnomasi muddatli (5 yilgacha) yoki muddatsiz tuzilishi mumkin." },
    { questionText: "Sud hokimiyati qaysi tamoyilga asoslanadi?", options: ["Hokim ko'rsatmasi", "Mustaqillik va qonun ustuvorligi", "Mahalla qarori", "Vazir buyrug'i"], correctAnswer: 1, explanation: "Sud mustaqil bo'lib, faqat qonunga bo'ysunadi." },
    { questionText: "Konstitutsiyaviy sud qancha vakil sudyadan iborat?", options: ["5", "7", "9", "11"], correctAnswer: 1, explanation: "Konstitutsiyaviy sud rais va kamida 6 nafar sudyadan iborat (7+ a'zo)." },
    { questionText: "Oliy Majlis palatalari:", options: ["Faqat Qonunchilik palatasi", "Qonunchilik palatasi va Senat", "Faqat Senat", "Vazirlar mahkamasi"], correctAnswer: 1, explanation: "Oliy Majlis 2 palatadan iborat: Qonunchilik palatasi va Senat." },
    { questionText: "Qonunchilik palatasida nechta deputat?", options: ["100", "120", "150", "200"], correctAnswer: 2, explanation: "Qonunchilik palatasi 150 deputatdan iborat." },
    { questionText: "Senatda nechta a'zo?", options: ["50", "65", "100", "150"], correctAnswer: 2, explanation: "Senat 100 a'zodan iborat (yangi tahrirda)." },
    { questionText: "Prezident muddati:", options: ["4 yil", "5 yil", "7 yil", "10 yil"], correctAnswer: 2, explanation: "Prezident 7 yil muddatga saylanadi." },
    { questionText: "Vazirlar Mahkamasi rahbari:", options: ["Senator", "Bosh vazir", "Hokim", "Spiker"], correctAnswer: 1, explanation: "Vazirlar Mahkamasini Bosh vazir boshqaradi." },
    { questionText: "Konstitutsiya 13-moddasi qanday tamoyilni belgilaydi?", options: ["Inson manfaatlari ustuvorligi", "Pul siyosati", "Maktab dasturi", "Sport tamoyili"], correctAnswer: 0, explanation: "13-moddada davlat faoliyatida inson manfaatlari, huquq va erkinliklari ustuvorligi belgilangan." },
    { questionText: "Jinoyatga jalb qilish yoshi (asosiy qoida bo'yicha):", options: ["12", "14", "16", "18"], correctAnswer: 2, explanation: "Jinoiy javobgarlik 16 yoshdan boshlanadi, og'ir jinoyatlar uchun 14 yoshdan." },
    { questionText: "Ma'muriy javobgarlik yoshi:", options: ["14", "16", "18", "21"], correctAnswer: 1, explanation: "Ma'muriy javobgarlik 16 yoshdan paydo bo'ladi." },
    { questionText: "Xalqaro huquq normalari milliy qonundan ustun qoida sifatida:", options: ["Faqat ratifikatsiya etilgan xalqaro shartnomalar bo'yicha", "Har doim", "Hech qachon", "Faqat AQSh hujjatlari"], correctAnswer: 0, explanation: "Ratifikatsiya etilgan xalqaro shartnomalar milliy qonun darajasida amal qiladi." },
    { questionText: "Inson sha'nini himoya qilish huquqi qaysi hujjatda?", options: ["Konstitutsiya va Fuqarolik kodeksi", "Faqat maktab nizomi", "Sport nizomi", "Faqat mahalla qarori"], correctAnswer: 0, explanation: "Inson sha'ni Konstitutsiya bilan kafolatlanadi va Fuqarolik kodeksi bilan himoya qilinadi." },
    { questionText: "Mehnatga haq to'lashning eng kam miqdori (MROT) kim tomonidan belgilanadi?", options: ["Vazirlar Mahkamasi qarori bilan", "Faqat ish beruvchi", "Faqat xodim", "Mahalla"], correctAnswer: 0, explanation: "Mehnatga haq to'lashning eng kam miqdori davlat (Vazirlar Mahkamasi) tomonidan belgilanadi." },
    { questionText: "Saylov huquqi qaysi yoshda?", options: ["16", "17", "18", "21"], correctAnswer: 2, explanation: "Fuqarolar 18 yoshdan saylovda qatnasha oladi." },
    { questionText: "Pasport olish yoshi:", options: ["14", "16", "18", "21"], correctAnswer: 0, explanation: "O'zbekiston fuqarolari 16 yoshda biometrik pasport olishadi (14 yoshda qisman ID-karta)." }
  ]
};

// Wire EXTRA_BANK into STATIC_FALLBACK_TESTS as a "Kengaytirilgan to'plam" test for each grade
Object.entries(EXTRA_BANK).forEach(([grade, questions]) => {
  const g = Number(grade);
  const key = String(g);
  if (!STATIC_FALLBACK_TESTS[key]) STATIC_FALLBACK_TESTS[key] = [];
  STATIC_FALLBACK_TESTS[key].push({
    title: "Kengaytirilgan to'plam",
    grade: g,
    questions
  });
});

const formatHM = (ms: number): string => {
  if (ms <= 0) return '0s 0d';
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} s ${m} d`;
};

const TestsPage = () => {
  const [refreshIn, setRefreshIn] = useState<number>(() => msUntilNextLocalMidnight());

  // Tick the "next refresh" label every minute and roll over at midnight
  useEffect(() => {
    const id = window.setInterval(() => {
      setRefreshIn(msUntilNextLocalMidnight());
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const [selectedGrades, setSelectedGrades] = useState<number[]>(() => {
    const saved = localStorage.getItem('huquq_selected_grades');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(n => typeof n === 'number')) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return [11];
  });
  const [allTests, setAllTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Active Quiz State
  const [activeTest, setActiveTest] = useState<Test | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [quizFinished, setQuizFinished] = useState<boolean>(false);
  const [showAnalysis, setShowAnalysis] = useState<boolean>(false);

  // Mistakes history
  const [historyResults, setHistoryResults] = useState<QuizResult[]>([]);
  const [viewingResult, setViewingResult] = useState<QuizResult | null>(null);

  // Persist grade selection
  useEffect(() => {
    localStorage.setItem('huquq_selected_grades', JSON.stringify(selectedGrades));
  }, [selectedGrades]);

  // Fetch all tests once on mount (DB + static fallbacks)
  useEffect(() => {
    const fetchTests = async () => {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:5000/api/tests');
        const data = await res.json();
        const dbTests: Test[] = data.success && data.data ? data.data : [];
        const staticAll: Test[] = Object.values(STATIC_FALLBACK_TESTS).flat();
        const combined: Test[] = [...dbTests];
        staticAll.forEach(st => {
          const dup = dbTests.some(dt => dt.grade === st.grade && dt.title.toLowerCase().trim() === st.title.toLowerCase().trim());
          if (!dup) combined.push(st);
        });
        setAllTests(combined);
      } catch (err) {
        console.error("Testlarni yuklashda xatolik:", err);
        setAllTests(Object.values(STATIC_FALLBACK_TESTS).flat());
      } finally {
        setLoading(false);
      }
    };

    fetchTests();
  }, []);

  const visibleTests = useMemo(() => {
    return allTests.filter(t => selectedGrades.includes(t.grade));
  }, [allTests, selectedGrades]);

  const toggleGrade = (g: number) => {
    setSelectedGrades(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g].sort((a, b) => a - b)
    );
  };

  const selectAllGrades = () => setSelectedGrades([...AVAILABLE_GRADES]);
  const clearGrades = () => setSelectedGrades([]);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('huquq_test_results');
    if (saved) {
      try {
        setHistoryResults(JSON.parse(saved));
      } catch (err) {
        console.error(err);
      }
    }
  }, []);

  // Timer Effect
  useEffect(() => {
    if (!activeTest || quizFinished) return;

    if (timeLeft <= 0) {
      handleFinishQuiz();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, activeTest, quizFinished]);

  const handleStartQuiz = (clickedTest: Test) => {
    // 1) Build the pool of questions for the selected grades.
    // 2) Stable-shuffle it once per grade selection (consistent ordering across days).
    // 3) Each day take a rolling window of 20, advancing the start by 20 every 24 h.
    // This way, today's 20 are disjoint from yesterday's 20 whenever the pool has 40+ questions.
    const pool: Question[] = visibleTests.flatMap(t => t.questions);
    const ordered = seededShuffle(pool, gradesSalt(selectedGrades));
    let sampled: Question[] = [];
    if (ordered.length > 0) {
      const offset = (daysSinceEpoch() * QUIZ_LENGTH) % ordered.length;
      const rotated = [...ordered.slice(offset), ...ordered.slice(0, offset)];
      sampled = rotated.slice(0, Math.min(QUIZ_LENGTH, ordered.length));
    }

    const quiz: Test = {
      title: clickedTest.title,
      grade: clickedTest.grade,
      questions: sampled.length > 0 ? sampled : clickedTest.questions
    };

    setActiveTest(quiz);
    setCurrentQIndex(0);
    setSelectedAnswers({});
    // 1 minute per question
    setTimeLeft(quiz.questions.length * 60);
    setQuizFinished(false);
    setShowAnalysis(false);
  };

  const handleOptionSelect = (optionIdx: number) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [currentQIndex]: optionIdx
    }));
  };

  const handleNextQuestion = () => {
    if (!activeTest) return;
    if (currentQIndex < activeTest.questions.length - 1) {
      setCurrentQIndex(prev => prev + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQIndex > 0) {
      setCurrentQIndex(prev => prev - 1);
    }
  };

  const handleFinishQuiz = () => {
    if (!activeTest) return;
    
    // Calculate score
    let score = 0;
    activeTest.questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctAnswer) {
        score += 1;
      }
    });

    const newResult: QuizResult = {
      id: Math.random().toString(36).substr(2, 9),
      title: activeTest.title,
      grade: activeTest.grade,
      score,
      total: activeTest.questions.length,
      date: new Date().toLocaleDateString('uz-UZ') + ' ' + new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
      answers: selectedAnswers,
      questions: activeTest.questions
    };

    const updatedHistory = [newResult, ...historyResults];
    setHistoryResults(updatedHistory);
    localStorage.setItem('huquq_test_results', JSON.stringify(updatedHistory));

    setQuizFinished(true);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 1. QUIZ RUNNING UI
  if (activeTest && !quizFinished) {
    const currentQuestion = activeTest.questions[currentQIndex];

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        overflowY: 'auto',
        animation: 'fadeIn 0.3s ease-in-out'
      }}>
        <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', padding: '24px 20px', boxSizing: 'border-box' }}>

        {/* Header: title and timer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', backgroundColor: '#fff', padding: '20px 24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>{activeTest.title}</h3>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>{activeTest.grade}-sinf darsligi asosida</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: timeLeft < 60 ? '#fef2f2' : '#f0fdf4', color: timeLeft < 60 ? '#ef4444' : '#16a34a', borderRadius: '12px', fontWeight: '700', border: timeLeft < 60 ? '1px solid #fee2e2' : '1px solid #dcfce7' }}>
            <Timer size={18} />
            <span>{formatTime(timeLeft)}</span>
          </div>
        </div>

        {/* Question navigator */}
        <div style={{
          backgroundColor: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '18px',
          padding: '16px 20px',
          marginBottom: '16px',
          boxShadow: '0 4px 15px -4px rgba(0,0,0,0.06)',
          overflowX: 'auto'
        }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 'min-content' }}>
            {activeTest.questions.map((_, idx) => {
              const isCurrent = idx === currentQIndex;
              const isAnswered = selectedAnswers[idx] !== undefined;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentQIndex(idx)}
                  title={`${idx + 1}-savolga o'tish`}
                  style={{
                    flexShrink: 0,
                    width: '40px', height: '40px',
                    borderRadius: '50%',
                    border: isCurrent
                      ? '2px solid #f59e0b'
                      : isAnswered ? '1.5px solid #818cf8' : '1.5px solid #cbd5e1',
                    background: isCurrent
                      ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
                      : isAnswered ? '#eef2ff' : '#fff',
                    color: isCurrent ? '#fff' : isAnswered ? '#4f46e5' : '#64748b',
                    fontWeight: 700, fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isCurrent ? '0 8px 18px rgba(251, 191, 36, 0.4)' : 'none',
                    transition: 'all 0.15s',
                    fontFamily: 'inherit'
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Progress summary */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
            <span>Savol: {currentQIndex + 1} / {activeTest.questions.length}</span>
            <span>Bajarildi: {Math.round((Object.keys(selectedAnswers).length / activeTest.questions.length) * 100)}%</span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{ width: `${((currentQIndex + 1) / activeTest.questions.length) * 100}%`, height: '100%', backgroundColor: 'var(--primary-base)', borderRadius: '999px', transition: 'width 0.3s ease' }}></div>
          </div>
        </div>

        {/* Question card */}
        <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '36px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.03)', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '30px', lineHeight: '1.6' }}>
            {currentQuestion.questionText}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {currentQuestion.options.map((opt, idx) => {
              const isSelected = selectedAnswers[currentQIndex] === idx;
              const optionLetter = String.fromCharCode(65 + idx); // A, B, C, D

              return (
                <button
                  key={idx}
                  onClick={() => handleOptionSelect(idx)}
                  className={`quiz-option-btn ${isSelected ? 'selected' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    width: '100%',
                    padding: '18px 24px',
                    textAlign: 'left',
                    borderRadius: '16px',
                    border: isSelected ? '2px solid var(--primary-base)' : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? 'var(--primary-light)' : '#f8fafc',
                    color: isSelected ? 'var(--primary-base)' : '#334155',
                    fontSize: '15px',
                    fontWeight: isSelected ? '600' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: isSelected ? 'var(--primary-base)' : '#e2e8f0',
                    color: isSelected ? '#fff' : '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700',
                    fontSize: '14px',
                    flexShrink: 0
                  }}>
                    {optionLetter}
                  </div>
                  <span style={{ flexGrow: 1 }}>{opt}</span>
                  {isSelected && <CheckCircle2 size={20} color="var(--primary-base)" style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={handlePrevQuestion}
            disabled={currentQIndex === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 24px',
              backgroundColor: '#fff',
              border: '1px solid #cbd5e1',
              borderRadius: '14px',
              color: currentQIndex === 0 ? '#94a3b8' : '#475569',
              fontWeight: '600',
              cursor: currentQIndex === 0 ? 'not-allowed' : 'pointer',
              fontSize: '15px'
            }}
          >
            <ArrowLeft size={18} /> Oldingi
          </button>

          {currentQIndex === activeTest.questions.length - 1 ? (
            <button
              onClick={handleFinishQuiz}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 28px',
                backgroundColor: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '15px',
                boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
              }}
            >
              Yakunlash <Check size={18} />
            </button>
          ) : (
            <button
              onClick={handleNextQuestion}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 28px',
                backgroundColor: 'var(--primary-base)',
                color: '#fff',
                border: 'none',
                borderRadius: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '15px',
                boxShadow: '0 4px 10px rgba(79, 70, 229, 0.2)'
              }}
            >
              Keyingi <ArrowRight size={18} />
            </button>
          )}
        </div>
        </div>
      </div>
    );
  }

  // 2. QUIZ FINISHED RESULTS SCREEN
  if (quizFinished && activeTest) {
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    activeTest.questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === undefined) unansweredCount += 1;
      else if (selectedAnswers[idx] === q.correctAnswer) correctCount += 1;
      else wrongCount += 1;
    });
    const totalQ = activeTest.questions.length;
    const percent = Math.round((correctCount / totalQ) * 100);

    // Circle math for the SVG progress ring
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    // ----- Detailed mistakes analysis view (separate screen) -----
    if (showAnalysis) {
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          overflowY: 'auto',
          animation: 'fadeIn 0.3s ease-in-out'
        }}>
          <div style={{ width: '100%', maxWidth: '900px', margin: '40px auto', padding: '24px 20px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b', margin: 0 }}>Savollar tahlili va tushuntirishlar</h2>
                <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
                  Natijangiz: <b>{percent}%</b> • To'g'ri: {correctCount} • Noto'g'ri: {wrongCount} • Javobsiz: {unansweredCount}
                </p>
              </div>
              <button
                onClick={() => setShowAnalysis(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '12px 22px', backgroundColor: '#fff', color: '#475569',
                  border: '1px solid #cbd5e1', borderRadius: '12px', fontWeight: 700, cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                <ArrowLeft size={16} /> Orqaga
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {activeTest.questions.map((q, idx) => {
                const userAnswer = selectedAnswers[idx];
                const isCorrect = userAnswer === q.correctAnswer;
                return (
                  <div key={idx} style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', border: isCorrect ? '1px solid #dcfce7' : '1px solid #fee2e2', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div style={{ padding: '4px 10px', borderRadius: '8px', backgroundColor: isCorrect ? '#e6fcf5' : '#fff0f6', color: isCorrect ? '#0ca678' : '#f03e3e', fontWeight: 700, fontSize: '13px', marginTop: '2px' }}>
                        {isCorrect ? "To'g'ri" : (userAnswer === undefined ? "Javobsiz" : "Noto'g'ri")}
                      </div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b', lineHeight: 1.5 }}>
                        {idx + 1}. {q.questionText}
                      </h4>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginBottom: '16px', paddingLeft: '10px' }}>
                      {q.options.map((opt, oIdx) => {
                        let border = '1px solid #e2e8f0';
                        let bg = '#f8fafc';
                        let color = '#475569';
                        let label = '';
                        if (oIdx === q.correctAnswer) {
                          border = '1.5px solid #10b981';
                          bg = '#ecfdf5';
                          color = '#065f46';
                          label = " (To'g'ri javob)";
                        } else if (oIdx === userAnswer && !isCorrect) {
                          border = '1.5px solid #ef4444';
                          bg = '#fef2f2';
                          color = '#991b1b';
                          label = ' (Sizning javobingiz)';
                        }
                        return (
                          <div key={oIdx} style={{ padding: '12px 16px', borderRadius: '10px', border, backgroundColor: bg, color, fontSize: '14px', fontWeight: (oIdx === q.correctAnswer || oIdx === userAnswer) ? 600 : 450 }}>
                            {String.fromCharCode(65 + oIdx)}) {opt}{label}
                          </div>
                        );
                      })}
                    </div>
                    {q.explanation && (
                      <div style={{ display: 'flex', gap: '10px', backgroundColor: '#eff6ff', padding: '16px', borderRadius: '12px', borderLeft: '4px solid #3b82f6', color: '#1e3a8a', fontSize: '14px', lineHeight: 1.6 }}>
                        <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <b style={{ display: 'block', marginBottom: '4px' }}>Tushuntirish:</b>
                          {q.explanation}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: '30px', textAlign: 'center' }}>
              <button
                onClick={() => setShowAnalysis(false)}
                style={{
                  padding: '14px 28px', backgroundColor: 'var(--primary-base)', color: '#fff',
                  border: 'none', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontSize: '15px'
                }}
              >
                Natijaga qaytish
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        overflowY: 'auto',
        animation: 'fadeIn 0.3s ease-in-out'
      }}>
        <div style={{ width: '100%', maxWidth: '620px', margin: '40px auto', padding: '24px 20px', boxSizing: 'border-box' }}>

          {/* Compact result card */}
          <div style={{
            textAlign: 'center', color: '#0f172a',
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '24px',
            padding: '36px 28px',
            boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.08)'
          }}>
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#f59e0b', marginBottom: '28px', letterSpacing: '0.5px' }}>
              🎉 Test yakunlandi!
            </h2>

            {/* Circular percent */}
            <div style={{ width: '180px', height: '180px', margin: '0 auto 28px', position: 'relative' }}>
              <svg viewBox="0 0 160 160" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="80" cy="80" r={radius} stroke="#e2e8f0" strokeWidth="8" fill="none" />
                <circle
                  cx="80" cy="80" r={radius}
                  stroke="#f59e0b" strokeWidth="8" fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '34px', fontWeight: 800, color: '#0f172a' }}>
                {percent}%
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
              <div style={{ padding: '16px', backgroundColor: '#ecfdf5', borderRadius: '14px', border: '1px solid #d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#0f172a' }}>
                <span style={{ color: '#10b981', fontSize: '20px', fontWeight: 700 }}>✓</span>
                <span style={{ color: '#475569', fontSize: '14.5px' }}>To'g'ri:</span>
                <b style={{ fontSize: '18px' }}>{correctCount}</b>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#fef2f2', borderRadius: '14px', border: '1px solid #fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#0f172a' }}>
                <span style={{ color: '#ef4444', fontSize: '20px', fontWeight: 700 }}>✕</span>
                <span style={{ color: '#475569', fontSize: '14.5px' }}>Noto'g'ri:</span>
                <b style={{ fontSize: '18px' }}>{wrongCount}</b>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#faf5ff', borderRadius: '14px', border: '1px solid #f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#0f172a' }}>
                <span style={{ fontSize: '18px' }}>🟣</span>
                <span style={{ color: '#475569', fontSize: '14.5px' }}>Javobsiz:</span>
                <b style={{ fontSize: '18px' }}>{unansweredCount}</b>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#eef2ff', borderRadius: '14px', border: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#0f172a' }}>
                <span style={{ fontSize: '18px' }}>📊</span>
                <span style={{ color: '#475569', fontSize: '14.5px' }}>Jami:</span>
                <b style={{ fontSize: '18px' }}>{totalQ}</b>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                onClick={() => setShowAnalysis(true)}
                style={{
                  padding: '14px 16px',
                  background: '#fff',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '14px',
                  fontWeight: 700, fontSize: '14.5px',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}
              >
                📝 Xatolarni ko'rish
              </button>
              <button
                onClick={() => {
                  setActiveTest(null);
                  setQuizFinished(false);
                }}
                style={{
                  padding: '14px 16px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '14px',
                  fontWeight: 700, fontSize: '14.5px',
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(79, 70, 229, 0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}
              >
                🏠 Bosh sahifa
              </button>
            </div>

            <button
              onClick={() => handleStartQuiz(activeTest)}
              style={{
                marginTop: '14px',
                padding: '12px 20px',
                background: 'transparent',
                color: '#64748b',
                border: '1px dashed #cbd5e1',
                borderRadius: '12px',
                fontWeight: 600, fontSize: '13.5px',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '8px'
              }}
            >
              <RefreshCw size={14} /> Qayta topshirish
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. DETAILED PAST RESULT VIEWER
  if (viewingResult) {
    return (
      <div style={{ animation: 'fadeIn 0.3s ease-in-out', width: '100%', maxWidth: '850px', margin: '20px auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Natija Tahlili</h2>
            <span style={{ fontSize: '14px', color: '#64748b' }}>{viewingResult.title} • {viewingResult.date}</span>
          </div>
          <button
            onClick={() => setViewingResult(null)}
            style={{ padding: '10px 20px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}
          >
            Orqaga qaytish
          </button>
        </div>

        <div style={{ backgroundColor: '#fff', padding: '20px 30px', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', gap: '30px', alignItems: 'center', marginBottom: '30px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            backgroundColor: (viewingResult.score / viewingResult.total) >= 0.6 ? '#dcfce7' : '#fee2e2',
            color: (viewingResult.score / viewingResult.total) >= 0.6 ? '#16a34a' : '#ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '20px'
          }}>
            {Math.round((viewingResult.score / viewingResult.total) * 100)}%
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#0f172a' }}>To'g'ri javoblar ko'rsatkichi</h4>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
              Jami savollar: {viewingResult.total} ta • To'g'ri: {viewingResult.score} ta • Xato: {viewingResult.total - viewingResult.score} ta
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {viewingResult.questions.map((q, idx) => {
            const userAnswer = viewingResult.answers[idx];
            const isCorrect = userAnswer === q.correctAnswer;

            return (
              <div key={idx} style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', border: isCorrect ? '1px solid #dcfce7' : '1px solid #fee2e2', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    backgroundColor: isCorrect ? '#e6fcf5' : '#fff0f6',
                    color: isCorrect ? '#0ca678' : '#f03e3e',
                    fontWeight: '700',
                    fontSize: '13px',
                    marginTop: '2px'
                  }}>
                    {isCorrect ? "To'g'ri" : "Noto'g'ri"}
                  </div>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b', lineHeight: '1.5' }}>
                    {idx + 1}. {q.questionText}
                  </h4>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginBottom: '16px', paddingLeft: '10px' }}>
                  {q.options.map((opt, oIdx) => {
                    let border = '1px solid #e2e8f0';
                    let bg = '#f8fafc';
                    let color = '#475569';
                    let label = '';

                    if (oIdx === q.correctAnswer) {
                      border = '1.5px solid #10b981';
                      bg = '#ecfdf5';
                      color = '#065f46';
                      label = ' (To\'g\'ri javob)';
                    } else if (oIdx === userAnswer && !isCorrect) {
                      border = '1.5px solid #ef4444';
                      bg = '#fef2f2';
                      color = '#991b1b';
                      label = ' (Sizning javobingiz)';
                    }

                    return (
                      <div 
                        key={oIdx}
                        style={{ 
                          padding: '12px 16px', borderRadius: '10px', border, backgroundColor: bg, color,
                          fontSize: '14px', fontWeight: (oIdx === q.correctAnswer || oIdx === userAnswer) ? '600' : '450'
                        }}
                      >
                        {String.fromCharCode(65 + oIdx)}) {opt} {label}
                      </div>
                    );
                  })}
                </div>

                {q.explanation && (
                  <div style={{ display: 'flex', gap: '10px', backgroundColor: '#eff6ff', padding: '16px', borderRadius: '12px', borderLeft: '4px solid #3b82f6', color: '#1e3a8a', fontSize: '14px', lineHeight: '1.6' }}>
                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <b style={{ display: 'block', marginBottom: '4px' }}>Tushuntirish:</b>
                      {q.explanation}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 4. MAIN DASHBOARD UI
  const totalQuestions = visibleTests.reduce((s, t) => s + t.questions.length, 0);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-in-out', width: '100%', margin: '0 auto', padding: '20px' }}>

      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%)',
        borderRadius: '28px',
        padding: '36px 40px',
        color: '#fff',
        marginBottom: '28px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '220px', height: '220px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-80px', left: '40%', width: '180px', height: '180px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px', position: 'relative' }}>
          <Sparkles size={26} />
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', opacity: 0.9 }}>
            Testlar markazi
          </span>
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 800, margin: '0 0 10px 0', lineHeight: 1.2, position: 'relative' }}>
          Bir nechta sinfni birga tanlang
        </h1>
        <p style={{ fontSize: '15.5px', opacity: 0.92, maxWidth: '620px', margin: 0, lineHeight: 1.6, position: 'relative' }}>
          Quyidagi chiplardan kerakli sinflarni belgilang — barcha tanlangan sinflarning testlari bitta ro'yxatda ko'rinadi.
        </p>

        <div style={{ display: 'flex', gap: '14px', marginTop: '24px', flexWrap: 'wrap', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
            <GraduationCap size={16} />
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{selectedGrades.length} sinf tanlangan</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
            <ClipboardList size={16} />
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{visibleTests.length} ta test</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
            <TrendingUp size={16} />
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{totalQuestions} ta savol</span>
          </div>
          <div
            title="Savollar har kuni soat 00:00 da yangilanadi"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(251, 191, 36, 0.22)', border: '1px solid rgba(251, 191, 36, 0.4)', padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
          >
            <Timer size={16} />
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>Yangi savollar: {formatHM(refreshIn)}</span>
          </div>
        </div>
      </div>

      {/* Filter card: grade chips + search */}
      <div style={{ marginBottom: '32px', backgroundColor: '#fff', padding: '24px 26px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Filter size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Sinflarni tanlang</h3>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#94a3b8' }}>Bir yoki bir nechta sinfni belgilang</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={selectAllGrades}
              style={{ padding: '8px 14px', border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
            >
              Hammasi
            </button>
            <button
              onClick={clearGrades}
              disabled={selectedGrades.length === 0}
              style={{ padding: '8px 14px', border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', color: selectedGrades.length === 0 ? '#cbd5e1' : '#ef4444', fontWeight: 600, fontSize: '13px', cursor: selectedGrades.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              Tozalash
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {AVAILABLE_GRADES.map(g => {
            const selected = selectedGrades.includes(g);
            const count = allTests.filter(t => t.grade === g).length;
            return (
              <button
                key={g}
                onClick={() => toggleGrade(g)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 18px', borderRadius: '999px',
                  border: selected ? '2px solid #4f46e5' : '1.5px solid #e2e8f0',
                  background: selected ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : '#fff',
                  color: selected ? '#fff' : '#475569',
                  fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                  boxShadow: selected ? '0 6px 14px rgba(79, 70, 229, 0.25)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                {selected && <Check size={14} />}
                <span>{g}-sinf</span>
                <span style={{ fontSize: '11.5px', opacity: selected ? 0.9 : 0.6, fontWeight: 600 }}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

      </div>

      {/* Section title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: '0 0 5px 0', fontSize: '20px', color: '#1e293b', fontWeight: 800 }}>
            {selectedGrades.length === 0
              ? "Sinflar tanlanmagan"
              : selectedGrades.length === 1
                ? `${selectedGrades[0]}-sinf testlari`
                : `${selectedGrades.length} sinf testlari`}
          </h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
            {visibleTests.length} ta test • {totalQuestions} ta savol
          </p>
        </div>
      </div>

      {loading ? (
        <div className="tests-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '50px' }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', border: '1px solid #e2e8f0', opacity: 0.8 }}>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#f1f5f9', animation: 'pulse 1.5s infinite' }}></div>
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ height: '18px', width: '70%', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite' }}></div>
                  <div style={{ height: '12px', width: '40%', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite' }}></div>
                </div>
              </div>
              <div style={{ height: '44px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '12px' }}></div>
            </div>
          ))}
        </div>
      ) : selectedGrades.length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '24px', border: '1px dashed #cbd5e1', marginBottom: '50px' }}>
          <Filter size={40} style={{ color: '#94a3b8', marginBottom: '16px' }} />
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#475569' }}>Hech qaysi sinf tanlanmagan</p>
          <p style={{ margin: '6px 0 0 0', fontSize: '13.5px', color: '#94a3b8' }}>
            Yuqoridagi chiplardan kamida bitta sinfni belgilang yoki "Hammasi"ni bosing.
          </p>
        </div>
      ) : visibleTests.length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '24px', border: '1px dashed #cbd5e1', marginBottom: '50px' }}>
          <ClipboardList size={40} style={{ color: '#94a3b8', marginBottom: '16px' }} />
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#475569' }}>Testlar topilmadi</p>
          <p style={{ margin: '6px 0 0 0', fontSize: '13.5px', color: '#94a3b8' }}>
            Tanlangan sinflarda hozircha testlar mavjud emas yoki qidiruv mos kelmadi.
          </p>
        </div>
      ) : (() => {
        const poolSize = visibleTests.reduce((s, t) => s + t.questions.length, 0);
        const qCount = Math.min(QUIZ_LENGTH, poolSize);
        const approxTime = qCount;
        const firstTest = visibleTests[0];
        return (
          <div
            style={{
              backgroundColor: '#fff', borderRadius: '24px', padding: '36px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 30px -8px rgba(0,0,0,0.08)',
              marginBottom: '50px', position: 'relative', overflow: 'hidden'
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5px', background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%)' }} />

            {/* Selected grade chips at top */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
              {selectedGrades.map(g => (
                <span
                  key={g}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '6px 14px', borderRadius: '999px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    color: '#fff', fontSize: '13px', fontWeight: 700,
                    boxShadow: '0 4px 10px rgba(79, 70, 229, 0.2)'
                  }}
                >
                  <GraduationCap size={14} /> {g}-sinf
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '28px', flexWrap: 'wrap' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '20px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 12px 24px rgba(79, 70, 229, 0.3)', flexShrink: 0
              }}>
                <Sparkles size={32} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', color: '#0f172a', fontWeight: 800 }}>
                  Tasodifiy {QUIZ_LENGTH} savoldan iborat test
                </h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: '14.5px', lineHeight: 1.5 }}>
                  Tanlangan sinflar savollar bazasidan tasodifiy {qCount} ta savol tushadi.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '28px' }}>
              <div style={{ padding: '14px 18px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Savollar</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{qCount}</div>
              </div>
              <div style={{ padding: '14px 18px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vaqt</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{approxTime} min</div>
              </div>
              <div style={{ padding: '14px 18px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sinflar</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{selectedGrades.length}</div>
              </div>
              <div style={{ padding: '14px 18px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Baza</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{poolSize}</div>
              </div>
            </div>

            <button
              onClick={() => handleStartQuiz(firstTest)}
              disabled={qCount === 0}
              style={{
                width: '100%', padding: '18px',
                background: qCount > 0 ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : '#cbd5e1',
                color: '#fff', border: 'none', borderRadius: '14px',
                fontWeight: 800, cursor: qCount > 0 ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s', fontSize: '16px',
                boxShadow: qCount > 0 ? '0 10px 20px rgba(79, 70, 229, 0.3)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
              }}
            >
              {qCount > 0 ? (
                <>
                  Testni boshlash <ArrowRight size={18} />
                </>
              ) : (
                "Hozircha savollar yo'q"
              )}
            </button>
          </div>
        );
      })()}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .quiz-option-btn:hover {
          background-color: #f1f5f9 !important;
          border-color: #cbd5e1 !important;
          transform: translateY(-1px);
        }
        .quiz-option-btn.selected:hover {
          background-color: var(--primary-light) !important;
          border-color: var(--primary-base) !important;
        }
        .mistake-card-hover:hover {
          border-color: #cbd5e1 !important;
          box-shadow: 0 8px 20px rgba(0,0,0,0.04) !important;
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
};

export default TestsPage;
