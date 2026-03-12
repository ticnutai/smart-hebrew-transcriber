import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Share2, MessageCircle, Mail, Link as LinkIcon, Globe, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useShareLink } from "@/hooks/useShareLink";

interface ShareTranscriptProps {
  transcript: string;
  transcriptId?: string;
}

export const ShareTranscript = ({ transcript, transcriptId }: ShareTranscriptProps) => {
  const { createShareLink, loading: linkLoading } = useShareLink();
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`תמלול:\n\n${transcript.substring(0, 1000)}...`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleEmail = () => {
    const subject = encodeURIComponent('תמלול מערכת התמלול');
    const body = encodeURIComponent(transcript);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleCopyLink = async () => {
    try {
      // Create a temporary URL with the transcript data
      const blob = new Blob([transcript], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      await navigator.clipboard.writeText(transcript);
      toast({
        title: "הועתק",
        description: "הטקסט הועתק ללוח. ניתן להדביק בכל מקום",
      });
      
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "שגיאה",
        description: "לא ניתן להעתיק",
        variant: "destructive",
      });
    }
  };

  if (!transcript.trim()) {
    return null;
  }

  return (
    <Card className="p-6" dir="rtl">
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold text-right">שתף תמלול</h2>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {transcriptId && (
          <Button
            variant="outline"
            onClick={async () => {
              const url = await createShareLink(transcriptId);
              if (url) {
                setShareUrl(url);
                await navigator.clipboard.writeText(url);
                toast({ title: "קישור שיתוף נוצר!", description: "הקישור הועתק ללוח" });
              } else {
                toast({ title: "שגיאה", description: "לא ניתן ליצור קישור", variant: "destructive" });
              }
            }}
            disabled={linkLoading}
            className="flex flex-col items-center gap-2 h-auto py-4"
          >
            {linkLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Globe className="w-6 h-6 text-teal-600" />}
            <span className="text-xs">קישור ציבורי</span>
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleWhatsApp}
          className="flex flex-col items-center gap-2 h-auto py-4"
        >
          <MessageCircle className="w-6 h-6 text-green-600" />
          <span className="text-xs">WhatsApp</span>
        </Button>

        <Button
          variant="outline"
          onClick={handleEmail}
          className="flex flex-col items-center gap-2 h-auto py-4"
        >
          <Mail className="w-6 h-6 text-blue-600" />
          <span className="text-xs">Email</span>
        </Button>

        <Button
          variant="outline"
          onClick={handleCopyLink}
          className="flex flex-col items-center gap-2 h-auto py-4"
        >
          <LinkIcon className="w-6 h-6 text-purple-600" />
          <span className="text-xs">העתק</span>
        </Button>
      </div>

      {shareUrl && (
        <div className="mt-3 p-2 bg-muted rounded text-xs break-all text-center" dir="ltr">
          {shareUrl}
        </div>
      )}
    </Card>
  );
};
