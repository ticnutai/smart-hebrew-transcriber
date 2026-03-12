import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, Upload, Edit, ArrowLeft, ArrowRight, Sparkles, Check, Cpu, Cloud, Globe } from "lucide-react";

interface OnboardingWizardProps {
  onComplete: () => void;
}

const steps = [
  {
    title: "ברוך הבא למתמלל החכם! 🎙️",
    description: "מערכת תמלול מתקדמת עם 7 מנועים, עורך טקסט חכם, ונגן מסונכרן",
    icon: Sparkles,
    content: (
      <div className="space-y-4 text-right">
        <p className="text-muted-foreground">בשלושה צעדים פשוטים תתחיל לתמלל:</p>
        <div className="grid gap-3">
          <div className="flex items-center gap-3 flex-row-reverse p-3 bg-primary/5 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
            <span>בחר מנוע תמלול</span>
          </div>
          <div className="flex items-center gap-3 flex-row-reverse p-3 bg-primary/5 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">2</div>
            <span>העלה קובץ אודיו או הקלט</span>
          </div>
          <div className="flex items-center gap-3 flex-row-reverse p-3 bg-primary/5 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">3</div>
            <span>ערוך את הטקסט עם AI</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "בחר מנוע תמלול",
    description: "יש לנו 7 מנועים — כל אחד עם יתרונות",
    icon: Cpu,
    content: (
      <div className="space-y-3 text-right">
        <div className="space-y-2">
          <h4 className="font-semibold flex items-center gap-2 flex-row-reverse">
            <Cloud className="w-4 h-4" /> מנועי ענן (צריך מפתח API)
          </h4>
          <div className="grid gap-2 pr-6">
            <div className="flex items-center gap-2 flex-row-reverse">
              <Badge variant="outline">Groq</Badge>
              <span className="text-sm text-muted-foreground">⚡ הכי מהיר — מומלץ להתחלה</span>
            </div>
            <div className="flex items-center gap-2 flex-row-reverse">
              <Badge variant="outline">OpenAI</Badge>
              <span className="text-sm text-muted-foreground">🎯 הכי מדויק</span>
            </div>
            <div className="flex items-center gap-2 flex-row-reverse">
              <Badge variant="outline">Google</Badge>
              <span className="text-sm text-muted-foreground">🌍 תמיכה ב-125 שפות</span>
            </div>
            <div className="flex items-center gap-2 flex-row-reverse">
              <Badge variant="outline">AssemblyAI</Badge>
              <span className="text-sm text-muted-foreground">🗣️ זיהוי דוברים</span>
            </div>
            <div className="flex items-center gap-2 flex-row-reverse">
              <Badge variant="outline">Deepgram</Badge>
              <span className="text-sm text-muted-foreground">📡 streaming בזמן אמת</span>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold flex items-center gap-2 flex-row-reverse">
            <Cpu className="w-4 h-4" /> מנועים מקומיים (בלי אינטרנט!)
          </h4>
          <div className="grid gap-2 pr-6">
            <div className="flex items-center gap-2 flex-row-reverse">
              <Badge variant="secondary">CUDA Server</Badge>
              <span className="text-sm text-muted-foreground">🚀 GPU — הכי מהיר ופרטי</span>
            </div>
            <div className="flex items-center gap-2 flex-row-reverse">
              <Badge variant="secondary">דפדפן</Badge>
              <span className="text-sm text-muted-foreground">🌐 עובד ישר בדפדפן</span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "העלה ותמלל",
    description: "גרור קובץ, הקלט, או הדבק קישור YouTube",
    icon: Upload,
    content: (
      <div className="space-y-4 text-right">
        <div className="grid gap-3">
          <div className="p-3 border rounded-lg space-y-1">
            <div className="flex items-center gap-2 flex-row-reverse font-medium">
              <Upload className="w-4 h-4" /> העלאת קובץ
            </div>
            <p className="text-sm text-muted-foreground">MP3, WAV, M4A, MP4, WebM — עד 25MB (כיווץ אוטומטי)</p>
          </div>
          <div className="p-3 border rounded-lg space-y-1">
            <div className="flex items-center gap-2 flex-row-reverse font-medium">
              <Mic className="w-4 h-4" /> הקלטה ישירה
            </div>
            <p className="text-sm text-muted-foreground">הקלט ישר מהמיקרופון ותמלל מיידית</p>
          </div>
          <div className="p-3 border rounded-lg space-y-1">
            <div className="flex items-center gap-2 flex-row-reverse font-medium">
              <Globe className="w-4 h-4" /> YouTube
            </div>
            <p className="text-sm text-muted-foreground">הדבק קישור YouTube — תמלול אוטומטי (צריך שרת CUDA)</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "ערוך עם AI",
    description: "עורך מתקדם עם 15+ פעולות AI",
    icon: Edit,
    content: (
      <div className="space-y-3 text-right">
        <p className="text-muted-foreground">אחרי התמלול, עובר אוטומטית לעורך הטקסט:</p>
        <div className="grid grid-cols-2 gap-2">
          {["שיפור ניסוח", "תיקון דקדוק", "הוספת פיסוק", "סיכום", "חלוקה לפסקאות", "זיהוי דוברים", "תרגום", "כותרות", "שינוי טון", "הרחבה / קיצור"].map(item => (
            <div key={item} className="flex items-center gap-1 flex-row-reverse text-sm">
              <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
        <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 mt-4">
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            ✨ נגן אודיו מסונכרן — מדגיש מילים בזמן אמת!
          </p>
        </div>
      </div>
    ),
  },
];

export const OnboardingWizard = ({ onComplete }: OnboardingWizardProps) => {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('onboarding_complete');
    if (!seen) setVisible(true);
  }, []);

  const handleComplete = () => {
    localStorage.setItem('onboarding_complete', '1');
    setVisible(false);
    onComplete();
  };

  const handleSkip = () => {
    localStorage.setItem('onboarding_complete', '1');
    setVisible(false);
    onComplete();
  };

  if (!visible) return null;

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" dir="rtl">
      <Card className="w-full max-w-lg mx-4 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Icon className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-xl">{current.title}</CardTitle>
          <CardDescription>{current.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {current.content}

          {/* Progress dots */}
          <div className="flex justify-center gap-2 pt-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center pt-2">
            <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
              דלג
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)}>
                  <ArrowRight className="w-4 h-4 ml-1" />
                  הקודם
                </Button>
              )}
              {isLast ? (
                <Button size="sm" onClick={handleComplete}>
                  <Sparkles className="w-4 h-4 ml-1" />
                  בוא נתחיל!
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStep(s => s + 1)}>
                  הבא
                  <ArrowLeft className="w-4 h-4 mr-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
