// index.js
// זהו קובץ ה-API הראשי, מותאם לפריסה כ-Web Service ב-Render.
// הוא משתמש ב-Express.js כדי ליצור שרת HTTP שמקשיב לפורט.
CORS(app, resources={r"/api/*": {"origins": "http://localhost:8000"}})


const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https'); 
const Hebcal = require('hebcal'); // ייבוא ספריית hebcal המקומית

const app = express();
const PORT = process.env.PORT || 10000; // Render provides PORT environment variable

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Enable JSON body parsing

// --- הוספת שורה קריטית זו כדי להגיש קבצים סטטיים מהתיקייה 'public' ---
app.use(express.static(path.join(__dirname, 'public')));


// --- פונקציות עזר חדשות לפארסר תאריכים עבריים ---
const HEBREW_NUMERALS_MAP = {
    'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
    'י': 10, 'כ': 20, 'ל': 30, 'מ': 40, 'נ': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'צ': 90,
    'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400
};

// פונקציה להמרת מספר בגימטריה (בודד או צירוף פשוט) למספר לועזי
function hebrewGematriaToNumber(gematriaStr) {
    if (!gematriaStr) return null;
    let sum = 0;
    // Remove geresh/gershayim and other punctuation that might be present
    const cleanGematriaStr = gematriaStr.replace(/['״\u05f3\u05f4\u2019\u201c\u201d\u00AB\u00BB\u2039\u203A\u203C\u203D\u203E\u203F\u2040\/\-]/g, '');

    // Handle common combined hundreds like 'תש' (700), 'תת' (800), 'תתק' (900)
    // This assumes the input is clean and correctly ordered for additive gematria
    // The current `hebrewGematriaToNumber` sums individual chars, which works for additive forms like 'תש' (400+300)
    for (let char of cleanGematriaStr) {
        const val = HEBREW_NUMERALS_MAP[char];
        if (val) {
            sum += val;
        } else {
            return null; // Invalid character found
        }
    }
    return sum;
}

// מפה של שמות חודשים עבריים למספרים ולשמות באנגלית עבור Hebcal
const HEBREW_MONTH_TO_NUMBER_AND_ENGLISH = {
    'אדר ב': { num: 13, en: 'Adar II' },
    'אדר א': { num: 12, en: 'Adar I' },
    'מרחשון': { num: 8, en: 'Cheshvan' },
    'מנחם אב': { num: 5, en: 'Av' },
    'תשרי': { num: 7, en: 'Tishrei' },
    'חשון': { num: 8, en: 'Cheshvan' },
    'כסלו': { num: 9, en: 'Kislev' },
    'טבת': { num: 10, en: 'Tevet' },
    'שבט': { num: 11, en: 'Shvat' },
    'אדר': { num: 12, en: 'Adar' },
    'ניסן': { num: 1, en: 'Nisan' },
    'אייר': { num: 2, en: 'Iyyar' },
    'סיון': { num: 3, en: 'Sivan' },
    'תמוז': { num: 4, en: 'Tammuz' },
    'אב': { num: 5, en: 'Av' },
    'אלול': { num: 6, en: 'Elul' }
};

/**
 * מנסה לנתח מחרוזת תאריך עברי ולקבל יום, חודש ושנה כמספרים.
 * @param {string} dateString מחרושבת התאריך העברי לניתוח
 * @returns {object|null} אובייקט עם hday, hmonth (שם עברי), hyear (מספר) או null אם הניתוח נכשל.
 */
function parseHebrewDateString(dateString) {
    console.log(`[PARSE DEBUG] Original string: "${dateString}"`);

    if (!dateString) return null;

    let cleanedString = dateString;

    cleanedString = cleanedString.normalize('NFD')
                                 .replace(/[\u0591-\u05C7\u200e\u200f]/g, '');

    cleanedString = cleanedString.replace(/['"\u05f3\u05f4\u2019\u201c\u201d\u00AB\u00BB\u2039\u203A\u203C\u203D\u203E\u203F\u2040\/\-]/g, '');

    cleanedString = cleanedString.replace(/\s+ב\s+/g, ' ');
    cleanedString = cleanedString.replace(/^ב\s+/g, '');
    cleanedString = cleanedString.replace(/בְּ|בּ/g, '');

    cleanedString = cleanedString.replace(/\s+/g, ' ').trim();

    console.log(`[PARSE DEBUG] Cleaned string: "${cleanedString}"`);

    let hday = null;
    let hmonth = null;
    let hyear = null;

    const monthNamesOrdered = Object.keys(HEBREW_MONTH_TO_NUMBER_AND_ENGLISH).sort((a, b) => b.length - a.length);

    for (const monthName of monthNamesOrdered) {
        if (cleanedString.includes(monthName)) {
            hmonth = monthName;

            const tempString = cleanedString.replace(new RegExp(monthName, 'g'), '###MONTH_PLACEHOLDER###');
            const parts = tempString.split('###MONTH_PLACEHOLDER###').map(p => p.trim());

            console.log(`[PARSE DEBUG] Found month: ${hmonth}, Parts: [${parts.join(', ')}]`);

            const dayPart = parts[0] || '';
            const yearPart = parts[1] || '';

            if (dayPart) {
                hday = hebrewGematriaToNumber(dayPart);
                if (hday === null) {
                    hday = parseInt(dayPart, 10);
                    if (isNaN(hday)) {
                        hday = null;
                    }
                }
            }

            if (yearPart) {
                let currentYear = 0;
                let yearStr = yearPart;

                currentYear = parseInt(yearStr, 10);
                if (!isNaN(currentYear) && currentYear > 0) {
                    hyear = currentYear;
                } else {
                    let prefixValue = 0;
                    let suffixStr = yearStr;

                    const firstChar = yearStr[0];
                    if (['א', 'ב', 'ג', 'ד', 'ה', 'ו'].includes(firstChar) && yearStr.length > 1) {
                        prefixValue = hebrewGematriaToNumber(firstChar) * 1000;
                        suffixStr = yearStr.substring(1);
                    } else if (yearStr.length > 3) { // Assuming years like 'תשפ"ה' imply 5000s
                         prefixValue = 5000; // Default to 5000 if not explicitly stated (e.g., תשפ"ה implies 5785)
                    }

                    const suffixValue = hebrewGematriaToNumber(suffixStr);
                    if (suffixValue !== null) {
                        hyear = prefixValue + suffixValue;
                    } else if (hebrewGematriaToNumber(yearStr) !== null) {
                         hyear = 5000 + hebrewGematriaToNumber(yearStr);
                    } else {
                         hyear = null;
                    }
                }
            }
            break;
        }
    }

    if (hday !== null && hmonth !== null && hyear !== null) {
        console.log(`[PARSE SUCCESS] Parsed: Day=${hday}, Month=${hmonth}, Year=${hyear}`);
        return { hday, hmonth, hyear };
    }

    console.warn(`[PARSE FAILURE] Failed to parse Hebrew date string: "${dateString}" (cleaned: "${cleanedString}")`);
    return null;
}


// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// פונקציית עזר לביצוע קריאות HTTP עם מודול https המובנה
function makeHttpsRequest(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
                }
            });
        }).on('error', (err) => {
            reject(new Error(`HTTPS request to ${url} failed: ${err.message}`));
        });
    });
}


