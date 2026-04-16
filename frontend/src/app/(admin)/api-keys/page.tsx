"use client";

import { useEffect, useState } from "react";
import { Key, Plus, Trash2, CalendarX, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ApiKey = {
  key: string;
  remark: string;
  max_usage: number;
  used_count: number;
  expire_at: string | null;
  created_at: string;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [open, setOpen] = useState(false);
  const [remark, setRemark] = useState("");
  const [maxUsage, setMaxUsage] = useState<number>(0);
  const [expireAt, setExpireAt] = useState("");

  const fetchKeys = async () => {
    try {
      const res = await fetch("/worker-api/api-keys", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("admin_token")}` }
      });
      if (!res.ok) {
        if (res.status === 401) window.location.href = "/login";
        return;
      }
      const data = await res.json();
      setKeys(data);
    } catch (e) {
      toast.error("读取密钥失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async () => {
    try {
      const res = await fetch("/worker-api/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: JSON.stringify({
          remark,
          max_usage: maxUsage,
          expire_at: expireAt || null
        })
      });
      if (res.ok) {
        toast.success("API 密钥已生成");
        setOpen(false);
        setRemark("");
        setMaxUsage(0);
        setExpireAt("");
        fetchKeys();
      } else {
        toast.error("生成失败");
      }
    } catch (e) {
      toast.error("网络错误");
    }
  };

  const handleRevoke = async (key: string) => {
    if (!confirm("确定要废除该密钥吗？废除后相关业务将立即断开！")) return;
    try {
      const res = await fetch(`/worker-api/api-keys/${key}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${localStorage.getItem("admin_token")}` }
      });
      if (res.ok) {
        toast.success("密钥已废除");
        fetchKeys();
      }
    } catch (e) {
      toast.error("接口调用失败");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  };

  return (
    <div className="flex-1 w-full space-y-4 p-4 md:p-6 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">业务 API 密钥</h2>
          <p className="text-muted-foreground">管理分发给外部业务端打码使用的专属身份凭证</p>
        </div>
        <div className="ml-auto">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 bg-foreground text-background shadow-sm hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4 mr-1" />
              发放新密钥
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>发放 API 密钥</DialogTitle>
                <DialogDescription>
                  设定可用额度与过期时间来严格控制打码频次。
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="remark" className="text-right text-sm font-medium">备注 (项目名)</label>
                  <Input id="remark" value={remark} onChange={(e) => setRemark(e.target.value)} className="col-span-3" placeholder="例如：某抢购脚本" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="max_usage" className="text-right text-sm font-medium">额度限制</label>
                  <div className="col-span-3 flex items-center gap-2">
                    <Input id="max_usage" type="number" value={maxUsage} onChange={(e) => setMaxUsage(Number(e.target.value))} />
                    <span className="text-xs text-muted-foreground min-w-[70px]">0 为无限制</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="expire_at" className="text-right text-sm font-medium">过期时间</label>
                  <Input id="expire_at" type="datetime-local" value={expireAt} onChange={(e) => setExpireAt(e.target.value)} className="col-span-3" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={!remark}>保存并生成</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Content Area */}
      <div className="pt-2">
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">载入中...</div>
          ) : keys.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/50">
              <Key className="w-8 h-8 opacity-20 mx-auto mb-3" />
              暂无签发的有效凭证
            </div>
          ) : (
            <div className="grid gap-3">
              {keys.map((k) => (
                <div key={k.key} className="group flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm shadow-minimal gap-4 transition-all duration-300 hover:shadow-md hover:border-primary/30">
                  <div className="flex items-center gap-3">
                    <div className="bg-foreground/5 p-2.5 rounded-lg border border-border/50">
                      <Key className="w-5 h-5 text-foreground/80" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{k.remark}</span>
                        {k.expire_at && new Date(k.expire_at) < new Date() && (
                          <Badge variant="destructive" className="h-5 text-[10px]">已过期</Badge>
                        )}
                        {k.max_usage > 0 && k.used_count >= k.max_usage && (
                          <Badge variant="secondary" className="h-5 text-[10px] bg-orange-500/10 text-orange-500 border-orange-500/20">额度耗尽</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors" onClick={() => copyToClipboard(k.key)}>
                        {k.key} <Copy className="w-3 h-3 ml-1 opacity-50" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground mb-1">使用量限制</div>
                      <div className="text-sm font-medium font-mono">
                        {k.used_count} / {k.max_usage === 0 ? "∞ 无限" : k.max_usage}
                      </div>
                    </div>
                    
                    {k.expire_at && (
                       <div className="text-right hidden md:block">
                        <div className="text-xs text-muted-foreground mb-1">拦截时间</div>
                        <div className="text-sm font-medium flex items-center gap-1.5 justify-end">
                          <CalendarX className="w-3.5 h-3.5 opacity-50" />
                          {new Date(k.expire_at).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                    
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => handleRevoke(k.key)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
