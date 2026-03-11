import { useState, useRef, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, Square, Copy, Trash2, Radio } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface LiveTranscriberProps {
  onTranscriptComplete: (text: string) => void;
}

export const LiveTranscriber = ({ onTranscriptComplete }: LiveTranscriberProps) => {
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(false);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "לא נתמך", description: "הדפדפן שלך לא תומך בתמלול בזמן אמת. נסה Chrome.", variant: "destructive" });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "he-IL";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + " ";
        } else {
          interim += transcript;
        }
      }

      if (final) {
        setFinalText(prev => prev + final);
      }
      setInterimText(interim);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        toast({ title: "גישה למיקרופון נדחתה", description: "אנא אפשר גישה למיקרופון", variant: "destructive" });
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      // Auto-restart if still in listening mode
      if (recognitionRef.current && isListeningRef.current) {
        try {
          recognition.start();
        } catch {
          isListeningRef.current = false;
          setIsListening(false);
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    isListeningRef.current = true;
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText("");

    if (finalText.trim()) {
      onTranscriptComplete(finalText.trim());
    }
  }, [finalText, onTranscriptComplete]);

  const handleCopy = () => {
    navigator.clipboard.writeText(finalText);
    toast({ title: "הועתק ללוח" });
  };

  const handleClear = () => {
    setFinalText("");
    setInterimText("");
  };

  if (!isSupported) {
    return (
      <Card className="p-6" dir="rtl">
        <div className="text-center text-muted-foreground">
          <p>הדפדפן שלך לא תומך בתמלול בזמן אמת.</p>
          <p className="text-sm mt-1">נסה להשתמש ב-Google Chrome.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">תמלול בזמן אמת</h3>
          {isListening && (
            <Badge variant="destructive" className="animate-pulse text-xs gap-1">
              <span className="w-2 h-2 rounded-full bg-destructive-foreground" />
              מאזין
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {finalText && (
            <>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Live text display */}
      <ScrollArea className="h-[200px] mb-4 rounded-md border p-4 bg-muted/30">
        <div className="text-right whitespace-pre-wrap leading-relaxed">
          {finalText && <span>{finalText}</span>}
          {interimText && (
            <span className="text-muted-foreground opacity-60">{interimText}</span>
          )}
          {!finalText && !interimText && !isListening && (
            <p className="text-muted-foreground text-center">לחץ על הכפתור כדי להתחיל תמלול בזמן אמת</p>
          )}
          {!finalText && !interimText && isListening && (
            <p className="text-muted-foreground text-center animate-pulse">מחכה לדיבור...</p>
          )}
        </div>
      </ScrollArea>

      {/* Controls */}
      <div className="flex justify-center">
        {!isListening ? (
          <Button onClick={startListening} className="gap-2 rounded-full px-8">
            <Mic className="w-5 h-5" />
            התחל תמלול חי
          </Button>
        ) : (
          <Button onClick={stopListening} variant="destructive" className="gap-2 rounded-full px-8">
            <Square className="w-5 h-5" />
            עצור
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center mt-3">
        משתמש ב-Web Speech API – עובד ישירות בדפדפן, ללא מפתח API
      </p>
    </Card>
  );
};