// Endpoint to convert Gregorian date to Hebrew date using Hebcal.com REST API
app.get('/api/convert', async (req, res) => {
    const { year, month, day } = req.query;

    if (!year || !month || !day) {
        return res.status(400).json({ error: 'חובה לספק שנה לועזית (year), חודש לועזי (month) ויום לועזי (day).', errorCode: 'MISSING_PARAMETERS' });
    }

    try {
        const hebcalApiUrl = `https://www.hebcal.com/converter?cfg=json&gy=${year}&gm=${month}&gd=${day}&g2h=1`;
        const data = await makeHttpsRequest(hebcalApiUrl); // שימוש בפונקציית העזר makeHttpsRequest

        if (data.error) {
            console.error('Error from Hebcal API (Gregorian to Hebrew):', data.error);
            return res.status(500).json({ error: 'שגיאה בהמרת תאריך באמצעות שירות חיצוני.', details: data.error, errorCode: 'EXTERNAL_API_ERROR' });
        }

        // Extract Hebrew date components
        const hebcalHDate = new Hebcal.HDate(new Date(parseInt(year), parseInt(month) - 1, parseInt(day))); // Create HDate from Gregorian
        const hebrewYear = hebcalHDate.getFullYear();
        const hebrewMonth = hebcalHDate.getMonthName('he'); // Get Hebrew month name
        const hebrewDay = hebcalHDate.getDate();

        res.json({
            gregorian: {
                year: parseInt(year),
                month: parseInt(month),
                day: parseInt(day)
            },
            hebrew: {
                year: hebrewYear,
                month: hebrewMonth,
                day: hebrewDay
            },
            gregorianFormatted: `${data.gd}/${data.gm}/${data.gy}`,
            hebrewFormatted: data.hebrew
        });

    } catch (error) {
        console.error('שגיאה בהמרת תאריך לועזי לעברי (External API Call):', error);
        console.error('Stack Trace:', error.stack);
        res.status(500).json({ error: 'שגיאה פנימית בשרת בעת המרת תאריך לועזי.', details: error.message, errorCode: 'INTERNAL_SERVER_ERROR' });
    }
});

