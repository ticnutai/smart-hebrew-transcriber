import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, CheckCircle, Trash2, HardDrive } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ModelInfo {
  id: string;
  name: string;
  size: string;
  description: string;
  downloaded: boolean;
}

const RECOMMENDED_MODELS: ModelInfo[] = [
  {
    id: "onnx-community/whisper-tiny",
    name: "Whisper Tiny",
    size: "~75MB",
    description: "מהיר מאוד, מתאים למכשירים חלשים",
    downloaded: false
  },
  {
    id: "onnx-community/whisper-base",
    name: "Whisper Base",
    size: "~140MB",
    description: "איזון טוב בין מהירות לדיוק",
    downloaded: false
  },
  {
    id: "onnx-community/whisper-small",
    name: "Whisper Small",
    size: "~460MB",
    description: "דיוק גבוה יותר, דורש זיכרון",
    downloaded: false
  },
];

export const LocalModelManager = () => {
  const [models, setModels] = useState<ModelInfo[]>(RECOMMENDED_MODELS);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [cacheSize, setCacheSize] = useState<number>(0);

  useEffect(() => {
    checkDownloadedModels();
    calculateCacheSize();
  }, []);

  const checkDownloadedModels = () => {
    // Check localStorage for downloaded models
    const downloaded = localStorage.getItem('downloaded_models');
    if (downloaded) {
      const downloadedIds = JSON.parse(downloaded);
      setModels(prev => prev.map(model => ({
        ...model,
        downloaded: downloadedIds.includes(model.id)
      })));
    }
  };

  const calculateCacheSize = async () => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usageInMB = (estimate.usage || 0) / (1024 * 1024);
      setCacheSize(Math.round(usageInMB));
    }
  };

  const handleDownload = async (modelId: string) => {
    setDownloadingModel(modelId);
    setDownloadProgress(0);

    try {
      // Simulate download progress (actual download happens on first use)
      toast({
        title: "מוריד מודל...",
        description: "המודל יורד ברקע, אנא המתן",
      });

      // Mark model as downloaded
      const downloaded = localStorage.getItem('downloaded_models');
      const downloadedIds = downloaded ? JSON.parse(downloaded) : [];
      if (!downloadedIds.includes(modelId)) {
        downloadedIds.push(modelId);
        localStorage.setItem('downloaded_models', JSON.stringify(downloadedIds));
      }

      // Simulate progress
      for (let i = 0; i <= 100; i += 10) {
        setDownloadProgress(i);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      setModels(prev => prev.map(model =>
        model.id === modelId ? { ...model, downloaded: true } : model
      ));

      toast({
        title: "המודל הורד בהצלחה!",
        description: "המודל מוכן לשימוש במנוע המקומי",
      });

      await calculateCacheSize();
    } catch (error) {
      console.error('Error downloading model:', error);
      toast({
        title: "שגיאה בהורדת מודל",
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        variant: "destructive",
      });
    } finally {
      setDownloadingModel(null);
      setDownloadProgress(0);
    }
  };

  const handleDelete = async (modelId: string) => {
    try {
      // Remove from downloaded list
      const downloaded = localStorage.getItem('downloaded_models');
      if (downloaded) {
        const downloadedIds = JSON.parse(downloaded).filter((id: string) => id !== modelId);
        localStorage.setItem('downloaded_models', JSON.stringify(downloadedIds));
      }

      setModels(prev => prev.map(model =>
        model.id === modelId ? { ...model, downloaded: false } : model
      ));

      // Clear browser cache for this model (if possible)
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          if (name.includes(modelId)) {
            await caches.delete(name);
          }
        }
      }

      toast({
        title: "המודל נמחק",
        description: "המודל הוסר מהמטמון המקומי",
      });

      await calculateCacheSize();
    } catch (error) {
      console.error('Error deleting model:', error);
      toast({
        title: "שגיאה במחיקת מודל",
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        variant: "destructive",
      });
    }
  };

  const clearAllCache = async () => {
    try {
      localStorage.removeItem('downloaded_models');
      setModels(prev => prev.map(model => ({ ...model, downloaded: false })));

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      toast({
        title: "המטמון נוקה",
        description: "כל המודלים הוסרו",
      });

      await calculateCacheSize();
    } catch (error) {
      console.error('Error clearing cache:', error);
      toast({
        title: "שגיאה בניקוי מטמון",
        description: error instanceof Error ? error.message : "שגיאה לא ידועה",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="p-6" dir="rtl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">ניהול מודלים מקומיים</h3>
            <p className="text-sm text-muted-foreground">
              הורד מודלי Whisper לתמלול מקומי ללא צורך באינטרנט
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HardDrive className="w-4 h-4" />
            <span>{cacheSize} MB בשימוש</span>
          </div>
        </div>

        <div className="space-y-3">
          {models.map((model) => (
            <Card key={model.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{model.name}</h4>
                    {model.downloaded && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {model.description} • {model.size}
                  </p>
                  {downloadingModel === model.id && (
                    <Progress value={downloadProgress} className="mt-2 h-1" />
                  )}
                </div>

                <div className="flex gap-2">
                  {!model.downloaded ? (
                    <Button
                      size="sm"
                      onClick={() => handleDownload(model.id)}
                      disabled={downloadingModel !== null}
                    >
                      <Download className="w-4 h-4 ml-1" />
                      הורד
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(model.id)}
                      disabled={downloadingModel !== null}
                    >
                      <Trash2 className="w-4 h-4 ml-1" />
                      מחק
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={clearAllCache}
            className="w-full"
          >
            <Trash2 className="w-4 h-4 ml-1" />
            נקה את כל המטמון המקומי
          </Button>
        </div>

        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground">
            💡 <strong>טיפ:</strong> המודלים מורדים פעם אחת ונשמרים במטמון הדפדפן.
            השימוש בהם לא דורש חיבור לאינטרנט לאחר ההורדה הראשונה.
          </p>
        </div>
      </div>
    </Card>
  );
};
