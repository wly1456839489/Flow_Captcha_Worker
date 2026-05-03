"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, RefreshCw, Server, AlertCircle, Edit2, Zap, Circle, Heart, Flag, FlagOff } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function ProxyNodesPage() {
  const [subs, setSubs] = useState<any[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newSubUrl, setNewSubUrl] = useState("");
  const [newSubRemark, setNewSubRemark] = useState("");
  
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editSubId, setEditSubId] = useState<string | null>(null);
  const [editSubUrl, setEditSubUrl] = useState("");
  const [editSubRemark, setEditSubRemark] = useState("");
  const [testingSubId, setTestingSubId] = useState<string | null>(null);

  const fetchSubs = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` };
      const [subsRes, nodesRes] = await Promise.all([
        fetch(`/worker-api/proxies/subs`, { headers }),
        fetch(`/worker-api/proxies/nodes`, { headers })
      ]);
      if (subsRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      const sData = await subsRes.json();
      const nData = await nodesRes.json();
      setSubs(Array.isArray(sData) ? sData : []);
      setNodes(Array.isArray(nData) ? nData : []);
    } catch(e) {
      toast.error("网络错误");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubs();
  }, []);

  const handleAddSub = async () => {
    if (!newSubUrl) return toast.error("请输入订阅链接");
    try {
      const res = await fetch(`/worker-api/proxies/subs`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` },
        body: JSON.stringify({ url: newSubUrl, remark: newSubRemark })
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      
      const newSub = await res.json();
      toast.success("订阅添加入库成功...");
      setSelectedSubId(newSub.id);
      setIsAddOpen(false);
      setNewSubUrl("");
      setNewSubRemark("");
      await fetchSubs();
      
      // Auto Sync
      await syncSub(newSub.id);
    } catch(e: any) {
      toast.error(e.message || "添加失败");
    }
  };

  const handleEditSub = async () => {
    if (!editSubId || !editSubUrl) return toast.error("请输入订阅链接");
    try {
      const res = await fetch(`/worker-api/proxies/subs/${editSubId}`, {
        method: "PUT",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` },
        body: JSON.stringify({ url: editSubUrl, remark: editSubRemark })
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      
      toast.success("订阅已更新");
      setIsEditOpen(false);
      fetchSubs();
    } catch(e: any) {
      toast.error(e.message || "更新失败");
    }
  };

  const openEditDialog = (e: any, sub: any) => {
    e.stopPropagation();
    setEditSubId(sub.id);
    setEditSubUrl(sub.url);
    setEditSubRemark(sub.remark);
    setIsEditOpen(true);
  };

  const syncSub = async (id: string, skipToast = false) => {
    if (!skipToast) toast.info("正在拉取节点...");
    try {
      const res = await fetch(`/worker-api/proxies/subs/${id}/sync`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` }
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      
      const data = await res.json();
      if (!skipToast) toast.success(`成功解析 ${data.nodeCount} 个节点`);
      fetchSubs();
      
      // Auto chain speed test
      testSub(id);
    } catch(e: any) {
      if (!skipToast) toast.error(e.message || "解析失败");
    }
  };

  const testSub = async (id: string) => {
    toast.info("启动并发节点测速...");
    setTestingSubId(id);
    try {
      const res = await fetch(`/worker-api/proxies/subs/${id}/test`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` }
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      
      const data = await res.json();
      toast.success(`测速完成：${data.tested} 个节点已更新`);
      fetchSubs();
    } catch(e: any) {
      toast.error(e.message || "测速执行失败");
    } finally {
      setTestingSubId(null);
    }
  };

  const [testingNodeId, setTestingNodeId] = useState<string | null>(null);

  const testSingleNode = async (nodeId: string) => {
    setTestingNodeId(nodeId);
    try {
      const res = await fetch(`/worker-api/proxies/nodes/${nodeId}/test`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` }
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      fetchSubs(); // refresh status
    } catch(e: any) {
      toast.error(e.message || "节点测速失败");
    } finally {
      setTestingNodeId(null);
    }
  };

  const deleteSub = async (id: string) => {
    try {
      await fetch(`/worker-api/proxies/subs/${id}`, {
        method: "DELETE",
        headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}` }
      });
      toast.success("订阅已删除");
      fetchSubs();
    } catch(e) {
      toast.error("删除失败");
    }
  };

  const toggleNodeFlag = async (nodeId: string, currentFlag: boolean) => {
    try {
      const res = await fetch(`/worker-api/proxies/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagged: !currentFlag, favorite: false })
      });
      if (res.ok) {
        const { node } = await res.json();
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, flagged: node.flagged, favorite: node.favorite } : n));
        toast.info(node.flagged ? "已标记剔除" : "取消剔除标记");
      }
    } catch(err: any) {
      toast.error(`操作失败: ${err.message}`);
    }
  };

  const toggleNodeFavorite = async (nodeId: string, currentFav: boolean) => {
    try {
      const res = await fetch(`/worker-api/proxies/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem("admin_token")}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !currentFav, flagged: false })
      });
      if (res.ok) {
        const { node } = await res.json();
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, flagged: node.flagged, favorite: node.favorite } : n));
        toast.success(node.favorite ? "已加入最爱" : "已取消最爱");
      }
    } catch(err: any) {
      toast.error(`操作失败: ${err.message}`);
    }
  };

  // Group nodes by subId
  const getSubNodes = (subId: string) => nodes.filter(n => n.subId === subId);

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Auto-select first sub if available and none selected
  useEffect(() => {
    if (subs.length === 0) {
      setSelectedSubId(null);
    } else if (!selectedSubId || !subs.some(sub => sub.id === selectedSubId)) {
      setSelectedSubId(subs[0].id);
    }
  }, [subs, selectedSubId]);

  return (
    <div className="flex flex-row h-full w-full gap-3 font-sans min-h-0">
      
      {/* SECONDARY SIDEBAR ISLAND */}
      <aside className="w-80 flex flex-col bg-background rounded-xl border border-border/20 shadow-middle overflow-hidden h-full flex-shrink-0">
        <div className="flex flex-col h-full animate-in fade-in duration-500">
        <div className="p-4 border-b border-border/20 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Server className="w-4 h-4" />
              代理订阅源
            </h2>
            <Badge variant="secondary" className="font-mono text-xs shadow-none">{subs.length}</Badge>
          </div>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger className="w-full inline-flex items-center justify-center rounded-md text-sm font-semibold h-9 px-4 bg-foreground hover:opacity-90 text-background transition-colors">
              <Plus className="mr-2 h-4 w-4 stroke-[3px]" /> 导入订阅
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-background border-border shadow-middle text-foreground rounded-xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">新增订阅配置</DialogTitle>
                <DialogDescription className="text-muted-foreground font-medium">
                  支持各类主流代理订阅环境格式（包含所有原生 Clash 获取链接）
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col space-y-4 pt-2">
                <Input
                  placeholder="https://.../link/xxxx"
                  value={newSubUrl}
                  onChange={(e) => setNewSubUrl(e.target.value)}
                  className="bg-background shadow-minimal focus-visible:ring-1 text-foreground"
                />
                <Input
                  placeholder="备注（如：香港 CN2）"
                  value={newSubRemark}
                  onChange={(e) => setNewSubRemark(e.target.value)}
                  className="bg-background shadow-minimal focus-visible:ring-1 text-foreground"
                />
              </div>
              <DialogFooter className="sm:justify-end mt-4">
                <Button variant="ghost" onClick={() => setIsAddOpen(false)} className="text-muted-foreground hover:text-foreground">
                  取消
                </Button>
                <Button onClick={handleAddSub} className="bg-foreground text-background">
                  确认导入并获取
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent className="sm:max-w-md bg-background border-border shadow-middle text-foreground rounded-xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">修改订阅配置</DialogTitle>
                <DialogDescription className="text-muted-foreground font-medium">编辑此代理订阅源的地址或名称</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col space-y-4 pt-2">
                <Input
                  placeholder="https://.../link/xxxx?clash=3"
                  value={editSubUrl}
                  onChange={(e) => setEditSubUrl(e.target.value)}
                  className="bg-background shadow-minimal focus-visible:ring-1 text-foreground"
                />
                <Input
                  placeholder="备注（如：香港 CN2）"
                  value={editSubRemark}
                  onChange={(e) => setEditSubRemark(e.target.value)}
                  className="bg-background shadow-minimal focus-visible:ring-1 text-foreground"
                />
              </div>
              <DialogFooter className="sm:justify-end mt-4">
                <Button variant="ghost" onClick={() => setIsEditOpen(false)} className="text-muted-foreground hover:text-foreground">
                  取消
                </Button>
                <Button onClick={handleEditSub} className="bg-foreground text-background">
                  保存更改
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 mask-fade-bottom pb-6">
          {subs.length === 0 && !loading && (
             <div className="py-8 flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/10 mx-2 mt-4 px-2 text-center">
               <AlertCircle className="w-6 h-6 text-muted-foreground opacity-50 mb-2" />
               <p className="text-xs text-muted-foreground font-medium">暂无订阅，请点击上方导入</p>
             </div>
          )}

          {subs.map(sub => {
            const isSelected = selectedSubId === sub.id;
            const subNodes = getSubNodes(sub.id);
            return (
              <div 
                key={sub.id}
                onClick={() => setSelectedSubId(sub.id)} 
                className={`group relative p-3 rounded-lg cursor-pointer transition-all duration-200 border border-transparent ${
                  isSelected 
                    ? 'bg-foreground/5 dark:bg-foreground/10 text-foreground border-border/30 shadow-minimal' 
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2 mb-1 pr-12">
                  {subNodes.length > 0 && <span className="text-[10px] bg-background border border-border/50 px-1.5 py-0.5 rounded text-muted-foreground shrink-0">{subNodes.length}</span>}
                  <span className="font-semibold text-sm truncate">{sub.remark || new URL(sub.url).hostname}</span>
                </div>
                {sub.remark && <p className="text-xs opacity-70 truncate font-mono">{new URL(sub.url).hostname}</p>}
                
                <div className="absolute right-1 top-1 bottom-1 flex flex-col justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={(e) => openEditDialog(e, sub)}
                    className="w-6 h-6 bg-background/50 hover:bg-background shadow-minimal text-muted-foreground hover:text-foreground border border-border/50"
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); syncSub(sub.id); }}
                    className="w-6 h-6 bg-background/50 hover:bg-background shadow-minimal text-muted-foreground hover:text-foreground border border-border/50"
                  >
                    <RefreshCw className={`w-3 h-3 ${testingSubId === sub.id ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </aside>

      {/* MAIN CONTENT ISLAND */}
      <main className="flex-1 flex flex-col bg-background rounded-xl border border-border/20 shadow-middle overflow-hidden h-full">
        <div className="flex flex-col h-full animate-in fade-in duration-500">
        {selectedSubId ? (() => {
          const activeSub = subs.find(s => s.id === selectedSubId);
          if (!activeSub) return null;
          const subNodes = getSubNodes(selectedSubId);

          return (
            <>
              {/* Main Panel Header */}
              <div className="p-6 border-b border-border/10 shrink-0 flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{activeSub.remark || new URL(activeSub.url).hostname}</h1>
                  <p className="text-sm text-muted-foreground mt-1 truncate max-w-lg font-mono opacity-80">{activeSub.url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => syncSub(activeSub.id)} disabled={testingSubId === activeSub.id} className="shadow-minimal h-9">
                    <RefreshCw className="mr-2 h-4 w-4" /> 同步获取
                  </Button>
                  <Button variant="default" size="sm" onClick={() => testSub(activeSub.id)} disabled={testingSubId === activeSub.id} className={`h-9 px-3 ${testingSubId === activeSub.id ? 'animate-pulse' : ''} shadow-minimal bg-foreground text-background`}>
                    <Zap className="mr-1.5 h-4 w-4" fill="currentColor" /> {testingSubId === activeSub.id ? "测速中..." : "并发测速"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteSub(activeSub.id)} className="h-9 w-9 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Nodes Grid */}
              <div className="flex-1 overflow-y-auto p-6 bg-transparent">
                {subNodes.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {subNodes.map((n, i) => {
                      let delayColor = "bg-muted text-muted-foreground";
                      let latencyText = "-";
                      let cardBorder = "border-border/40 hover:border-border/80";
                      
                      if (n.latency !== undefined && n.latency !== -1) {
                         delayColor = n.latency < 500 ? "bg-green-500/10 text-green-600 dark:text-green-500" : (n.latency < 1500 ? "bg-amber-500/10 text-amber-600 dark:text-amber-500" : "bg-red-500/10 text-red-600 dark:text-red-500");
                         if (n.latency < 1500) {
                            cardBorder = "border-green-500/30 bg-green-500/5 hover:border-green-500/50 dark:border-green-500/20";
                         }
                         latencyText = `${n.latency}ms`;
                      } else if (n.status === 'timeout' || n.latency === -1) {
                         delayColor = "bg-red-500/10 text-red-600 dark:text-red-500";
                         cardBorder = "border-red-500/20 hover:border-red-500/40 opacity-70";
                         latencyText = "Timeout";
                      }
                      
                      return (
                        <div key={i} className={`bg-card border p-4 rounded-xl shadow-minimal flex flex-col transition-colors ${n.flagged ? 'opacity-60 border-destructive/20 hover:border-destructive/40 bg-destructive/5' : cardBorder}`}>
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className={`text-sm font-semibold truncate ${n.flagged ? 'text-muted-foreground line-through opacity-70' : 'text-foreground'}`} title={n.name}>{n.name}</span>
                              {n.favorite && <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500 shrink-0" />}
                            </div>
                            <div className={`shrink-0 flex items-center justify-center h-6 px-2 rounded font-mono text-[11px] font-semibold border border-transparent ${delayColor}`}>
                               {testingSubId === n.subId || testingNodeId === n.id ? <RefreshCw className="w-3 h-3 animate-spin opacity-50" /> : latencyText}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/20">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest px-1.5 py-0 h-5 border-muted-foreground/30 bg-muted/30">{n.type}</Badge>
                              <span className="text-xs text-muted-foreground truncate font-mono">{n.server}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button 
                                 variant="ghost" 
                                 size="icon" 
                                 onClick={() => toggleNodeFavorite(n.id, n.favorite)}
                                 className={`h-6 w-6 transition-colors rounded-full shrink-0 ${n.favorite ? 'text-red-500 hover:bg-red-500/10' : 'text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground'}`}
                                 title={n.favorite ? "取消最爱" : "加入最爱"}
                              >
                                 <Heart className={`w-3.5 h-3.5 ${n.favorite ? 'fill-current' : ''}`} />
                              </Button>
                              <Button 
                                 variant="ghost" 
                                 size="icon" 
                                 onClick={() => toggleNodeFlag(n.id, n.flagged)}
                                 className={`h-6 w-6 transition-colors rounded-full shrink-0 ${n.flagged ? 'text-destructive bg-destructive/10 hover:bg-destructive/20' : 'text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground'}`}
                                 title={n.flagged ? "取消拉黑" : "彻底拉黑弃用"}
                              >
                                 {n.flagged ? <FlagOff className="w-3.5 h-3.5" /> : <Flag className="w-3.5 h-3.5" />}
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-muted-foreground hover:text-foreground" 
                                onClick={() => testSingleNode(n.id)}
                                disabled={testingSubId === n.subId || testingNodeId === n.id}
                              >
                                 <RefreshCw className={`h-3 w-3 ${testingNodeId === n.id ? 'animate-spin opacity-50' : ''}`} />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-80">
                    <AlertCircle className="w-12 h-12 text-muted-foreground/50" />
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">暂无节点数据</h3>
                      <p className="text-sm text-muted-foreground mt-1">请点击右上角的同步按钮从机场拉取配置</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          );
        })() : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-60">
            <Server className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">请在左侧选择或导入订阅源</p>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
