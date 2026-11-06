# 任务与节点运维

任务页位于**集群运维**分组，节点运维面板从「节点」页每张卡的「运维」按钮打开。

## 任务

任务页的数据来自 `/nodes/{node}/tasks`，会并发拉取所有在线节点后合并排序，而不是只用首页那 40 条缓存。

### 筛选

| 筛选项 | 对应 PVE 参数 | 说明 |
| --- | --- | --- |
| 状态（全部 / 运行中 / 成功 / 失败） | `errors=1` | 仅「失败」会向服务端下推 |
| 节点 | 逐个节点请求 | 选具体节点时只请求该节点 |
| 时间范围 | `start` | 最近 1 小时 / 24 小时 / 7 天 / 全部 |
| 搜索框 | 本地过滤 | 类型、VMID、用户、UPID 全文 |

单次最多取 500 条（接口上限 1000）。某个节点读取失败不会让整页报错，而是记入顶部的黄色提示条，其余节点照常显示。

### 停止与清理

- **停止**：只对运行中的任务出现，调用 `DELETE /nodes/{node}/tasks/{upid}/status`。PVE 会让任务在下一个检查点退出，不是立即杀死进程。
- **删除记录**：先尝试停止（已结束的任务会返回 4xx，代码里直接忽略），再 `DELETE /nodes/{node}/tasks/{upid}`。删除只清除记录与日志，不影响已经执行的操作结果。

::: warning
备份、迁移、克隆这类任务中途停止可能留下不完整产物。停止前请确认对应的磁盘 / 快照状态。
:::

## 节点运维

「运维」按钮打开一个三页签面板，改动会立即写入该节点。

### 订阅

读取 `GET /nodes/{node}/subscription`，展示状态、产品级别、CPU 插槽数、服务器 ID 与下次检查时间。

| 状态 | 含义 |
| --- | --- |
| `active` | 密钥有效 |
| `expired` | 已过期，需续费 |
| `notfound` | 从未上传密钥 |
| `invalid` | 密钥格式或校验失败 |

未订阅的节点功能不受限，只是无法访问企业软件源与官方支持。

### 软件包

合并 `GET /nodes/{node}/apt/repositories` 与 `GET /nodes/{node}/apt/update`：

- **可升级列表**：包名、旧版本（划掉）、新版本。
- **软件源开关**：直接切换启用状态，改动后需点「保存仓库配置」。PVE 按文件整体写回，因此保存时按 `path` 分组提交。
- **刷新索引**：`POST /nodes/{node}/apt/update`，返回 UPID。
- **升级全部**：`POST /nodes/{node}/apt/upgrade`，同样返回 UPID，进度去任务页看。

::: tip
企业源在未订阅时会返回 401，属于预期行为。国内环境如果升级很慢，可以先把企业源关掉、只留 `deb.debian.org` 镜像。
:::

### 证书

| 操作 | 端点 |
| --- | --- |
| 读取当前证书 | `GET /nodes/{node}/certificates/info` |
| 读取自定义证书 PEM | `GET /nodes/{node}/certificates/custom?filename=...` |
| 上传 | `POST /nodes/{node}/certificates/custom` |
| 恢复自签 | `DELETE /nodes/{node}/certificates/custom` |

上传时同时提交证书链与私钥，两者都会做 PEM 格式预检（必须包含 `BEGIN CERTIFICATE` / `PRIVATE KEY`），避免把不完整内容写进节点导致 `pveproxy` 起不来。

- **强制替换**：忽略现有的待处理证书。
- **上传后重启 pveproxy**：默认开启。关闭后需要手动重启才能生效。

::: danger
`pveproxy` 重启期间 Web 界面会短暂断连。如果上传的证书链不完整，可能连恢复自签的入口都进不去，只能上控制台修 `/etc/pve/local/pveproxy-ssl.pem`。上传前请确认证书链顺序正确。
:::
