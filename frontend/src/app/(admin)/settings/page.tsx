"use client";

import { useState, useEffect } from "react";
import { Settings, Cpu, HardDrive, Download, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

type DownloadProgress = {
  stage: string;
  percent: number;
  mbDownloaded: string;
  mbTotal: string;
};

const initialDownloadProgress: DownloadProgress = {
  stage: 'idle',
  percent: 0,
  mbDownloaded: '0.0',
  mbTotal: '0.0',
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("basic");
  
  const [coreStatus, setCoreStatus] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  const [geoStatus, setGeoStatus] = useState<any>(null);
  const [geoDownloading, setGeoDownloading] = useState(false);

  // Password Update State
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 5) {
      return toast.error("密码不能少于 5 位字符");
    }
    setUpdatingPassword(true);
    try {
      const res = await fetch("/api/v1/auth/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: JSON.stringify({ newPassword })
      });
      if (res.ok) {
        toast.success("管理密码修改成功！请重新登录。");
        setNewPassword("");
        setTimeout(() => {
          localStorage.removeItem("admin_token");
          window.location.href = "/login";
        }, 1500);
      } else {
         const err = await res.json();
         toast.error(err.detail || "修改密码失败");
      }
    } catch (e) {
      toast.error("网络请求异常");
    } finally {
      setUpdatingPassword(false);
    }
  };

  const fetchCoreStatus = async () => {
    try {
      const res = await fetch('/worker-api/system/core-status', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` }
      });
      if (res.ok) setCoreStatus(await res.json());
      
      const geoRes = await fetch('/worker-api/system/geodb-status', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` }
      });
      if (geoRes.ok) setGeoStatus(await geoRes.json());
    } catch(e) {}
  };

  useEffect(() => {
    fetchCoreStatus();
  }, []);

  const [dlProgress, setDlProgress] = useState<DownloadProgress>(initialDownloadProgress);

  const handleDownloadCore = async () => {
    setDownloading(true);
    setDlProgress({ ...initialDownloadProgress, stage: 'downloading' });
    toast.info("开始自动化核心部署...", { id: 'core-download' });
    
    const poller = setInterval(async () => {
      try {
        const res = await fetch('/worker-api/system/core-download-progress', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` }
        });
        if (res.ok) {
           const data = await res.json();
           const pct = data.totalBytes > 0 ? Math.round((data.downloadedBytes / data.totalBytes) * 100) : 0;
           const mbDl = (data.downloadedBytes / 1024 / 1024).toFixed(1);
           const mbTot = (data.totalBytes / 1024 / 1024).toFixed(1);
           setDlProgress({ stage: data.stage, percent: pct, mbDownloaded: mbDl, mbTotal: mbTot });
           if (data.stage === 'error') {
             clearInterval(poller);
           }
        }
      } catch(e) {}
    }, 500);

    try {
      const res = await fetch('/worker-api/system/core-download', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` }
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      
      const newStatus = await res.json();
      setCoreStatus(newStatus);
      toast.success("Mihomo 核心配置并安装成功。进度流已完结。", { id: 'core-download' });
    } catch (e: any) {
      toast.error(e.message || "核心部署失败", { id: 'core-download', duration: 10000 });
    } finally {
      clearInterval(poller);
      setDownloading(false);
      setDlProgress(initialDownloadProgress);
    }
  };

  const [geoDlProgress, setGeoDlProgress] = useState<DownloadProgress>(initialDownloadProgress);

  const handleDownloadGeo = async () => {
    setGeoDownloading(true);
    setGeoDlProgress({ ...initialDownloadProgress, stage: 'downloading' });
    toast.info("开始更新 GeoIP 数据库...", { id: 'geo-download' });
    
    const poller = setInterval(async () => {
      try {
        const res = await fetch('/worker-api/system/geodb-progress', { headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` } });
        if (res.ok) {
           const data = await res.json();
           const pct = data.totalBytes > 0 ? Math.round((data.downloadedBytes / data.totalBytes) * 100) : 0;
           const mbDl = (data.downloadedBytes / 1024 / 1024).toFixed(1);
           const mbTot = (data.totalBytes / 1024 / 1024).toFixed(1);
           setGeoDlProgress({ stage: data.stage, percent: pct, mbDownloaded: mbDl, mbTotal: mbTot });
           if (data.stage === 'error') clearInterval(poller);
        }
      } catch(e) {}
    }, 500);

    try {
      const res = await fetch('/worker-api/system/geodb-download', { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` } });
      if (!res.ok) throw new Error((await res.json()).detail);
      setGeoStatus(await res.json());
      toast.success("Country.mmdb 更新成功！", { id: 'geo-download' });
    } catch (e: any) {
      toast.error(e.message || "更新失败", { id: 'geo-download', duration: 10000 });
    } finally {
      clearInterval(poller);
      setGeoDownloading(false);
      setGeoDlProgress(initialDownloadProgress);
    }
  };

  return (
    <div className="flex flex-row h-full w-full gap-3 font-sans min-h-0">
      
      {/* SECONDARY SIDEBAR ISLAND */}
      <aside className="w-80 flex flex-col bg-background rounded-xl border border-border/20 shadow-middle overflow-hidden h-full flex-shrink-0">
        <div className="flex flex-col h-full animate-in fade-in duration-500">
        <div className="p-4 border-b border-border/20 flex flex-col gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-foreground" />
            <h2 className="text-base font-semibold tracking-tight text-foreground">系统设置</h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 mask-fade-bottom pb-6">
          <button
            onClick={() => setActiveTab("basic")}
            className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200 border border-transparent ${
              activeTab === "basic" 
                ? "bg-foreground/5 dark:bg-foreground/10 text-foreground border-border/30 shadow-minimal" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Settings className="w-5 h-5 opacity-70 shrink-0" />
            <div className="flex-1 min-w-0">
               <p className="text-sm font-semibold truncate text-foreground">基本设置</p>
               <p className="text-xs opacity-70 truncate mt-0.5">基础全局项与界面外观设置</p>
            </div>
          </button>
          
          <button
            onClick={() => setActiveTab("runtime")}
            className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200 border border-transparent ${
              activeTab === "runtime" 
                ? "bg-foreground/5 dark:bg-foreground/10 text-foreground border-border/30 shadow-minimal" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Cpu className="w-5 h-5 opacity-70 shrink-0" />
            <div className="flex-1 min-w-0">
               <p className="text-sm font-semibold truncate text-foreground">运行环境</p>
               <p className="text-xs opacity-70 truncate mt-0.5">代理沙盒网络与组件架构状态</p>
            </div>
          </button>
        </div>
        </div>
      </aside>

      {/* MAIN CONTENT ISLAND */}
      <main className="flex-1 flex flex-col bg-background rounded-xl border border-border/20 shadow-middle overflow-y-auto h-full relative">
        <div className="flex flex-col h-full animate-in fade-in duration-500">
        {/* Main Panel Header */}
        <div className="p-4 border-b border-border/10 shrink-0 sticky top-0 bg-background/90 backdrop-blur z-20 flex items-center justify-center">
          <div className="absolute left-4">
            <SidebarTrigger className="md:hidden" />
          </div>
          <h1 className="text-xs font-bold tracking-widest text-foreground uppercase">
            {activeTab === 'basic' ? "基本设置 (Basic Settings)" : "运行环境 (Runtime Environment)"}
          </h1>
        </div>

        <div className="flex-1 flex justify-center p-6 bg-transparent overflow-y-auto">
          <div className="w-full max-w-4xl space-y-6">
            {activeTab === 'runtime' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card className="shadow-middle border border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                       <Cpu className="w-5 h-5 text-primary" />
                      代理服务核心 (Mihomo/Clash)
                    </CardTitle>
                    <CardDescription>控制底层代理网络引擎的安装与运行状态。引擎提供全局和分流网络代理能力。</CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    {!coreStatus ? (
                      <div className="h-24 flex items-center justify-center animate-pulse bg-muted/20 rounded-lg">
                        <p className="text-muted-foreground text-sm">正在检测核心状态...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col md:flex-row items-center gap-6 p-4 rounded-xl border border-border/30 bg-muted/10">
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold w-20 text-muted-foreground">核心状态</span>
                            {coreStatus.installed ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 px-2 py-0.5">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> 已就绪 (Installed)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 px-2 py-0.5">
                                <AlertCircle className="w-3 h-3 mr-1" /> 尚未安装 (Missing)
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold w-20 text-muted-foreground">系统平台</span>
                            <span className="text-sm font-mono text-foreground bg-background px-2 py-0.5 rounded border border-border/50">
                              {coreStatus.platform} ({coreStatus.arch})
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold w-20 text-muted-foreground">支持版本</span>
                            <span className="text-sm text-foreground">{coreStatus.version}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold w-20 text-muted-foreground">安装路径</span>
                            <span className="text-xs text-muted-foreground font-mono truncate max-w-full" title={coreStatus.path}>{coreStatus.path}</span>
                          </div>
                        </div>
                        
                        <div className="shrink-0 flex flex-col gap-2 w-full md:w-auto mt-4 md:mt-0">
                           <Button 
                              onClick={handleDownloadCore} 
                              disabled={downloading} 
                              className={`shadow-minimal w-full tabular-nums min-w-32 ${coreStatus.installed ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' : 'bg-primary text-primary-foreground hover:bg-primary/90'} ${downloading && !coreStatus.installed ? 'animate-pulse' : ''}`}
                            >
                              {downloading ? (
                                 <>
                                   <RefreshCw className="mr-2 h-4 w-4 animate-spin"/> 
                                   {dlProgress.stage === 'downloading' 
                                     ? `下载中 ${dlProgress.percent}% (${dlProgress.mbDownloaded} / ${dlProgress.mbTotal} MB)` 
                                     : dlProgress.stage === 'extracting' 
                                       ? '正在解压并配置内核...' 
                                       : '系统准备中...'}
                                 </>
                              ) : <><Download className="mr-2 h-4 w-4"/> {coreStatus.installed ? '重新部署引擎' : '自动化下载与核心部署'}</>}
                            </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-middle border border-border/50 bg-card opacity-60">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                         <HardDrive className="w-5 h-5 text-foreground" />
                       服务运行时
                    </CardTitle>
                    <CardDescription>当前环境尚未配置可剥离沙盒。</CardDescription>
                  </CardHeader>
                </Card>
              </div>
            )}

            {activeTab === 'basic' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                 <Card className="shadow-middle border border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                         <Settings className="w-5 h-5 text-foreground" />
                       全局设置
                    </CardTitle>
                    <CardDescription>系统的基础设置项。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-muted-foreground relative z-10">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/10 border border-border/30">
                      <div>
                        <p className="font-semibold text-foreground">深色模式</p>
                        <p className="text-xs mt-1">界面会自动跟随系统的深浅色模式。</p>
                      </div>
                      <Badge variant="secondary">自动跟随</Badge>
                    </div>

                    <div className="flex flex-col md:flex-row items-center justify-between p-4 rounded-lg bg-muted/10 border border-border/30 gap-4">
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">修改管理密码</p>
                        <p className="text-xs mt-1">为安全起见，建议您定期更改管理后台的登录密码。</p>
                      </div>
                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <input 
                          type="password" 
                          placeholder="新密码 (不少于 5 位)" 
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-w-[200px]"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <Button 
                           onClick={handleUpdatePassword} 
                           disabled={updatingPassword || !newPassword}
                           className="h-9 shrink-0"
                        >
                          提交修改
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
