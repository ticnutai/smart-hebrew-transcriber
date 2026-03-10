

## תוכנית: אופטימיזציה - עיבוד מקבילי, חלוקה לצ'אנקים, וטעינה עצלה

### מצב קיים
- **BatchUploader**: מעבד קבצים אחד-אחד בלולאת for סדרתית
- **Index.tsx**: קובץ ענק (747 שורות) שטוען את כל הרכיבים מראש
- **process-transcription**: Edge function שמעבדת קובץ אחד בלבד
- **Groq API**: מגבלת 25MB לקובץ, ללא חלוקה לחלקים

### מה ישתנה

#### 1. עיבוד מקבילי ב-BatchUploader
- שינוי הלולאה הסדרתית ל-**pool של 3 עבודות במקביל** (configurable)
- כל קובץ נשלח במקביל עם הגבלת concurrency כדי לא לחרוג מ-rate limits
- קובץ: `src/components/BatchUploader.tsx`

#### 2. עיבוד מקבילי ב-Background Jobs
- כשמעלים מספר קבצים לתמלול ברקע, שליחת עד 3 jobs במקביל ל-edge function
- קובץ: `src/hooks/useTranscriptionJobs.ts` - הוספת `submitBatchJobs`

#### 3. חלוקת קבצים גדולים לצ'אנקים (Chunking)
- קבצים מעל 20MB יחולקו ל-chunks של 20MB בצד הלקוח לפני שליחה
- כל chunk יתומלל בנפרד והתוצאות יאוחדו
- רכיב חדש: `src/utils/audioChunker.ts` - לוגיקת חיתוך (שימוש ב-Blob.slice)
- עדכון Edge Functions לטפל ב-chunks

#### 4. טעינה עצלה (Lazy Loading) לעמודים ורכיבים כבדים
- עטיפת כל עמוד ב-`React.lazy` + `Suspense` ב-App.tsx
- רכיבים כבדים שלא נראים מיד (BatchUploader, CloudTranscriptHistory, TextComparison, FolderManager) יטענו ב-lazy
- קובץ: `src/App.tsx`, `src/pages/Index.tsx`

#### 5. שמירת מצב ביניים (Resume)
- כשתמלול ברקע נכשל או נעצר - שמירת ה-chunks שכבר הושלמו בטבלת `transcription_jobs` (שדה חדש `partial_result`)
- בניסיון חוזר - המשך מהצ'אנק שנכשל במקום להתחיל מחדש
- מיגרציה: הוספת עמודות `partial_result`, `total_chunks`, `completed_chunks` לטבלת `transcription_jobs`

### שינויים טכניים

| קובץ | שינוי |
|---|---|
| `src/App.tsx` | React.lazy לכל העמודים |
| `src/pages/Index.tsx` | lazy loading לרכיבים כבדים |
| `src/components/BatchUploader.tsx` | concurrency pool (3 מקבילי) |
| `src/utils/audioChunker.ts` | חדש - חלוקת קבצים גדולים |
| `src/hooks/useTranscriptionJobs.ts` | submitBatchJobs + resume logic |
| `supabase/functions/process-transcription/index.ts` | תמיכה ב-chunks + partial results |
| מיגרציה | הוספת עמודות partial_result, total_chunks, completed_chunks |

### מה לא ישתנה
- ה-Edge Functions הקיימות (transcribe-groq, transcribe-openai וכו') נשארות כמו שהן
- ה-UI הכללי לא משתנה
- תמלול רגיל (קובץ בודד) עובד בדיוק כמו קודם

### סיכונים ומניעה
- **Rate limiting**: ה-pool מוגבל ל-3 כדי לא לחרוג ממגבלות API
- **חיתוך אודיו**: Blob.slice לא מבטיח חיתוך "נקי" של אודיו, אבל רוב ה-APIs מתמודדות עם זה. אם יש בעיות - נצמצם ל-chunks גדולים יותר
- **Lazy loading**: הוספת Suspense fallback (spinner) למניעת מסך ריק

