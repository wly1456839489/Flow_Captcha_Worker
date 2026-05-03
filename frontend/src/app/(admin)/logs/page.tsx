"use client";

import { useEffect, useState } from "react";
import { Copy, Clock, Hash, CheckCircle2, XCircle, AlertCircle, RefreshCw, Box, Key } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface LogEntry {
  id: string;
  time: string;
  type: string;
  sessionId: string;
  nodeId: number;
  message: string;
  ip?: string;
  apiKey?: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/worker-api/system/logs", {
        headers: { Authorization: `Bearer ${localStorage.getItem("admin_token")}` },
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
        setConnectionError(false);
      } else {
        setConnectionError(true);
      }
    } catch {
      // The frontend can start polling before the backend proxy is ready.
      // Treat that as a temporary connection state instead of console noise.
      setConnectionError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const t = setInterval(fetchLogs, 2000);
    return () => clearInterval(t);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板！");
  };

  return (
    <div className="flex-1 w-full space-y-4 p-4 md:p-6 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">打码日志</h2>
            <Badge variant="secondary" className="font-mono h-6">
              共 {logs.length} 条
            </Badge>
            {connectionError && (
              <Badge variant="outline" className="h-6 text-xs text-destructive border-destructive/20 bg-destructive/10">
                后端连接中...
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">追踪打码请求、分发与验证状态的详细流转记录</p>
        </div>
        <div className="ml-auto">
          <Button onClick={fetchLogs} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 bg-foreground text-background shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            刷新记录
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="pt-2">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/50">
              <Box className="w-8 h-8 opacity-20 mx-auto mb-3" />
              暂无打码记录，等待外部调用接入...
            </div>
          ) : (
            <div className="grid gap-3">
              {logs.map((log) => {
                let Icon = AlertCircle;
                let iconColor = "text-muted-foreground";
                let badgeClass = "bg-muted text-muted-foreground";

                if (log.type === "SUCCESS") {
                  Icon = CheckCircle2;
                  iconColor = "text-success";
                  badgeClass = "border-success/20 bg-success/10 text-success";
                } else if (log.type === "ERROR") {
                  Icon = XCircle;
                  iconColor = "text-destructive";
                  badgeClass = "border-destructive/20 bg-destructive/10 text-destructive";
                } else if (log.type === "DISPATCH") {
                  Icon = Clock;
                  iconColor = "text-info";
                  badgeClass = "border-info/20 bg-info/10 text-info";
                }

                return (
                  <div key={log.id} className="group flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm shadow-minimal gap-4 transition-all duration-300 hover:shadow-md hover:border-primary/30">
                    <div className="flex items-start gap-4">
                      <div className={`bg-background shadow-sm border border-border/50 p-2.5 rounded-lg ${iconColor}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{log.time}</span>
                          <Badge variant="outline" className={`font-mono text-[10px] h-5 ${badgeClass}`}>
                            {log.type}
                          </Badge>
                          <span
                            className="inline-flex cursor-pointer items-center rounded bg-muted/50 px-2 h-5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                            onClick={() => copyToClipboard(log.sessionId)}
                          >
                            <Hash className="mr-1 h-3 w-3 opacity-50" />
                            {log.sessionId}
                          </span>
                          {log.ip && (
                            <span className="inline-flex items-center rounded border border-border/40 bg-background px-2 h-5 font-mono text-[10px] text-muted-foreground shadow-minimal">
                              IP: {log.ip}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm font-medium text-foreground/80">{log.message}</div>
                        {log.apiKey && (
                           <div 
                             className="flex items-center text-[11px] text-muted-foreground/80 font-mono mt-1 cursor-pointer hover:text-foreground transition-colors" 
                             title="复制 API Key"
                             onClick={() => copyToClipboard(log.apiKey!)}
                           >
                              <Key className="w-3 h-3 mr-1 opacity-50" />
                              <span className="opacity-70 mr-1">Key:</span> {log.apiKey}
                              <Copy className="w-3 h-3 ml-1.5 opacity-0 group-hover:opacity-100" />
                           </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center md:pr-4">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-1.5">处理节点</div>
                        <div className="rounded-md border border-border/40 bg-muted/60 px-3 py-1 text-xs font-semibold text-muted-foreground shadow-minimal">
                          Node {log.nodeId || "N/A"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
