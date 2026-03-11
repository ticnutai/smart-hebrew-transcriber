# 🚀 מדריך הרצת מיגרציות - פשוט כמו משחק!

## 📖 מה זה בכלל מיגרציה?

דמיין שיש לך קופסת לגו ענקית (הדאטהבייס שלך).
**מיגרציה** = הוראות איך להוסיף חלקים חדשים לקופסה.

במקום להוסיף ידנית כל חלק, אתה נותן למחשב דף הוראות והוא עושה הכל בשבילך!

---

## 🛠️ הכלי שלנו: direct-run.mjs

זה כמו שלט רחוק למכונית - לוחצים כפתור והמכונית נוסעת!

### 📍 איפה הכלי נמצא?
```
ncrm/scripts/direct-run.mjs
```

---

## 🎮 איך להשתמש - צעד אחר צעד

### שלב 1: פתח את הטרמינל ב-VS Code
לחץ על: **Ctrl + `** (הכפתור מתחת ל-Esc)

### שלב 2: עבור לתיקיית הפרויקט
העתק והדבק את השורה הזו:
```powershell
cd "c:\Users\jj121\OneDrive - College Of Law And Business\שולחן העבודה\חילצו\ncrm"
```
לחץ **Enter**

### שלב 3: הרץ את הפקודה שאתה צריך

---

## 📋 כל הפקודות שאפשר להשתמש

### 1️⃣ להריץ קובץ SQL (הכי נפוץ!)

**מתי משתמשים?** כשיש לך קובץ עם הוראות SQL

**הפקודה:**
```powershell
node scripts/direct-run.mjs file "הנתיב-לקובץ"
```

**דוגמה אמיתית:**
```powershell
node scripts/direct-run.mjs file "supabase/migrations/IMPORT_1_clients.sql"
```

**מה יקרה:**
```
══════════════════════════════════════════════════
   🔧 Direct Migration Runner
══════════════════════════════════════════════════   
🔐 Logging in as admin...
✅ Logged in as: jj1212t@gmail.com

🚀 Running migration: IMPORT_1_clients
──────────────────────────────────────────────────   
✅ Migration completed successfully!   ← זה מה שאתה רוצה לראות!

🏁 Done!
```

---

### 2️⃣ להריץ SQL ישירות (בלי קובץ)

**מתי משתמשים?** כשרוצים לעשות משהו קטן ומהיר

**הפקודה:**
```powershell
node scripts/direct-run.mjs sql "הפקודה-שלך"
```

**דוגמאות:**

לספור כמה לקוחות יש:
```powershell
node scripts/direct-run.mjs sql "SELECT COUNT(*) FROM clients"
```

לראות 5 לקוחות אחרונים:
```powershell
node scripts/direct-run.mjs sql "SELECT name FROM clients LIMIT 5"
```

למחוק לקוחות לדוגמה:
```powershell
node scripts/direct-run.mjs sql "DELETE FROM clients WHERE is_sample = true"
```

---

### 3️⃣ להריץ מיגרציות ממתינות

**מתי משתמשים?** כשיש מיגרציות שמחכות ברשימה

**הפקודה:**
```powershell
node scripts/direct-run.mjs pending
```

---

## 🎯 דוגמאות מהחיים האמיתיים

### רוצה לייבא לקוחות מגיבוי?

**שלב 1:** צור את קובץ ה-SQL
```powershell
node scripts/generate-import-sql.mjs
```

**שלב 2:** הרץ את הייבוא
```powershell
node scripts/direct-run.mjs file "supabase/migrations/IMPORT_1_clients.sql"
```

**שלב 3:** הרץ את רישומי הזמן
```powershell
node scripts/direct-run.mjs file "supabase/migrations/IMPORT_2_time_entries.sql"
```

---

### רוצה לבדוק שהייבוא עבד?

```powershell
node scripts/direct-run.mjs sql "SELECT COUNT(*) as total_clients FROM clients"
```

```powershell
node scripts/direct-run.mjs sql "SELECT COUNT(*) as total_time_entries FROM time_entries"
```

---

## ⚠️ מה לעשות כשיש שגיאה?

### שגיאה: "Login failed"
**הבעיה:** הסיסמה או המייל לא נכונים
**הפתרון:** בדוק בקובץ `scripts/direct-run.mjs` שהפרטים נכונים

### שגיאה: "syntax error"
**הבעיה:** יש טעות ב-SQL
**הפתרון:** בדוק את הקובץ SQL - אולי יש גרש או סוגר חסר

### שגיאה: "Migration failed"
**הבעיה:** משהו בהוראות לא עבד
**הפתרון:** קרא את הודעת השגיאה - היא אומרת בדיוק מה הבעיה

---

## 📁 איפה שומרים קבצי SQL?

שים את הקבצים בתיקייה:
```
ncrm/supabase/migrations/
```

**שמות מומלצים:**
- `IMPORT_1_clients.sql` - ייבוא לקוחות
- `IMPORT_2_time_entries.sql` - ייבוא רישומי זמן
- `FIX_something.sql` - תיקון משהו
- `ADD_new_feature.sql` - הוספת פיצ'ר

---

## 🔄 תרשים זרימה פשוט

```
┌─────────────────┐
│  יש לי קובץ SQL │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│  node scripts/direct-run.mjs file "הנתיב"       │
└────────┬────────────────────────────────────────┘
         │
         ▼
    ┌────┴────┐
    │ הצליח?  │
    └────┬────┘
    כן/  \לא
      /    \
     ▼      ▼
   🎉     🔍 בדוק
  סיים!   את השגיאה
```

---

## 💡 טיפים של מקצוען

1. **תמיד תעשה גיבוי לפני שינויים גדולים**
   
2. **תתחיל עם קבצים קטנים** - קודם תבדוק על 10 רשומות, אחר כך על הכל

3. **תקרא את הודעות השגיאה** - הן ממש עוזרות!

4. **אל תפחד לנסות** - הכי גרוע שיקרה זה שגיאה, ואז פשוט מתקנים

---

## 📞 עזרה נוספת

אם משהו לא עובד:
1. קרא את הודעת השגיאה
2. חפש בגוגל את הודעת השגיאה
3. בקש עזרה מ-Copilot!

---

## 🎓 סיכום - 3 דברים לזכור

| מה רוצים | הפקודה |
|----------|--------|
| להריץ קובץ SQL | `node scripts/direct-run.mjs file "נתיב"` |
| להריץ SQL ישיר | `node scripts/direct-run.mjs sql "פקודה"` |
| להריץ ממתינות | `node scripts/direct-run.mjs pending` |

---

**🌟 מזל טוב! עכשיו אתה יודע להריץ מיגרציות!**