const ancientDateLookup = {
    "1056-תשרי-1": { hebrew: "א׳ בְּתִשְׁרֵי א׳נ״ו", gregorian: "12/9/-2706" },
    "1656-חשון-17": { hebrew: "י״ז בְּחֶשְׁוָן א׳תקנ״ו", gregorian: "20/11/-2105" },
    "1656-אייר-17": { hebrew: "י״ז בְּאִיָּר א׳תקנ״ו", gregorian: "23/5/-2105" },
    "1948-ניסן-1": { hebrew: "א׳ בְּנִיסָן א׳תתקמ״ח", gregorian: "16/3/-1812" },
    "1948-תשרי-1": { hebrew: "א׳ בְּתִשְׁרֵי א׳תתקמ״ח", gregorian: "20/9/-1812" },
    "2085-תשרי-1": { hebrew: "א׳ בְּתִשְׁרֵי ב׳פ״ה", gregorian: "15/9/-1676" },
    "2085-תשרי-10": { hebrew: "י׳ בְּתִשְׁרֵי ב׳פ״ה", gregorian: "24/9/-1676" },
    "2448-ניסן-15": { hebrew: "ט״ו בְּנִיסָן ב׳תמ״ח", gregorian: "21/3/-1312" },
    "2448-סיון-6": { hebrew: "ו׳ בְּסִיוָן ב׳תמ״ח", gregorian: "11/5/-1312" },
    "2448-סיון-7": { hebrew: "ז׳ בְּסִיוָן ב׳תמ״ח", gregorian: "12/5/-1312" },
    "2449-ניסן-1": { hebrew: "א׳ בְּנִיסָן ב׳תמ״ט", gregorian: "30/3/-1311" },
    "2449-אב-9": { hebrew: "ט׳ בְּאָב ב׳תמ״ט", gregorian: "27/7/-1311" },
    "2488-ניסן-28": { hebrew: "כ״ח בְּנִיסָן ב׳תמ״ח", gregorian: "19/4/-1272" },
    "2516-ניסן-26": { hebrew: "כ״ו בְּנִיסָן ב׳תקי״ו", gregorian: "26/4/-1244" },
    "2928-אייר-1": { hebrew: "א׳ בְּאִיָּר ב׳תתקכ״ח", gregorian: "10/5/-832" },
    "3338-אב-9": { hebrew: "ט׳ בְּאָב ג׳של״ח", gregorian: "28/7/-422" },
    "3390-תשרי-1": { hebrew: "א׳ בְּתִשְׁרֵי ג׳תצ״א", gregorian: "24/9/-370" },
    "3405-אדר-13": { hebrew: "י״ג בְּאֶדָר ג׳תק״ה", gregorian: "25/2/-355" },
    "3408-כסלו-24": { hebrew: "כ״ד בְּכִסְלֵו ג׳תק״ח", gregorian: "15/12/-353" },
    "3622-כסלו-25": { hebrew: "כ״ה בְּכִסְלֵו ג׳תתכ״ב", gregorian: "13/12/-138" },
    "3828-אב-9": { hebrew: "ט׳ בְּאָב ג׳תתכ״ח", gregorian: "5/8/69" },
    "5708-אייר-5": { hebrew: "ה׳ בְּאִיָּר ה׳תש״ח", gregorian: "14/5/1948" },
    "5155-תשרי-1": { hebrew: "א׳ בְּתִשְׁרֵי ה׳קנ״ה", gregorian: "1/9/1394" },
    "5532-תשרי-1": { hebrew: "א׳ בְּתִשְׁרֵי ה׳תקל״ב", gregorian: "9/9/1771" },
    "5657-תשרי-1": { hebrew: "א׳ בְּתִשְׁרֵי ה׳תרנ״ז", gregorian: "28/8/1896" },
};

