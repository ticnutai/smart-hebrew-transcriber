import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { SpeakerDiarization } from "@/components/SpeakerDiarization";
import { db } from "@/lib/localDb";

const Diarization = () => {
  const location = useLocation();
  const stateText = location.state?.text as string | undefined;

  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioName, setAudioName] = useState<string>("");

  // Recover audio blob from Dexie (same mechanism as TextEditor)
  useEffect(() => {
    (async () => {
      try {
        const entry = await db.audioBlobs.get("last_audio");
        if (entry?.blob) {
          setAudioBlob(entry.blob);
          setAudioName(entry.name || "audio.webm");
        }
      } catch {
        /* Dexie not available */
      }
    })();
  }, []);

  return (
    <div className="container max-w-4xl mx-auto py-6 px-4" dir="rtl">
      <SpeakerDiarization
        initialAudioBlob={audioBlob}
        initialAudioName={audioName}
        initialText={stateText || localStorage.getItem("current_editing_text") || undefined}
      />
    </div>
  );
};

export default Diarization;
