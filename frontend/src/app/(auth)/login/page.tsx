"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldPlus, LogIn, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);
    try {
      // POST mapping for api routes handles through next.config.ts /api/* proxy logic
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("admin_token", data.token);
        localStorage.setItem("admin_user", data.username);
        toast.success("登录成功");
        router.push("/dashboard");
      } else {
        const err = await res.json();
        toast.error(err.detail || "登录失败");
      }
    } catch (err) {
      toast.error("网络请求异常");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-muted/30">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sidebar/50 via-background to-background"></div>
      <Card className="z-10 w-[400px] border-border/50 shadow-middle bg-background/90 backdrop-blur">
        <CardHeader className="text-center space-y-4 pt-8">
          <div className="mx-auto bg-foreground p-3 rounded-xl shadow-minimal w-14 h-14 flex items-center justify-center">
            <ShieldPlus className="h-7 w-7 text-background" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">管理后台入口</CardTitle>
            <CardDescription className="mt-2 text-muted-foreground">
              请输入管理员账号以访问控制台
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pb-8 px-8">
          <form onSubmit={handleLogin} className="space-y-6 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Input
                  id="username"
                  type="text"
                  placeholder="账号"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-muted/50 border-border/50 h-11"
                  required
                />
              </div>
              <div className="space-y-2">
                <Input
                  id="password"
                  type="password"
                  placeholder="密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-muted/50 border-border/50 h-11"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-medium bg-foreground text-background" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <LogIn className="w-5 h-5 mr-2" />}
              登录控制台
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