// Endpoint to convert Hebrew date to Gregorian date using Hebcal.com REST API or lookup table
app.get('/api/convert-hebrew', async (req, res) => {
    const { hyear, hmonth, hday } = req.query;

    if (!hyear || !hmonth || !hday) {
        return res.status(400).json({ error: 'חובה לספק שנת יומן עברי (hyear), חודש עברי (hmonth) ויום עברי (day).', errorCode: 'MISSING_PARAMETERS' });
    }

    const lookupKey = `${hyear}-${hmonth}-${hday}`;
    if (ancientDateLookup[lookupKey]) {
        const lookupResult = ancientDateLookup[lookupKey];
        // Parse Gregorian from lookup table for structured output
        const [gd, gm, gy] = lookupResult.gregorian.split('/').map(Number);
        return res.json({
            hebrew: {
                year: parseInt(hyear), // Assuming hyear from query is numeric
                month: hmonth,
                day: parseInt(hday) // Assuming hday from query is numeric
            },
            gregorian: {
                year: gy,
                month: gm,
                day: gd
            },
            hebrewFormatted: lookupResult.hebrew,
            gregorianFormatted: lookupResult.gregorian
        });
    }

    try {
        const englishMonthName = HEBREW_MONTH_TO_NUMBER_AND_ENGLISH[hmonth]?.en;

        if (!englishMonthName) {
            return res.status(400).json({ error: `שם חודש עברי לא חוקי: '${hmonth}'. אנא וודא איות נכון (לדוגמה: "תשרי", "אב").`, errorCode: 'INVALID_HEBREW_MONTH' });
        }

        const hebcalApiUrl = `https://www.hebcal.com/converter?cfg=json&hy=${hyear}&hm=${englishMonthName}&hd=${hday}&h2g=1`;

        const data = await makeHttpsRequest(hebcalApiUrl); // שימוש בפונקציית העזר makeHttpsRequest

        if (data.error) {
            console.error('Error from Hebcal API (Hebrew to Gregorian):', data.error);
            return res.status(500).json({ error: 'שגיאה בהמרת תאריך באמצעות שירות חיצוני.', details: data.error, errorCode: 'EXTERNAL_API_ERROR' });
        }

        let gregorianFormatted = null;
        let gregorianYear = null;
        let gregorianMonth = null;
        let gregorianDay = null;

        if (data.gy && data.gm && data.gd) {
            gregorianFormatted = `${data.gd}/${data.gm}/${data.gy}`;
            gregorianYear = data.gy;
            gregorianMonth = data.gm;
            gregorianDay = data.gd;
        }

        res.json({
            hebrew: {
                year: parseInt(hyear),
                month: hmonth,
                day: parseInt(hday)
            },
            gregorian: {
                year: gregorianYear,
                month: gregorianMonth,
                day: gregorianDay
            },
            hebrewFormatted: data.hebrew,
            gregorianFormatted: gregorianFormatted
        });

    } catch (error) {
        console.error('שגיאה בהמרת תאריך עברי ללועזי (External API Call):', error);
        res.status(500).json({ error: 'שגיאה פנימית בשרת בעת המרת תאריך עברי.', details: error.message, errorCode: 'INTERNAL_SERVER_ERROR' });
    }
});


