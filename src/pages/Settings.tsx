import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Settings as SettingsIcon, ArrowRight, LogOut, Eye, EyeOff, Wrench, Cpu, Palette, Key } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DevToolsPanel from "@/components/DevToolsPanel";
import { OllamaManager } from "@/components/OllamaManager";
import { ThemeManager } from "@/components/ThemeManager";
import { getApiKey } from "@/lib/keyCrypto";

const Settings = () => {
  const { isAuthenticated, logout, isLoading, isAdmin, user } = useAuth();
  const [showDevTools, setShowDevTools] = useState(false);
  const navigate = useNavigate();
  const [openaiKey, setOpenaiKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [assemblyaiKey, setAssemblyaiKey] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGoogle, setShowGoogle] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [showClaude, setShowClaude] = useState(false);
  const [showAssemblyAI, setShowAssemblyAI] = useState(false);
  const [showDeepgram, setShowDeepgram] = useState(false);
  const [userIdentifier, setUserIdentifier] = useState("");

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

      if (data) {
        if (data.openai_key) setOpenaiKey(data.openai_key);
        if (data.google_key) setGoogleKey(data.google_key);
        if (data.groq_key) setGroqKey(data.groq_key);
        if (data.claude_key) setClaudeKey(data.claude_key);
        if (data.assemblyai_key) setAssemblyaiKey(data.assemblyai_key);
        if (data.deepgram_key) setDeepgramKey(data.deepgram_key);
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
      }
    } catch (error) {
      console.error("Error loading keys:", error);
      toast.error("שגיאה בטעינת המפתחות");
    }
  };

  const handleSave = async () => {
    try {
      // Save to cloud (tied to user ID)
      const { error } = await supabase
        .from('user_api_keys')
        .upsert({
          user_identifier: userIdentifier,
          openai_key: openaiKey || null,
          google_key: googleKey || null,
          groq_key: groqKey || null,
          claude_key: claudeKey || null,
          assemblyai_key: assemblyaiKey || null,
          deepgram_key: deepgramKey || null,
        }, {
          onConflict: 'user_identifier'
        });

      if (error) {
        console.error("Error saving to cloud:", error);
        toast.error("שגיאה בשמירת המפתחות בענן");
        return;
      }

      // Also save locally for quick access
      if (openaiKey) localStorage.setItem("openai_api_key", openaiKey);
      if (googleKey) localStorage.setItem("google_api_key", googleKey);
      if (groqKey) localStorage.setItem("groq_api_key", groqKey);
      if (claudeKey) localStorage.setItem("claude_api_key", claudeKey);
      if (assemblyaiKey) localStorage.setItem("assemblyai_api_key", assemblyaiKey);
      if (deepgramKey) localStorage.setItem("deepgram_api_key", deepgramKey);

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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="api-keys" className="gap-2">
              <Key className="h-4 w-4" />
              מפתחות API
            </TabsTrigger>
            <TabsTrigger value="themes" className="gap-2">
              <Palette className="h-4 w-4" />
              ערכות נושא
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
