import { SHORTCUTS, type ShortcutDef } from '@/hooks/useKeyboardShortcuts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Keyboard } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryLabels: Record<string, string> = {
  general: 'כללי',
  audio: 'נגן אודיו',
  transcription: 'תמלול',
  editing: 'עריכה',
};

function KeyBadge({ text }: { text: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-md border bg-muted text-xs font-mono font-medium shadow-sm">
      {text}
    </kbd>
  );
}

function ShortcutRow({ shortcut }: { shortcut: ShortcutDef }) {
  const keys: string[] = [];
  if (shortcut.ctrl) keys.push('Ctrl');
  if (shortcut.shift) keys.push('Shift');
  if (shortcut.alt) keys.push('Alt');
  keys.push(shortcut.key);

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
      <span className="text-sm text-foreground">{shortcut.descriptionHe}</span>
      <div className="flex items-center gap-1 mr-4" dir="ltr">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
            <KeyBadge text={k} />
          </span>
        ))}
      </div>
    </div>
  );
}

export const KeyboardShortcutsDialog = ({ open, onOpenChange }: Props) => {
  const grouped = SHORTCUTS.reduce<Record<string, ShortcutDef[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            קיצורי מקלדת
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {Object.entries(grouped).map(([category, shortcuts]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs">
                  {categoryLabels[category] || category}
                </Badge>
              </div>
              <div className="space-y-0.5">
                {shortcuts.map((s, i) => (
                  <ShortcutRow key={i} shortcut={s} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          לחץ <KeyBadge text="?" /> לפתיחת/סגירת חלון זה
        </p>
      </DialogContent>
    </Dialog>
  );
};