// Endpoint to convert a full Hebrew date string to Gregorian
app.get('/api/parse-and-convert-hebrew', async (req, res) => {
    const { dateString } = req.query;

    if (!dateString) {
        return res.status(400).json({ error: 'חובה לספק מחרוזת תאריך עברי (dateString).', errorCode: 'MISSING_PARAMETERS' });
    }

    const parsedDate = parseHebrewDateString(dateString);

    if (!parsedDate) {
        return res.status(400).json({ error: `לא ניתן לנתח את מחרוזת התאריך העברי: "${dateString}". אנא וודא שהפורמט נכון (לדוגמה: "ד' ניסן ג'תקמ"ו" או "15 אב 5785").`, errorCode: 'INVALID_HEBREW_DATE_FORMAT' });
    }

    const { hday, hmonth, hyear } = parsedDate;

    const englishMonthName = HEBREW_MONTH_TO_NUMBER_AND_ENGLISH[hmonth]?.en;

    if (!englishMonthName) {
        return res.status(500).json({ error: `שגיאה פנימית: שם חודש עברי לא חוקי לאחר הניתוח: '${hmonth}'.`, errorCode: 'INTERNAL_MONTH_PARSE_ERROR' });
    }

    const lookupKey = `${hyear}-${hmonth}-${hday}`;
    if (ancientDateLookup[lookupKey]) {
        const lookupResult = ancientDateLookup[lookupKey];
        const [gd, gm, gy] = lookupResult.gregorian.split('/').map(Number);
        return res.json({
            hebrew: {
                year: hyear,
                month: hmonth,
                day: hday
            },
            gregorian: {
                year: gy,
                month: gm,
                day: gd
            },
            hebrewFormatted: lookupResult.hebrew,
            gregorianFormatted: lookupResult.gregorian
        });
    }

    try {
        const hdate = new Hebcal.HDate(hday, englishMonthName, hyear);
        const gdate = hdate.greg();

        res.json({
            hebrew: {
                year: hyear,
                month: hmonth,
                day: hday
            },
            gregorian: {
                year: gdate.getFullYear(),
                month: gdate.getMonth() + 1, // Month is 0-indexed
                day: gdate.getDate()
            },
            hebrewFormatted: hdate.toString('he'),
            gregorianFormatted: `${gdate.getDate()}/${gdate.getMonth() + 1}/${gdate.getFullYear()}`
        });

    } catch (error) {
        console.error('שגיאה בהמרת תאריך עברי שנותח ללועזי:', error);
        res.status(500).json({ error: 'שגיאה פנימית בשרת בעת המרת תאריך עברי שנותח.', details: error.message, errorCode: 'INTERNAL_SERVER_ERROR' });
    }
});


