import { useEffect, useCallback, useState } from 'react';

export interface ShortcutDef {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  descriptionHe: string;
  category: 'general' | 'audio' | 'transcription' | 'editing';
}

export const SHORTCUTS: ShortcutDef[] = [
  // General
  { key: '/', ctrl: false, shift: false, description: 'Show keyboard shortcuts', descriptionHe: 'הצג קיצורי מקלדת', category: 'general' },
  { key: 'b', ctrl: true, shift: false, description: 'Toggle sidebar', descriptionHe: 'פתח/סגור סרגל צד', category: 'general' },

  // Audio Player (registered in SyncAudioPlayer — listed here for reference)
  { key: 'Space', ctrl: false, shift: false, description: 'Play / Pause audio', descriptionHe: 'נגן / השהה אודיו', category: 'audio' },
  { key: '←', ctrl: true, shift: false, description: 'Jump back 5 seconds', descriptionHe: 'קפוץ 5 שניות אחורה', category: 'audio' },
  { key: '→', ctrl: true, shift: false, description: 'Jump forward 5 seconds', descriptionHe: 'קפוץ 5 שניות קדימה', category: 'audio' },
  { key: '←', ctrl: false, shift: true, description: 'Next word (RTL)', descriptionHe: 'מילה הבאה', category: 'audio' },
  { key: '→', ctrl: false, shift: true, description: 'Previous word (RTL)', descriptionHe: 'מילה קודמת', category: 'audio' },
  { key: 'M', ctrl: false, shift: false, description: 'Mute / Unmute', descriptionHe: 'השתק / בטל השתקה', category: 'audio' },

  // Transcription
  { key: 'c', ctrl: true, shift: true, description: 'Copy transcript', descriptionHe: 'העתק תמלול', category: 'transcription' },
  { key: 'Escape', ctrl: false, shift: false, description: 'Cancel transcription', descriptionHe: 'בטל תמלול', category: 'transcription' },

  // Editing
  { key: 'f', ctrl: true, shift: false, description: 'Search in transcript', descriptionHe: 'חיפוש בתמלול', category: 'editing' },
];

type ShortcutAction = 'show-shortcuts' | 'copy-transcript' | 'cancel-transcription' | 'search-transcript';

type ShortcutHandler = (action: ShortcutAction) => void;

export const useKeyboardShortcuts = (handler?: ShortcutHandler) => {
  const [showHelp, setShowHelp] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Skip if typing in input/textarea/contenteditable
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
      // Allow Ctrl+Shift+C and Escape even in inputs
      if (!(e.ctrlKey && e.shiftKey && e.code === 'KeyC') && e.code !== 'Escape') {
        return;
      }
    }

    // ? or / — Show shortcuts help
    if ((e.key === '?' || e.key === '/') && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setShowHelp(prev => !prev);
      handler?.('show-shortcuts');
      return;
    }

    // Ctrl+Shift+C — Copy transcript
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
      e.preventDefault();
      handler?.('copy-transcript');
      return;
    }

    // Escape — Cancel transcription
    if (e.code === 'Escape' && !e.ctrlKey && !e.shiftKey) {
      handler?.('cancel-transcription');
      return;
    }

    // Ctrl+F — Search in transcript (we capture it for our own search)
    if (e.ctrlKey && !e.shiftKey && e.code === 'KeyF') {
      e.preventDefault();
      handler?.('search-transcript');
      return;
    }
  }, [handler]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { showHelp, setShowHelp };
};
