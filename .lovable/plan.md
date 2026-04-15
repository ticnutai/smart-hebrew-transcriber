

# תוכנית: שדרוג מערכת שיפור איכות קול והורדת רעשים

## מה מצאתי במחקר

### טכנולוגיות AI (רצות בדפדפן, ללא שרת):

| טכנולוגיה | תיאור | גודל | יתרונות |
|---|---|---|---|
| **RNNoise (WASM)** | רשת RNN של Xiph.Org, רצה בדפדפן דרך `@shiguredo/rnnoise-wasm` | ~200KB | מהיר מאוד, real-time, תמיכה מלאה בכל הדפדפנים |
| **DeepFilterNet3 (WASM)** | רשת עמוקה מתקדמת יותר, יש חבילת npm `deepfilternet3-workers` | ~2MB | איכות גבוהה יותר מ-RNNoise, תמיכה ב-React |
| **Hush** | מודל חדש (2026) מותאם ל-Voice AI, real-time | חדש | מותאם לדיבור, causal |

### טכנולוגיות ללא AI (Web Audio API מטבעי):

| טכנולוגיה | תיאור |
|---|---|
| **Spectral Gate** | חיתוך רעש על בסיס ספקטרום — לומדים "טביעת אצבע" של הרעש משקט ומנכים |
| **Adaptive Notch Filter** | סינון אוטומטי של תדרי רעש ספציפיים (זמזום חשמל 50/60Hz) |
| **Expander/Gate חכם** | שער רעש מתקדם שמזהה רמת סף דינמית |
| **De-Reverb** | הפחתת הד בחדר באמצעות IIR filters |
| **Voice Activity Detection (VAD)** | זיהוי מתי יש דיבור ומתי שקט — מאפשר להשתיק רק את הרעש |

## מה קיים כבר במערכת

- 5 פריסטים של הפחתת רעש (Web Audio: BiquadFilter + DynamicsCompressor + Noise Gate)
- אקולייזר 5 פסים, Notch Filter, Highpass/Lowpass
- שליחה לשרת חיצוני להשבחה (`/enhance-audio`)

## מה חסר ומה אוסיף

### 1. RNNoise בדפדפן (AI — אפס תלות בשרת)
- התקנת `@shiguredo/rnnoise-wasm`
- יצירת AudioWorklet שמעביר כל frame דרך RNNoise
- הוספת כפתור "AI Denoise" למיקסר שמפעיל/מכבה את הפילטר בזמן אמת
- עובד על הקובץ הטעון + על הקלטה חיה

### 2. Spectral Noise Gate (ללא AI)
- לימוד פרופיל רעש מ-0.5 שניות שקט ראשונות
- חיסור ספקטרלי (spectral subtraction) באמצעות AnalyserNode + ScriptProcessor
- כפתור "למד רעש" שמאפשר למשתמש לבחור קטע שקט

### 3. Voice Activity Detection (VAD)
- זיהוי אוטומטי של קטעי דיבור vs שקט
- השתקת אוטומטית של קטעי שקט (Auto-Mute)
- חיווי ויזואלי על הגל של אזורי דיבור/שקט

### 4. De-Hum (הסרת זמזום חשמל)
- Auto-detect של 50Hz או 60Hz + הרמוניות
- Notch filters אוטומטיים על 50/100/150/200Hz או 60/120/180/240Hz

### 5. Loudness Normalization
- נורמליזציה ל-LUFS סטנדרטי (broadcast: -14 LUFS, podcast: -16 LUFS)
- מד LUFS בזמן אמת

## פירוט טכני

### קבצים חדשים:
- `src/lib/rnnoiseProcessor.ts` — wrapper סביב `@shiguredo/rnnoise-wasm` עם AudioWorklet
- `src/lib/spectralGate.ts` — spectral noise profiling + subtraction
- `src/lib/voiceActivityDetection.ts` — VAD מבוסס אנרגיה + zero-crossing
- `src/lib/deHum.ts` — auto-detect hum frequency + cascaded notch filters
- `src/lib/loudnessNorm.ts` — LUFS measurement + normalization

### שינויים בקבצים קיימים:
- `src/components/SyncAudioPlayer.tsx` — הוספת כפתורי AI Denoise, Spectral Gate, VAD, De-Hum, LUFS meter לפאנל המיקסר
- `package.json` — הוספת `@shiguredo/rnnoise-wasm`

### סדר ביצוע:
1. התקנת חבילה + יצירת RNNoise Worklet
2. שילוב RNNoise במיקסר כ-toggle
3. הוספת Spectral Gate עם כפתור "למד רעש"
4. הוספת De-Hum אוטומטי
5. הוספת VAD עם חיווי ויזואלי
6. הוספת מד LUFS + נורמליזציה
7. שמירת כל ההגדרות בענן

