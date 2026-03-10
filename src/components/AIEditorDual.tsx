import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wand2, Loader2, Sparkles, MessageSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface AIEditorDualProps {
  text: string;
  onTextChange: (text: string, source: string, customPrompt?: string) => void;
}

type AIModel = 'gemini-flash' | 'gemini-pro' | 'gemini-flash-lite' | 'gpt-5' | 'gpt-5-mini' | 'gpt-5-nano';
type EditAction = 'improve' | 'sources' | 'readable' | 'summarize' | 'translate' | 'custom';

const modelToApiId = (model: AIModel): string => {
  const map: Record<AIModel, string> = {
    'gemini-flash': 'google/gemini-2.5-flash',
    'gemini-pro': 'google/gemini-2.5-pro',
    'gemini-flash-lite': 'google/gemini-2.5-flash-lite',
    'gpt-5': 'openai/gpt-5',
    'gpt-5-mini': 'openai/gpt-5-mini',
    'gpt-5-nano': 'openai/gpt-5-nano',
  };
  return map[model] || 'google/gemini-2.5-flash';
};

const modelDisplayName = (model: AIModel): string => {
  const map: Record<AIModel, string> = {
    'gemini-flash': 'Gemini Flash',
    'gemini-pro': 'Gemini Pro',
    'gemini-flash-lite': 'Gemini Flash Lite',
    'gpt-5': 'GPT-5',
    'gpt-5-mini': 'GPT-5 Mini',
    'gpt-5-nano': 'GPT-5 Nano',
  };
  return map[model] || model;
};