// --- נקודת קצה חדשה: קבלת אפשרויות לרשימות נגללות ---
app.get('/api/get-options', (req, res) => {
    console.log('[DEBUG] Hitting /api/get-options endpoint');
    // רשימת ימים (1 עד 30 בגימטריה)
    const days = [
        'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
        'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ',
        'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל'
    ];

    // רשימת חודשים
    const months = Object.keys(HEBREW_MONTH_TO_NUMBER_AND_ENGLISH)
                        .filter(m => !m.includes('אדר') && !m.includes('מרחשון') && !m.includes('מנחם אב'))
                        .sort((a, b) => a.localeCompare(b));
    
    // מוסיפים את החודשים ה"מיוחדים" בראש הרשימה
    months.unshift('אדר א', 'אדר ב', 'אדר', 'מרחשון', 'מנחם אב');

    // רשימת שנים (השנה הנוכחית, 50 שנים קדימה ו-50 אחורה)
    const currentHebrewYear = new Hebcal.HDate().getFullYear();
    const years = [];
    for (let i = currentHebrewYear - 50; i <= currentHebrewYear + 50; i++) {
        // Hebcal יודעת להמיר את השנה העברית לגימטריה בצורה הנכונה
        years.push(new Hebcal.HDate(1, 'Nisan', i).toString('he').split(' ')[2]);
    }

    // --- אפשרויות חדשות לחלקי השנה העברית בגימטריה ---
    const hebrewYearParts = {
        thousands: ['ה', 'ד', 'ג', 'ב', 'א'], // 5000s, 4000s, 3000s, 2000s, 1000s
        hundreds: ['תתק', 'תת', 'תש', 'תר', 'תק', 'ת', 'ש', 'ר', 'ק', '0'], // 900-0
        tens: ['צ', 'פ', 'ע', 'ס', 'נ', 'מ', 'ל', 'כ', 'י', '0'], // 90-0
        ones: ['ט', 'ח', 'ז', 'ו', 'ה', 'ד', 'ג', 'ב', 'א', '0'] // 9-0
    };

    res.json({
        days: days,
        months: months,
        years: years, // Full Hebrew years (for existing dropdown)
        hebrewYearParts: hebrewYearParts // Split Hebrew year parts (for new dropdowns)
    });
});

