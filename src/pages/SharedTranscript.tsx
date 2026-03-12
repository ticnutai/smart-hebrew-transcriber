import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Loader2, FileText, Calendar, Cpu } from "lucide-react";
import { useShareLink } from "@/hooks/useShareLink";

interface SharedData {
  text: string;
  engine: string;
  created_at: string;
  title: string | null;
}

const SharedTranscript = () => {
  const { token } = useParams<{ token: string }>();
  const { getSharedTranscript } = useShareLink();
  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    getSharedTranscript(token).then(result => {
      if (result) setData(result);
      else setNotFound(true);
      setLoading(false);
    });
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen" dir="rtl">
        <Card className="p-8 max-w-md text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-xl font-bold mb-2">תמלול לא נמצא</h1>
          <p className="text-muted-foreground">הקישור אינו תקף או שפג תוקפו</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-4">{data.title || 'תמלול משותף'}</h1>
          <div className="flex gap-4 text-sm text-muted-foreground mb-6">
            <span className="flex items-center gap-1">
              <Cpu className="w-4 h-4" />
              {data.engine}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {new Date(data.created_at).toLocaleDateString('he-IL')}
            </span>
          </div>
          <div className="whitespace-pre-wrap leading-relaxed text-lg border-t pt-4">
            {data.text}
          </div>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-4">
          נוצר עם מערכת התמלול החכם
        </p>
      </div>
    </div>
  );
};

export default SharedTranscript;
