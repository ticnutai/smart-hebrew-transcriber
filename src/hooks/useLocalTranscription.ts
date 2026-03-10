import { useState } from 'react';
import { pipeline, env } from '@huggingface/transformers';
import { toast } from '@/hooks/use-toast';

// Configure transformers to use browser cache
env.allowLocalModels = false;
env.useBrowserCache = true;

// Check if WebGPU is available (not supported on most mobile browsers)
const isWebGPUAvailable = async (): Promise<boolean> => {
  try {
    const nav = navigator as any;
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
};

// Get preferred model from localStorage or default to tiny
const getPreferredModel = () => {
  const downloaded = localStorage.getItem('downloaded_models');
  if (downloaded) {
    const models = JSON.parse(downloaded);
    if (models.length > 0) {
      return models[0];
    }
  }
  return "onnx-community/whisper-tiny";
};

export const useLocalTranscription = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const transcribe = async (file: File): Promise<string> => {
    setIsLoading(true);
    setProgress(0);

    try {
      const modelId = getPreferredModel();
      const useGPU = await isWebGPUAvailable();
      
      toast({
        title: "מוריד מודל...",
        description: useGPU 
          ? `הורדת מודל ${modelId.split('/')[1]} (WebGPU). בפעם הבאה יהיה מהיר יותר!`
          : `הורדת מודל ${modelId.split('/')[1]} (WASM - מצב תואם נייד). בפעם הבאה יהיה מהיר יותר!`,
      });

      setProgress(20);

      // Create ASR pipeline - use WebGPU if available, fallback to WASM for mobile
      const transcriber = await pipeline(
        'automatic-speech-recognition',
        modelId,
        { 
          device: useGPU ? 'webgpu' : 'wasm',
          dtype: useGPU ? 'fp32' : 'q8',
          progress_callback: (progress: any) => {
            if (progress.status === 'progress') {
              const percent = Math.round((progress.loaded / progress.total) * 100);
              setProgress(Math.min(percent, 80));
            }
          }
        }
      );

      setProgress(85);

      toast({
        title: "מתמלל...",
        description: useGPU ? "מעבד עם WebGPU" : "מעבד עם WASM (תואם נייד)",
      });

      // Convert file to URL for processing
      const audioUrl = URL.createObjectURL(file);
      
      // Transcribe with Hebrew language
      const result = await transcriber(audioUrl, {
        language: 'hebrew',
        task: 'transcribe',
      });

      // Clean up URL
      URL.revokeObjectURL(audioUrl);

      setProgress(100);

      // Handle result - can be array or single object
      const text = Array.isArray(result) ? result[0]?.text : result?.text;
      
      if (!text) {
        throw new Error('לא התקבל תמלול מהמודל');
      }

      return text;
    } catch (error) {
      console.error('Error in local transcription:', error);
      
      if (error instanceof Error && (error.message.includes('WebGPU') || error.message.includes('wasm'))) {
        throw new Error('שגיאה בטעינת המנוע המקומי. נסה דפדפן עדכני יותר או השתמש במנוע אונליין.');
      }
      
      throw new Error(error instanceof Error ? error.message : 'שגיאה בתמלול מקומי');
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  return { transcribe, isLoading, progress };
};
