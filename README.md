# CaptchaWorker

CaptchaWorker 是一款基于 Puppeteer 架构的现代、分布式的自动化验证引擎与实例集群管理后台。它内置了高度拟真的动态浏览器指纹生成机制与轻量级的可视化代理节点分发中心，专为应对复杂人机验证对抗场景（例如流式访问拦截、reCAPTCHA V3 构建等）提供兼具稳定与高性能的底层支撑方案。

## ✨ 核心特性

- **全功能控制台面板 (Web UI)**：前端控制面板基于 Next.js 与 shadcn/ui 框架构建。支持通过动态仪表盘实时监控集群的 CPU/内存资源开销、处理队列及打码成功率。
- **沉浸式指纹伪装引擎**：基于 `puppeteer-extra-plugin-stealth` 结合多维度深度指纹随机化补丁（Canvas, WebGL, AudioContext 追踪防御等），原生绕过各类反向工程与反爬虫策略侦测。
- **智能连接池调度流 (Warm Pool)**：摒弃传统的“一客一唤起”高昂开销策略。自带异步实例队列调度池，时刻储备一组“随时就绪”状态的 Chromium 集群进程，对请求作出毫无延迟的秒级响应交付。
- **代理枢纽管理接入**：集成了订阅解析适配器，原生支持引入包含加密传输节点的 YAML 机场订阅链接。系统自动在线测速、判定健康状态，且可通过面板将异常或脏 IP “打回黑名单”。
- **极速自动错误与冗余修复机制**：具有进程级生命时长守护。当单个并发节点识别命中异常或指纹腐败时，引擎可完成“无缝热重启”式隔离、退散及沙盒重启。

## 🚀 快速启动

### 安装依赖环境
务必确保本机已安装 Node.js (推荐 >= 18) 与包管理工具（推荐选用 `pnpm` 或 `npm`）。

```bash
# 首先安装根目录核心进程依赖
npm install 

# 紧接着安装面板界面依赖
cd frontend && npm install
cd ..
```

### 启动集群调度器与控制台

我们预置了一键并发启动命令，将协同唤起后台的 9060 WebSocket/API 通信端口与控制面板的前端视图服务。

```bash
# 启动 CaptchaWorker
npm run dev
```

启动加载完毕后，使用浏览器访问控制面：
👉 [http://localhost:3000](http://localhost:3000)

## ⚙️ 业务系统对接

外部服务需要调用验证引擎生成 Token 防御通行证时，建议直接通过 Next.js 的路由请求端口进行映射转发取码：

```bash
curl -X POST http://localhost:3000/api/v1/solve \
  -H "Authorization: Bearer flow2api_secret" \
  -H "Content-Type: application/json" \
  -d '{"action": "IMAGE_GENERATION", "project_id": "test_app_id"}'
```

*(说明：授权密钥 `flow2api_secret` 可以在后端的环境配置层 `src/config.js` 进行修改更换)*

## 🔰 工具与拓展界面
在 CaptchaWorker Dashboard 内，提供以下能力区划：
- **仪表盘总览**：多维监控服务器进程集群池状态的 CPU、真实内存曲线以及业务队列健康进度。
- **代理节点库**：订阅规则匹配、单节点连接测速，随时加入心跳检测队列，一键清除无效代理。
- **实例集群库**：宏观俯瞰所有 Puppeteer 独立沙盒沙箱池，统计各容器累积阻截、放行及异常等处理指标量，可手动强制销毁卡死容器并自动补充。
- **打码追踪日志**：高亮汇总所有实例对项目发起人下发的实时流水线状态，轻松筛查或溯源异常业务流量端。

## 开源协议许可
MIT License
