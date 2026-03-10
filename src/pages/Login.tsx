import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock } from "lucide-react";

const Login = () => {
  const [code, setCode] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (login(code)) {
      toast.success("התחברת בהצלחה!");
      navigate("/settings");
    } else {
      toast.error("קוד שגוי, נסה שנית");
      setCode("");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">כניסת מנהל</CardTitle>
          <CardDescription>הכנס קוד מנהל לגישה להגדרות</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="קוד מנהל"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="text-center text-2xl tracking-widest"
                maxLength={4}
                dir="ltr"
              />
            </div>
            <Button type="submit" className="w-full" size="lg">
              התחבר
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