// --- נקודת קצה חדשה: המרת תאריך עברי מפוצל ללועזי ---
app.get('/api/convert-hebrew-split', async (req, res) => {
    const { h_thousands, h_hundreds, h_tens, h_ones, hmonth, hday } = req.query;

    // Validate required parameters
    if (!hmonth || !hday) {
        return res.status(400).json({ error: 'חובה לספק חודש עברי (hmonth) ויום עברי (hday).', errorCode: 'MISSING_PARAMETERS' });
    }

    // Convert hday from Gematria to number if it's not already a number
    let numericHday = parseInt(hday, 10);
    if (isNaN(numericHday)) {
        numericHday = hebrewGematriaToNumber(hday);
        if (numericHday === null) {
            return res.status(400).json({ error: `יום עברי לא חוקי: '${hday}'. אנא וודא איות נכון או פורמט מספרי.`, errorCode: 'INVALID_HEBREW_DAY' });
        }
    }


    // Combine Gematria parts to form the full Hebrew year
    let hyearValue = 0;
    let gematriaYearString = '';

    // Convert and sum thousands
    if (h_thousands && h_thousands !== '0') {
        const thousandsVal = hebrewGematriaToNumber(h_thousands);
        if (thousandsVal === null) {
            return res.status(400).json({ error: `ערך אלפים לא חוקי: '${h_thousands}'.`, errorCode: 'INVALID_THOUSANDS_PART' });
        }
        hyearValue += thousandsVal * 1000;
        gematriaYearString += h_thousands;
    }

    // Convert and sum hundreds
    if (h_hundreds && h_hundreds !== '0') {
        const hundredsVal = hebrewGematriaToNumber(h_hundreds);
        if (hundredsVal === null) {
            return res.status(400).json({ error: `ערך מאות לא חוקי: '${h_hundreds}'.`, errorCode: 'INVALID_HUNDREDS_PART' });
        }
        hyearValue += hundredsVal;
        gematriaYearString += h_hundreds;
    }

    // Convert and sum tens
    if (h_tens && h_tens !== '0') {
        const tensVal = hebrewGematriaToNumber(h_tens);
        if (tensVal === null) {
            return res.status(400).json({ error: `ערך עשרות לא חוקי: '${h_tens}'.`, errorCode: 'INVALID_TENS_PART' });
        }
        hyearValue += tensVal;
        gematriaYearString += h_tens;
    }

    // Convert and sum ones
    if (h_ones && h_ones !== '0') {
        const onesVal = hebrewGematriaToNumber(h_ones);
        if (onesVal === null) {
            return res.status(400).json({ error: `ערך אחדות לא חוקי: '${h_ones}'.`, errorCode: 'INVALID_ONES_PART' });
        }
        hyearValue += onesVal;
        gematriaYearString += h_ones;
    }
    
    // If no year parts were provided, or they summed to 0, it's an invalid year
    if (hyearValue === 0 && (h_thousands === '0' || !h_thousands) && (h_hundreds === '0' || !h_hundreds) && (h_tens === '0' || !h_tens) && (h_ones === '0' || !h_ones)) {
        return res.status(400).json({ error: 'חובה לספק שנת יומן עברי (לפחות חלק אחד).', errorCode: 'MISSING_YEAR_PARTS' });
    }

    // Use the combined Hebrew year for conversion
    const hyear = hyearValue;

    // Check ancientDateLookup first
    const lookupKey = `${hyear}-${hmonth}-${numericHday}`; // Use numericHday for lookup key
    if (ancientDateLookup[lookupKey]) {
        const lookupResult = ancientDateLookup[lookupKey];
        const [gd, gm, gy] = lookupResult.gregorian.split('/').map(Number);
        return res.json({
            hebrew: {
                year: hyear,
                month: hmonth,
                day: numericHday // Use numericHday for output
            },
            gregorian: {
                year: gy,
                month: gm,
                day: gd
            },
            hebrewFormatted: lookupResult.hebrew,
            gregorianFormatted: lookupResult.gregorian
        });
    }

    try {
        const englishMonthName = HEBREW_MONTH_TO_NUMBER_AND_ENGLISH[hmonth]?.en;

        if (!englishMonthName) {
            return res.status(400).json({ error: `שם חודש עברי לא חוקי: '${hmonth}'. אנא וודא איות נכון (לדוגמה: "תשרי", "אב").`, errorCode: 'INVALID_HEBREW_MONTH' });
        }

        const hebcalApiUrl = `https://www.hebcal.com/converter?cfg=json&hy=${hyear}&hm=${englishMonthName}&hd=${numericHday}&h2g=1`; // שינוי כאן: שימוש ב-numericHday

        const data = await makeHttpsRequest(hebcalApiUrl); // שימוש בפונקציית העזר makeHttpsRequest

        if (data.error) {
            console.error('Error from Hebcal API (Hebrew split to Gregorian):', data.error);
            return res.status(500).json({ error: 'שגיאה בהמרת תאריך באמצעות שירות חיצוני.', details: data.error, errorCode: 'EXTERNAL_API_ERROR' });
        }

        let gregorianFormatted = null;
        let gregorianYear = null;
        let gregorianMonth = null;
        let gregorianDay = null;

        if (data.gy && data.gm && data.gd) {
            gregorianFormatted = `${data.gd}/${data.gm}/${data.gy}`;
            gregorianYear = data.gy;
            gregorianMonth = data.gm;
            gregorianDay = data.gd;
        }

        res.json({
            hebrew: {
                year: hyear,
                month: hmonth,
                day: numericHday // Use numericHday for output
            },
            gregorian: {
                year: gregorianYear,
                month: gregorianMonth,
                day: gregorianDay
            },
            hebrewFormatted: data.hebrew,
            gregorianFormatted: gregorianFormatted
        });

    } catch (error) {
        console.error('שגיאה בהמרת תאריך עברי מפוצל ללועזי (External API Call):', error);
        res.status(500).json({ error: 'שגיאה פנימית בשרת בעת המרת תאריך עברי מפוצל.', details: error.message, errorCode: 'INTERNAL_SERVER_ERROR' });
    }
});


app.listen(PORT, () => {
    console.log(`שרת פועל בפורט ${PORT}`);
});