export const AIEditorDual = ({ text, onTextChange }: AIEditorDualProps) => {
  const [isEditing1, setIsEditing1] = useState(false);
  const [isEditing2, setIsEditing2] = useState(false);
  const [model1, setModel1] = useState<AIModel>('gemini-flash');
  const [model2, setModel2] = useState<AIModel>('gemini-pro');
  const [result1, setResult1] = useState("");
  const [result2, setResult2] = useState("");
  const [customPrompt1, setCustomPrompt1] = useState("");
  const [customPrompt2, setCustomPrompt2] = useState("");
  const [showDialog1, setShowDialog1] = useState(false);
  const [showDialog2, setShowDialog2] = useState(false);

  const handleEdit = async (
    action: EditAction, 
    model: AIModel, 
    setLoading: (v: boolean) => void, 
    setResult: (v: string) => void,
    customPrompt?: string
  ) => {
    if (!text.trim()) {
      toast({
        title: "שגיאה",
        description: "אין טקסט לעריכה",
        variant: "destructive",
      });
      return;
    }

    if (action === 'custom' && !customPrompt?.trim()) {
      toast({
        title: "שגיאה",
        description: "יש להזין פרומפט מותאם",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('edit-transcript', {
        body: { 
          text, 
          action,
          customPrompt: action === 'custom' ? customPrompt : undefined,
          model: modelToApiId(model)
        }
      });

      if (error) throw error;

      if (data?.text) {
        setResult(data.text);
        toast({
          title: "הצלחה",
          description: `עריכה עם ${modelDisplayName(model)} הושלמה`,
        });
      }
    } catch (error) {
      console.error('Error editing:', error);
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בעריכה",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCustomEdit = (engineNum: 1 | 2) => {
    if (engineNum === 1) {
      handleEdit('custom', model1, setIsEditing1, setResult1, customPrompt1);
      setShowDialog1(false);
    } else {
      handleEdit('custom', model2, setIsEditing2, setResult2, customPrompt2);
      setShowDialog2(false);
    }
  };

  return (
    <Card className="p-6" dir="rtl">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold text-right">עריכה עם שני מנועי AI</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* מנוע 1 */}
        <div className="space-y-3 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">מנוע 1</Label>
            <Select value={model1} onValueChange={(v) => setModel1(v as AIModel)}>
              <SelectTrigger className="w-[140px] text-xs" dir="rtl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="gemini-flash">Gemini Flash</SelectItem>
                <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleEdit('improve', model1, setIsEditing1, setResult1)}
              disabled={isEditing1}
            >
              {isEditing1 ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              <span className="mr-1 text-xs">שפר</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleEdit('sources', model1, setIsEditing1, setResult1)}
              disabled={isEditing1}
            >
              מקורות
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleEdit('readable', model1, setIsEditing1, setResult1)}
              disabled={isEditing1}
            >
              זורם
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleEdit('summarize', model1, setIsEditing1, setResult1)}
              disabled={isEditing1}
            >
              סכם
            </Button>
            <Dialog open={showDialog1} onOpenChange={setShowDialog1}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="sm" disabled={isEditing1}>
                  <MessageSquare className="w-3 h-3 ml-1" />
                  פרומפט מותאם
                </Button>
              </DialogTrigger>
              <DialogContent dir="rtl">
                <DialogHeader>
                  <DialogTitle>פרומפט מותאם - מנוע 1</DialogTitle>
                </DialogHeader>
                <Textarea
                  value={customPrompt1}
                  onChange={(e) => setCustomPrompt1(e.target.value)}
                  placeholder="הזן את ההוראות שלך למנוע ה-AI..."
                  className="min-h-[100px] text-right"
                  dir="rtl"
                />
                <Button onClick={() => handleCustomEdit(1)} disabled={isEditing1}>
                  {isEditing1 ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                  בצע עריכה
                </Button>
              </DialogContent>
            </Dialog>
          </div>

          {result1 && (
            <>
              <Textarea
                value={result1}
                readOnly
                className="min-h-[200px] text-right bg-accent/10"
                dir="rtl"
                style={{
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  color: 'inherit',
                  lineHeight: 'inherit',
                }}
              />
              <Button
                size="sm"
                onClick={() => onTextChange(result1, 'ai-improve', `${model1} result`)}
                className="w-full"
              >
                החלף בטקסט הראשי
              </Button>
            </>
          )}
        </div>

        {/* מנוע 2 */}
        <div className="space-y-3 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">מנוע 2</Label>
            <Select value={model2} onValueChange={(v) => setModel2(v as AIModel)}>
              <SelectTrigger className="w-[140px] text-xs" dir="rtl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="gemini-flash">Gemini Flash</SelectItem>
                <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleEdit('improve', model2, setIsEditing2, setResult2)}
              disabled={isEditing2}
            >
              {isEditing2 ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              <span className="mr-1 text-xs">שפר</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleEdit('sources', model2, setIsEditing2, setResult2)}
              disabled={isEditing2}
            >
              מקורות
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleEdit('readable', model2, setIsEditing2, setResult2)}
              disabled={isEditing2}
            >
              זורם
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleEdit('summarize', model2, setIsEditing2, setResult2)}
              disabled={isEditing2}
            >
              סכם
            </Button>
            <Dialog open={showDialog2} onOpenChange={setShowDialog2}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="sm" disabled={isEditing2}>
                  <MessageSquare className="w-3 h-3 ml-1" />
                  פרומפט מותאם
                </Button>
              </DialogTrigger>
              <DialogContent dir="rtl">
                <DialogHeader>
                  <DialogTitle>פרומפט מותאם - מנוע 2</DialogTitle>
                </DialogHeader>
                <Textarea
                  value={customPrompt2}
                  onChange={(e) => setCustomPrompt2(e.target.value)}
                  placeholder="הזן את ההוראות שלך למנוע ה-AI..."
                  className="min-h-[100px] text-right"
                  dir="rtl"
                />
                <Button onClick={() => handleCustomEdit(2)} disabled={isEditing2}>
                  {isEditing2 ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                  בצע עריכה
                </Button>
              </DialogContent>
            </Dialog>
          </div>

          {result2 && (
            <>
              <Textarea
                value={result2}
                readOnly
                className="min-h-[200px] text-right bg-accent/10"
                dir="rtl"
                style={{
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  color: 'inherit',
                  lineHeight: 'inherit',
                }}
              />
              <Button
                size="sm"
                onClick={() => onTextChange(result2, 'ai-improve', `${model2} result`)}
                className="w-full"
              >
                החלף בטקסט הראשי
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-right border-t pt-3">
        השווה בין שני מנועי AI שונים כדי לקבל את התוצאה הטובה ביותר
      </p>
    </Card>
  );
};
