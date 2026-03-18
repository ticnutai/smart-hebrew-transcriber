import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Settings as SettingsIcon, ArrowRight, LogOut, Eye, EyeOff, Wrench, Cpu, Palette, Key, Download, Upload, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DevToolsPanel from "@/components/DevToolsPanel";
import { OllamaManager } from "@/components/OllamaManager";
import { ThemeManager } from "@/components/ThemeManager";
import { getApiKey, setEncryptedKey, setEncryptedPool, getApiKeyPool } from "@/lib/keyCrypto";
import { createBackup, downloadBackup, restoreBackup } from "@/utils/backupRestore";

const Settings = () => {
  const { isAuthenticated, logout, isLoading, isAdmin, user } = useAuth();
  const [showDevTools, setShowDevTools] = useState(false);
  const navigate = useNavigate();
  const [openaiKey, setOpenaiKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [openaiKeysPoolText, setOpenaiKeysPoolText] = useState("");
  const [googleKeysPoolText, setGoogleKeysPoolText] = useState("");
  const [groqKeysPoolText, setGroqKeysPoolText] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [assemblyaiKey, setAssemblyaiKey] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");
  const [assemblyaiKeysPoolText, setAssemblyaiKeysPoolText] = useState("");
  const [deepgramKeysPoolText, setDeepgramKeysPoolText] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGoogle, setShowGoogle] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [showClaude, setShowClaude] = useState(false);
  const [showAssemblyAI, setShowAssemblyAI] = useState(false);
  const [showDeepgram, setShowDeepgram] = useState(false);
  const [userIdentifier, setUserIdentifier] = useState("");
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    // Use authenticated user ID as identifier
    const identifier = user?.id || "";
    if (!identifier) return;
    setUserIdentifier(identifier);

    // Load from cloud
    loadKeysFromCloud(identifier);
  }, [isAuthenticated, isLoading, navigate, user]);

  const loadKeysFromCloud = async (identifier: string) => {
    try {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('user_identifier', identifier)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        console.error("Error loading keys from cloud:", error);
      }

      const loadPoolOrFallback = (poolStorageKey: string, fallback?: string, setter?: (v: string) => void) => {
        const pool = getApiKeyPool(poolStorageKey);
        if (pool.length > 0) {
          setter?.(pool.join("\n"));
          return;
        }
        if (fallback) setter?.(fallback);
      };

      if (data) {
        if (data.openai_key) setOpenaiKey(data.openai_key);
        if (data.google_key) setGoogleKey(data.google_key);
        if (data.groq_key) setGroqKey(data.groq_key);
        if (data.claude_key) setClaudeKey(data.claude_key);
        if (data.assemblyai_key) setAssemblyaiKey(data.assemblyai_key);
        if (data.deepgram_key) setDeepgramKey(data.deepgram_key);

        // Multi-key pools are local-only; cloud still stores one primary key per provider.
        loadPoolOrFallback("openai_api_keys_pool", data.openai_key ?? undefined, setOpenaiKeysPoolText);
        loadPoolOrFallback("google_api_keys_pool", data.google_key ?? undefined, setGoogleKeysPoolText);
        loadPoolOrFallback("groq_api_keys_pool", data.groq_key ?? undefined, setGroqKeysPoolText);
        loadPoolOrFallback("assemblyai_api_keys_pool", data.assemblyai_key ?? undefined, setAssemblyaiKeysPoolText);
        loadPoolOrFallback("deepgram_api_keys_pool", data.deepgram_key ?? undefined, setDeepgramKeysPoolText);
      } else {
        // Fallback to localStorage
        const savedOpenAI = getApiKey("openai_api_key");
        const savedGoogle = getApiKey("google_api_key");
        const savedGroq = getApiKey("groq_api_key");
        const savedClaude = getApiKey("claude_api_key");
        const savedAssemblyAI = getApiKey("assemblyai_api_key");
        const savedDeepgram = getApiKey("deepgram_api_key");
        
        if (savedOpenAI) setOpenaiKey(savedOpenAI);
        if (savedGoogle) setGoogleKey(savedGoogle);
        if (savedGroq) setGroqKey(savedGroq);
        if (savedClaude) setClaudeKey(savedClaude);
        if (savedAssemblyAI) setAssemblyaiKey(savedAssemblyAI);
        if (savedDeepgram) setDeepgramKey(savedDeepgram);

        loadPoolOrFallback("openai_api_keys_pool", savedOpenAI, setOpenaiKeysPoolText);
        loadPoolOrFallback("google_api_keys_pool", savedGoogle, setGoogleKeysPoolText);
        loadPoolOrFallback("groq_api_keys_pool", savedGroq, setGroqKeysPoolText);
        loadPoolOrFallback("assemblyai_api_keys_pool", savedAssemblyAI, setAssemblyaiKeysPoolText);
        loadPoolOrFallback("deepgram_api_keys_pool", savedDeepgram, setDeepgramKeysPoolText);
      }
    } catch (error) {
      console.error("Error loading keys:", error);
      toast.error("שגיאה בטעינת המפתחות");
    }
  };

  const handleSave = async () => {
    try {
      const toPool = (txt: string) => Array.from(new Set(txt.split(/\r?\n/).map((k) => k.trim()).filter(Boolean)));
      const openaiPool = toPool(openaiKeysPoolText);
      const googlePool = toPool(googleKeysPoolText);
      const groqPool = Array.from(
        new Set(
          groqKeysPoolText
            .split(/\r?\n/)
            .map((k) => k.trim())
            .filter(Boolean)
        )
      );
      const assemblyPool = toPool(assemblyaiKeysPoolText);
      const deepgramPool = toPool(deepgramKeysPoolText);

      const primaryOpenAI = openaiPool[0] || openaiKey.trim() || "";
      const primaryGoogle = googlePool[0] || googleKey.trim() || "";
      const primaryGroq = groqPool[0] || groqKey.trim() || "";
      const primaryAssembly = assemblyPool[0] || assemblyaiKey.trim() || "";
      const primaryDeepgram = deepgramPool[0] || deepgramKey.trim() || "";

      // Save to cloud (tied to user ID)
      const { error } = await supabase
        .from('user_api_keys')
        .upsert({
          user_identifier: userIdentifier,
          openai_key: primaryOpenAI || null,
          google_key: primaryGoogle || null,
          groq_key: primaryGroq || null,
          claude_key: claudeKey || null,
          assemblyai_key: primaryAssembly || null,
          deepgram_key: primaryDeepgram || null,
        }, {
          onConflict: 'user_identifier'
        });

      if (error) {
        console.error("Error saving to cloud:", error);
        toast.error("שגיאה בשמירת המפתחות בענן");
        return;
      }

      // Also save locally for quick access (encrypted)
      const savePromises: Promise<void>[] = [];
      if (primaryOpenAI) {
        savePromises.push(setEncryptedKey("openai_api_key", primaryOpenAI));
        savePromises.push(setEncryptedPool("openai_api_keys_pool", openaiPool));
      }
      if (primaryGoogle) {
        savePromises.push(setEncryptedKey("google_api_key", primaryGoogle));
        savePromises.push(setEncryptedPool("google_api_keys_pool", googlePool));
      }
      if (primaryGroq) {
        savePromises.push(setEncryptedKey("groq_api_key", primaryGroq));
        savePromises.push(setEncryptedPool("groq_api_keys_pool", groqPool));
      }
      if (claudeKey) savePromises.push(setEncryptedKey("claude_api_key", claudeKey));
      if (primaryAssembly) {
        savePromises.push(setEncryptedKey("assemblyai_api_key", primaryAssembly));
        savePromises.push(setEncryptedPool("assemblyai_api_keys_pool", assemblyPool));
      }
      if (primaryDeepgram) {
        savePromises.push(setEncryptedKey("deepgram_api_key", primaryDeepgram));
        savePromises.push(setEncryptedPool("deepgram_api_keys_pool", deepgramPool));
      }
      await Promise.all(savePromises);

      if (primaryOpenAI) setOpenaiKey(primaryOpenAI);
      if (primaryGoogle) setGoogleKey(primaryGoogle);
      if (primaryGroq) {
        setGroqKey(primaryGroq);
      }
      if (primaryAssembly) setAssemblyaiKey(primaryAssembly);
      if (primaryDeepgram) setDeepgramKey(primaryDeepgram);

      toast.success("המפתחות נשמרו בהצלחה בענן! ☁️");
    } catch (error) {
      console.error("Error saving keys:", error);
      toast.error("שגיאה בשמירת המפתחות");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleBack = () => {
    navigate("/");
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4" dir="rtl">
      <div className="max-w-2xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={handleBack}>
            <ArrowRight className="ml-2 h-4 w-4" />
            חזרה
          </Button>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant={showDevTools ? "default" : "outline"}
                onClick={() => setShowDevTools(!showDevTools)}
                className="gap-2"
              >
                <Wrench className="h-4 w-4" />
                כלי פיתוח
              </Button>
            )}
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="ml-2 h-4 w-4" />
              התנתק
            </Button>
          </div>
        </div>

        {showDevTools && isAdmin && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wrench className="w-6 h-6 text-accent" />
                <CardTitle className="text-2xl">כלי פיתוח</CardTitle>
              </div>
              <CardDescription>
                הרצת מיגרציות, דיבאג ולוגים מתקדמים
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DevToolsPanel />
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="api-keys" dir="rtl" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="api-keys" className="gap-2">
              <Key className="h-4 w-4" />
              מפתחות API
            </TabsTrigger>
            <TabsTrigger value="themes" className="gap-2">
              <Palette className="h-4 w-4" />
              ערכות נושא
            </TabsTrigger>
            <TabsTrigger value="backup" className="gap-2">
              <Download className="h-4 w-4" />
              גיבוי
            </TabsTrigger>
          </TabsList>

          <TabsContent value="themes">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Palette className="w-6 h-6 text-primary" />
                  <CardTitle className="text-2xl">ערכות נושא</CardTitle>
                </div>
                <CardDescription>
                  בחר ערכת נושא מובנית או צור ערכה אישית
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ThemeManager />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backup">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Download className="w-6 h-6 text-primary" />
                  <CardTitle className="text-2xl">גיבוי ושחזור</CardTitle>
                </div>
                <CardDescription>
                  ייצוא וייבוא של כל הנתונים שלך: תמלולים, אוצר מילים, כללי תיקון והגדרות
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <h3 className="font-semibold">ייצוא גיבוי</h3>
                  <p className="text-sm text-muted-foreground">הורד קובץ JSON עם כל הנתונים שלך</p>
                  <Button
                    onClick={async () => {
                      setIsBackingUp(true);
                      try {
                        const data = await createBackup();
                        downloadBackup(data);
                        toast.success(`גיבוי נוצר: ${data.transcripts.length} תמלולים, ${data.vocabulary.length} מילים, ${data.correctionRules.length} כללים`);
                      } catch (err) {
                        toast.error("שגיאה ביצירת גיבוי");
                        console.error(err);
                      } finally {
                        setIsBackingUp(false);
                      }
                    }}
                    disabled={isBackingUp}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {isBackingUp ? "יוצר גיבוי..." : "הורד גיבוי"}
                  </Button>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h3 className="font-semibold">שחזור מגיבוי</h3>
                  <p className="text-sm text-muted-foreground">ייבא נתונים מקובץ גיבוי. נתונים קיימים לא יימחקו — רק ייתווספו חדשים.</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".json";
                      input.onchange = async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        setIsRestoring(true);
                        try {
                          const result = await restoreBackup(file);
                          toast.success(`שחזור הושלם: ${result.transcripts} תמלולים, ${result.vocabulary} מילים, ${result.rules} כללים`);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "שגיאה בשחזור");
                          console.error(err);
                        } finally {
                          setIsRestoring(false);
                        }
                      };
                      input.click();
                    }}
                    disabled={isRestoring}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {isRestoring ? "משחזר..." : "ייבוא מגיבוי"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api-keys">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SettingsIcon className="w-6 h-6 text-primary" />
              <CardTitle className="text-2xl">הגדרות API</CardTitle>
            </div>
            <CardDescription>
              הכנס את מפתחות ה-API שלך לשירותי התמלול
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="openai">OpenAI API Key</Label>
              <div className="relative">
                <Input
                  id="openai"
                  type={showOpenai ? "text" : "password"}
                  placeholder="sk-..."
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  dir="ltr"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowOpenai(!showOpenai)}
                >
                  {showOpenai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                מפתח API עבור Whisper של OpenAI
              </p>

              <Label htmlFor="openai-pool" className="mt-2 block">OpenAI API Keys Pool (שורה לכל מפתח)</Label>
              <textarea
                id="openai-pool"
                rows={3}
                placeholder="sk-key-1&#10;sk-key-2"
                value={openaiKeysPoolText}
                onChange={(e) => setOpenaiKeysPoolText(e.target.value)}
                dir="ltr"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="groq">Groq API Key (מומלץ - מהיר מאוד!)</Label>
              <div className="relative">
                <Input
                  id="groq"
                  type={showGroq ? "text" : "password"}
                  placeholder="gsk_..."
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  dir="ltr"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowGroq(!showGroq)}
                >
                  {showGroq ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                מפתח API עבור Groq Whisper - מהיר במיוחד ואיכותי
              </p>

              <Label htmlFor="groq-pool" className="mt-2 block">Groq API Keys Pool (שורה לכל מפתח)</Label>
              <textarea
                id="groq-pool"
                rows={4}
                placeholder="gsk_key_1&#10;gsk_key_2&#10;gsk_key_3"
                value={groqKeysPoolText}
                onChange={(e) => setGroqKeysPoolText(e.target.value)}
                dir="ltr"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground text-right">
                כשהמפתח הראשון נכשל/מגיע למגבלה, המערכת תעבור אוטומטית למפתח הבא ותציג הודעה.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="google">Google Cloud API Key</Label>
              <div className="relative">
                <Input
                  id="google"
                  type={showGoogle ? "text" : "password"}
                  placeholder="AIza..."
                  value={googleKey}
                  onChange={(e) => setGoogleKey(e.target.value)}
                  dir="ltr"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowGoogle(!showGoogle)}
                >
                  {showGoogle ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                מפתח API עבור Google Speech-to-Text
              </p>

              <Label htmlFor="google-pool" className="mt-2 block">Google API Keys Pool (שורה לכל מפתח)</Label>
              <textarea
                id="google-pool"
                rows={3}
                placeholder="AIzaKey1&#10;AIzaKey2"
                value={googleKeysPoolText}
                onChange={(e) => setGoogleKeysPoolText(e.target.value)}
                dir="ltr"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assemblyai">AssemblyAI API Key</Label>
              <div className="relative">
                <Input
                  id="assemblyai"
                  type={showAssemblyAI ? "text" : "password"}
                  placeholder="..."
                  value={assemblyaiKey}
                  onChange={(e) => setAssemblyaiKey(e.target.value)}
                  dir="ltr"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowAssemblyAI(!showAssemblyAI)}
                >
                  {showAssemblyAI ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                מפתח API עבור AssemblyAI - תמלול מהיר ואיכותי
              </p>

              <Label htmlFor="assembly-pool" className="mt-2 block">AssemblyAI API Keys Pool (שורה לכל מפתח)</Label>
              <textarea
                id="assembly-pool"
                rows={3}
                placeholder="asm_key_1&#10;asm_key_2"
                value={assemblyaiKeysPoolText}
                onChange={(e) => setAssemblyaiKeysPoolText(e.target.value)}
                dir="ltr"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deepgram">Deepgram API Key</Label>
              <div className="relative">
                <Input
                  id="deepgram"
                  type={showDeepgram ? "text" : "password"}
                  placeholder="..."
                  value={deepgramKey}
                  onChange={(e) => setDeepgramKey(e.target.value)}
                  dir="ltr"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowDeepgram(!showDeepgram)}
                >
                  {showDeepgram ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                מפתח API עבור Deepgram - מהיר במיוחד
              </p>

              <Label htmlFor="deepgram-pool" className="mt-2 block">Deepgram API Keys Pool (שורה לכל מפתח)</Label>
              <textarea
                id="deepgram-pool"
                rows={3}
                placeholder="dg_key_1&#10;dg_key_2"
                value={deepgramKeysPoolText}
                onChange={(e) => setDeepgramKeysPoolText(e.target.value)}
                dir="ltr"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="claude">Anthropic Claude API Key</Label>
              <div className="relative">
                <Input
                  id="claude"
                  type={showClaude ? "text" : "password"}
                  placeholder="sk-ant-..."
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  dir="ltr"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowClaude(!showClaude)}
                >
                  {showClaude ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                מפתח API עבור Claude (בקרוב!)
              </p>
            </div>

            <Button onClick={handleSave} className="w-full" size="lg">
              שמור הגדרות
            </Button>
          </CardContent>
        </Card>

        {/* Ollama Local AI */}
        <OllamaManager />

        {/* Hebrew NLP Resources */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              🇮🇱 משאבי NLP עברי
            </CardTitle>
            <CardDescription>
              כלים ומודלים מומלצים לעברית
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a href="https://huggingface.co/ivrit-ai" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 border rounded-lg hover:bg-accent transition-colors">
                <ExternalLink className="w-4 h-4 flex-shrink-0" />
                <div>
                  <div className="font-medium text-sm">Ivrit.ai — מודלי Whisper</div>
                  <div className="text-xs text-muted-foreground">המודלים המדויקים ביותר לעברית</div>
                </div>
              </a>
              <a href="https://huggingface.co/dicta-il" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 border rounded-lg hover:bg-accent transition-colors">
                <ExternalLink className="w-4 h-4 flex-shrink-0" />
                <div>
                  <div className="font-medium text-sm">DICTA — NLP עברי</div>
                  <div className="text-xs text-muted-foreground">ניקוד, מורפולוגיה, DictaLM 3.0</div>
                </div>
              </a>
              <a href="https://huggingface.co/spaces/ivrit-ai/whisper-leaderboard" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 border rounded-lg hover:bg-accent transition-colors">
                <ExternalLink className="w-4 h-4 flex-shrink-0" />
                <div>
                  <div className="font-medium text-sm">Hebrew Transcription Leaderboard</div>
                  <div className="text-xs text-muted-foreground">טבלת השוואה בין מודלי תמלול</div>
                </div>
              </a>
              <a href="https://github.com/NNLP-IL/Hebrew-Resources" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 border rounded-lg hover:bg-accent transition-colors">
                <ExternalLink className="w-4 h-4 flex-shrink-0" />
                <div>
                  <div className="font-medium text-sm">Hebrew NLP Resources</div>
                  <div className="text-xs text-muted-foreground">רשימה מקיפה של כלי NLP לעברית</div>
                </div>
              </a>
            </div>
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
