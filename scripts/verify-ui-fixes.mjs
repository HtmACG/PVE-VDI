/**
 * 界面改动的可视化验证：用系统 Edge + 本地静态服务渲染 out/renderer，
 * 通过 addInitScript 注入 window.pvevdi 假数据（无 preload 干扰），截图并断言关键样式。
 *
 * 运行：node scripts/verify-ui-fixes.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const root = process.cwd()
const outDir = path.join(root, 'screenshots', 'verify')
fs.mkdirSync(outDir, { recursive: true })

const rendererDir = path.join(root, 'out', 'renderer')
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
// 版本号从 package.json 读，别在 mock 里写死——写死过一次，界面显示 1.7.0 而实际发的是 1.8.x
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  const filePath = path.join(rendererDir, urlPath === '/' ? 'index.html' : urlPath)
  if (!filePath.startsWith(rendererDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

const GB = 1024 ** 3
const now = Date.now()

const makeSettings = (theme) => ({
  serverUrl: 'https://pve.example.com:8006',
  username: 'root@pam',
  allowSelfSigned: true,
  rememberPassword: false,
  hasSavedPassword: false,
  credentialStorageAvailable: true,
  theme,
  refreshInterval: 8,
  uiFont: 'inter',
  customFont: '',
  accentColor: '#0078d4',
  networkView: 'cards',
  launchAtLogin: false,
  notificationsEnabled: true,
  notifyVmShutdown: true,
  notifyTaskFailure: true,
  aiProvider: 'openai',
  aiBaseUrl: 'https://api.openai.com/v1',
  aiModel: 'gpt-4o-mini',
  aiPermission: 'confirm',
  hasAiApiKey: true,
  sidebarCollapsed: false,
  appearanceVersion: 2,
  appBackground: ''
})

const node = (name, cpu) => ({
  node: name,
  status: 'online',
  uptime: 86400 * 12,
  cpu,
  maxcpu: 16,
  mem: 20 * GB,
  maxmem: 64 * GB,
  disk: 200 * GB,
  maxdisk: 2000 * GB,
  level: '',
  sslFingerprint: '',
  loadavg: [0.4, 0.5, 0.6],
  pveVersion: '8.2.4',
  cpuModel: 'Intel Xeon Gold 6338',
  sockets: 2,
  cores: 16,
  memAvailable: 40 * GB,
  kernelVersion: '6.8.12-2-pve',
  // 造一组有区分度的按核负载：覆盖空载 / 轻载 / 中载 / 告警四档，验证颜色分档
  cpuCores: [
    0.02, 0.05, 0.0, 0.31, 0.28, 0.42, 0.03, 0.08, 0.61, 0.66, 0.04, 0.07, 0.88, 0.92, 0.01, 0.06
  ],
  metrics: [{ time: now - 60000, cpu, mem: 0.3 }]
})

const dashboard = {
  fetchedAt: now,
  latencyMs: 24,
  version: { version: '8.2.4', release: '8.2', repoid: '9bf1d1d4' },
  cluster: {
    name: 'pve-cluster',
    quorate: true,
    nodeCount: 3,
    version: 8,
    ha: [{ id: 'ha/node/pve', type: 'node', node: 'pve', status: 'online' }],
    keyboard: 'en-us',
    allowedTags: [],
    // 标题栏 / 服务器资源底栏显示的 PVE 地址
    serverUrl: 'https://pve.example.com:8006'
  },
  // PVE 账号总数，后端走 /access/users 去重计数
  userCount: 7,
  nodes: [node('pve', 0.083), node('pve2', 0.12), node('pve3', 0.05)],
  vms: [
    {
      node: 'pve',
      type: 'qemu',
      vmid: 204,
      name: 'DBI-Business-Server',
      id: 'qemu/204',
      status: 'running',
      template: false,
      cpu: 0.037,
      maxcpu: 8,
      mem: 8 * GB,
      maxmem: 16 * GB,
      uptime: 3600 * 72,
      tags: ['dbi'],
      ostype: 'l26',
      os: { family: 'linux', name: 'Linux', version: '10.1.2', source: 'agent' },
      console: { vnc: true, xterm: true, guestHost: '10.10.12.204', xtermBackend: 'guest-ssh', probedAt: Date.now() },
      haManaged: false,
      cpus: 4,
      disk: 132 * GB,
      maxdisk: 200 * GB,
      netin: 21.3 * GB,
      netout: 1.2 * GB,
      diskread: 1.2 * GB,
      diskwrite: 0.4 * GB,
      pid: 2211,
      lock: null
    },
    {
      node: 'pve',
      type: 'lxc',
      vmid: 118,
      name: 'cert-hub',
      id: 'lxc/118',
      status: 'running',
      template: false,
      cpu: 0.01,
      maxcpu: 2,
      mem: 0.5 * GB,
      maxmem: 2 * GB,
      uptime: 3600 * 20,
      tags: [],
      ostype: 'debian',
      os: { family: 'linux', name: 'Debian', version: '12', source: 'ostype' },
      console: { vnc: false, xterm: true, vncReason: 'LXC 容器没有图形界面，只能用终端控制台', probedAt: Date.now() },
      haManaged: false,
      cpus: 2,
      disk: 8 * GB,
      maxdisk: 20 * GB,
      netin: 1 * GB,
      netout: 0.3 * GB,
      diskread: 0.2 * GB,
      diskwrite: 0.1 * GB,
      pid: 912,
      lock: null
    }
  ],
  storages: [],
  tasks: [
    {
      upid: 'UPID:pve:0000A1B2:0012C3D4:65432100:qmstart:204:root@pam:',
      node: 'pve',
      type: 'qmstart',
      id: '204',
      user: 'root@pam',
      status: 'ok',
      startTime: 1761700000,
      endTime: 1761700012,
      duration: 12
    },
    {
      upid: 'UPID:pve:0000C3D4:0014E5F6:65432300:qmmigrate:204:root@pam:',
      node: 'pve',
      type: 'qmmigrate',
      id: '204',
      user: 'root@pam',
      status: 'error',
      rawStatus: 'migration aborted',
      startTime: 1761701000,
      endTime: 1761701060,
      duration: 60
    }
  ]
}

const detail = {
  ref: { node: 'pve', type: 'qemu', vmid: 204 },
  name: 'DBI-Business-Server',
  os: { family: 'linux', name: 'Linux', version: '10.1.2', source: 'agent' },
  console: { vnc: true, xterm: true, probedAt: Date.now() },
  config: {
    cores: 4,
    sockets: 1,
    memory: 16384,
    ostype: 'l26',
    agent: 1,
    bios: 'seabios',
    scsihw: 'virtio-scsi-pci',
    net0: 'virtio=BC:24:11:98:15:8E,bridge=vmbr0,tag=120,firewall=1',
    net1: 'virtio=BC:24:11:6E:E1:AE,bridge=vmbr1',
    scsi0: 'local-lvm:vm-204-disk-0,size=32G',
    scsi1: 'local-lvm:vm-204-disk-1,size=100G,backup=0'
  },
  runtime: {
    status: 'running',
    cpus: 4,
    cpu: 0.037,
    mem: 8.6 * GB,
    maxmem: 16 * GB,
    memhost: 9 * GB,
    balloon: 16 * GB,
    uptime: 259200,
    pid: 2211,
    qmpStatus: 'running',
    runningMachine: 'pc-q35-8.1',
    runningQemu: '8.1.5',
    tags: ['dbi', 'production'],
    haManaged: false,
    template: false,
    agentEnabled: true,
    pressureCpu: 1.4,
    pressureIo: 0.2,
    pressureMemory: 0.4,
    netin: 21.3 * GB,
    netout: 1.2 * GB,
    diskread: 1.2 * GB,
    diskwrite: 0.4 * GB
  },
  metrics: Array.from({ length: 40 }, (_, i) => ({
    time: now - (40 - i) * 90000,
    cpu: 0.02 + Math.random() * 0.06,
    mem: 7.5 * GB,
    maxmem: 16 * GB
  })),
  disks: [
    { key: 'scsi0', volume: 'local-lvm:vm-204-disk-0', size: 32 * GB, format: 'raw', options: [], isCdrom: false },
    { key: 'scsi1', volume: 'local-lvm:vm-204-disk-1', size: 100 * GB, format: 'raw', options: ['backup=0'], isCdrom: false }
  ],
  snapshots: [{ name: 'before-upgrade', snaptime: 1761700000, vmstate: false, description: '升级前基线' }],
  tasks: [
    {
      upid: 'UPID:mock:1',
      type: 'qmstart',
      status: 'ok',
      node: 'pve',
      user: 'root@pam',
      startTime: 1761700000,
      endTime: 1761700010,
      duration: 10,
      id: '204'
    }
  ],
  agentInterfaces: [
    {
      name: 'lo',
      mac: '00:00:00:00:00:00',
      ips: [
        { type: 'ipv4', address: '127.0.0.1', prefix: 8 },
        { type: 'ipv6', address: '::1', prefix: 128 }
      ],
      rxBytes: 167772160,
      txBytes: 167772160
    },
    {
      name: 'ens18',
      mac: 'bc:24:11:9b:15:8e',
      ips: [
        { type: 'ipv4', address: '10.10.12.120', prefix: 24 },
        { type: 'ipv6', address: 'fe80::be24:11ff:fe9b:158e', prefix: 64 }
      ],
      rxBytes: 342 * GB,
      txBytes: 21.3 * GB
    },
    {
      name: 'ens19',
      mac: 'bc:24:11:6e:e1:ae',
      ips: [{ type: 'ipv6', address: 'fe80::be24:11ff:fe6e:e1ae', prefix: 64 }],
      rxBytes: 883 * 1024 ** 2,
      txBytes: 866 * 1024 ** 2
    }
  ]
}

const imagesData = {
  images: [
    {
      node: 'pve',
      storage: 'local',
      volid: 'local:iso/debian-12.5.0-amd64-netinst.iso',
      name: 'debian-12.5.0-amd64-netinst.iso',
      size: 629 * 1024 ** 2,
      format: 'iso',
      ctime: 1761700000
    }
  ],
  storages: [{ node: 'pve', storage: 'local', content: 'iso', total: 1, used: 0, avail: 1, active: true }]
}

/** 新模块 mock：访问控制 / 存储 / 备份 / 防火墙 / HA */
const newModuleData = {
  access: {
    users: [
      {
        userid: 'root@pam',
        comment: '超级管理员',
        email: 'root@example.com',
        groups: ['ops'],
        enabled: true,
        domain: 'pam',
        realmType: 'pam',
        tokens: []
      },
      {
        userid: 'automation@pve',
        comment: 'CI 自动化',
        groups: ['ops', 'ci'],
        enabled: true,
        domain: 'pve',
        realmType: 'pve',
        tokens: [
          { tokenId: 'deploy', fullTokenId: 'automation@pve!deploy', privsep: false },
          { tokenId: 'readonly', fullTokenId: 'automation@pve!readonly', privsep: true }
        ]
      }
    ],
    groups: [
      { groupid: 'ops', comment: '运维组', users: ['root@pam', 'automation@pve'] },
      { groupid: 'ci', comment: '流水线', users: ['automation@pve'] }
    ],
    roles: [
      { roleid: 'PVEAdmin', privs: ['VM.Allocate', 'VM.Config.Disk', 'VM.PowerMgmt'], special: true },
      { roleid: 'PVEAuditor', privs: ['VM.Audit', 'Datastore.Audit'], special: true }
    ],
    acl: [
      { path: '/', ugid: 'ops', type: 'group', roleid: 'PVEAdmin', propagate: true },
      { path: '/vms/204', ugid: 'automation@pve', type: 'user', roleid: 'PVEAuditor', propagate: false }
    ],
    realms: ['pam', 'pve'],
    warnings: []
  },
  storage: {
    definitions: [
      {
        storage: 'local',
        type: 'dir',
        content: ['iso', 'vztmpl', 'backup'],
        path: '/var/lib/vz',
        shared: false,
        disable: false,
        options: {}
      },
      {
        storage: 'local-lvm',
        type: 'lvmthin',
        content: ['images', 'rootdir'],
        shared: false,
        disable: false,
        options: { vgname: 'pve', thinpool: 'data' }
      },
      {
        storage: 'nas-backup',
        type: 'nfs',
        content: ['backup'],
        path: '10.10.12.9:/backup',
        shared: true,
        disable: false,
        options: { server: '10.10.12.9' }
      }
    ],
    pools: [
      { poolid: 'prod', comment: '生产业务', members: [{ id: 'qemu/204', type: 'qemu', vmid: 204, node: 'pve' }] }
    ],
    warnings: []
  },
  storageContents: {
    node: 'pve',
    storage: 'local',
    contentType: '',
    entries: [
      {
        volid: 'local:iso/debian-12.5.0-amd64-netinst.iso',
        name: 'debian-12.5.0-amd64-netinst.iso',
        format: 'iso',
        contentType: 'iso',
        size: 629 * 1024 ** 2,
        used: 629 * 1024 ** 2,
        node: 'pve',
        storage: 'local',
        protected: false,
        ctime: 1761700000
      },
      {
        volid: 'local:backup/vzdump-qemu-204-2026_11_05-02_00_03.vma.zst',
        name: 'vzdump-qemu-204-2026_11_05-02_00_03.vma.zst',
        format: 'zst',
        contentType: 'backup',
        size: 42 * GB,
        used: 42 * GB,
        vmid: 204,
        node: 'pve',
        storage: 'local',
        protected: false,
        ctime: 1762293600
      }
    ],
    totalSize: 43 * GB,
    totalUsed: 43 * GB
  },
  backup: {
    files: [
      {
        volid: 'local:backup/vzdump-qemu-204-2026_11_05-02_00_03.vma.zst',
        filename: 'vzdump-qemu-204-2026_11_05-02_00_03.vma.zst',
        storage: 'local',
        node: 'pve',
        format: 'zst',
        size: 42 * GB,
        ctime: 1762293600,
        vmid: 204,
        guestType: 'qemu',
        encrypted: false
      },
      {
        volid: 'nas-backup:backup/vzdump-lxc-118-2026_11_04-02_00_01.tar.zst',
        filename: 'vzdump-lxc-118-2026_11_04-02_00_01.tar.zst',
        storage: 'nas-backup',
        node: 'pve',
        format: 'zst',
        size: 3.2 * GB,
        ctime: 1762207200,
        vmid: 118,
        guestType: 'lxc',
        encrypted: false
      }
    ],
    jobs: [
      {
        id: 'backup-1a2b3c4d',
        enabled: true,
        mode: 'snapshot',
        storage: 'nas-backup',
        schedule: 'daily 02:00',
        all: true,
        compress: 'zstd',
        comment: '每日全量',
        nextRun: 1762375200
      }
    ],
    totals: { count: 2, size: 45.2 * GB },
    warnings: []
  },
  firewall: {
    cluster: {
      scope: { level: 'cluster' },
      options: { enable: true, policyIn: 'DROP', policyOut: 'ACCEPT', extra: {} },
      rules: [
        {
          pos: 0,
          type: 'in',
          action: 'ACCEPT',
          proto: 'tcp',
          dport: '8006',
          source: '10.10.12.0/24',
          comment: '管理端口',
          enabled: true
        },
        {
          pos: 1,
          type: 'in',
          action: 'ACCEPT',
          proto: 'tcp',
          dport: '22',
          comment: 'SSH',
          enabled: true
        },
        {
          pos: 2,
          type: 'out',
          action: 'ACCEPT',
          proto: 'udp',
          dport: '53',
          comment: 'DNS',
          enabled: false
        }
      ],
      groups: [{ group: 'web-tier', comment: 'Web 层', ruleCount: 3 }],
      ipsets: [{ name: 'mgmt', comment: '管理网段' }],
      warnings: []
    }
  },
  ha: {
    resources: [
      {
        sid: 'vm:204',
        type: 'vm',
        state: 'started',
        group: 'production',
        maxRestart: 2,
        maxRelocate: 1,
        comment: '业务核心'
      },
      { sid: 'ct:118', type: 'ct', state: 'started', group: 'production' }
    ],
    groups: [{ group: 'production', nodes: 'pve:1,pve2:2', restricted: true, noFailback: true, comment: '生产组' }],
    statuses: [
      { id: 'vm:204', node: 'pve', status: 'started', type: 'service' },
      { id: 'ct:118', node: 'pve', status: 'started', type: 'service' }
    ],
    manager: null,
    warnings: []
  },
  taskList: {
    tasks: [
      {
        upid: 'UPID:pve:0000A1B2:0012C3D4:65432100:qmstart:204:root@pam:',
        node: 'pve',
        type: 'qmstart',
        id: '204',
        user: 'root@pam',
        status: 'ok',
        startTime: 1761700000,
        endTime: 1761700012,
        duration: 12
      },
      {
        upid: 'UPID:pve2:0000B2C3:0013D4E5:65432200:vzdump:205:root@pam:',
        node: 'pve2',
        type: 'vzdump',
        id: '205',
        user: 'root@pam',
        status: 'running',
        startTime: 1761700500,
        duration: 90
      },
      {
        upid: 'UPID:pve:0000C3D4:0014E5F6:65432300:qmmigrate:204:root@pam:',
        node: 'pve',
        type: 'qmmigrate',
        user: 'root@pam',
        status: 'error',
        rawStatus: 'migration aborted',
        startTime: 1761701000,
        endTime: 1761701060,
        duration: 60
      }
    ],
    warnings: []
  },
  subscription: {
    status: 'active',
    level: 'c',
    key: 'pve1c-2b7f9d4e5a6c',
    message: 'Subscription is valid.',
    serverid: 'a1b2c3d4',
    sockets: 2,
    nextDueDate: 1793236000,
    productName: 'Proxmox VE Standard'
  },
  nodeApt: {
    node: 'pve',
    repositories: [
      {
        path: '/etc/apt/sources.list.d/debian.sources',
        fileType: 'sources',
        index: 0,
        enabled: true,
        components: ['main', 'contrib'],
        uris: ['http://deb.debian.org/debian'],
        suites: ['bookworm'],
        types: ['deb']
      },
      {
        path: '/etc/apt/sources.list.d/pve-enterprise.sources',
        fileType: 'sources',
        index: 1,
        enabled: false,
        components: ['pve-enterprise'],
        uris: ['https://enterprise.proxmox.com/debian/pve'],
        suites: ['bookworm'],
        types: ['deb'],
        warning: '未订阅时该源不可用'
      }
    ],
    updates: [
      { package: 'libpve-common-perl', oldVersion: '8.2.1', version: '8.2.3', description: 'PVE common libraries' },
      { package: 'pve-manager', oldVersion: '8.2.4', version: '8.2.6', description: 'Proxmox VE manager' }
    ],
    standardRepo: true,
    enterpriseRepo: false,
    warnings: []
  },
  nodeCertificate: {
    node: 'pve',
    custom: true,
    pem: '-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUZZ...\n-----END CERTIFICATE-----',
    info: {
      filename: 'pveproxy-ssl.pem',
      subject: 'CN=pve.example.com',
      issuer: 'CN=Example Intermediate CA, O=Example Org',
      fingerprint: 'AB:CD:EF:01:23:45:67:89',
      notbefore: 1760000000,
      notafter: 1791536000,
      publicKeyType: 'RSA',
      publicKeyBits: 2048,
      san: ['pve.example.com', '10.10.12.60']
    },
    warnings: []
  },
  sdn: {
    zones: [
      {
        zone: 'labnet',
        type: 'simple',
        bridge: 'vmbr0',
        mtu: 1500,
        nodes: ['pve', 'pve2', 'pve3'],
        pending: false,
        state: 'ok'
      },
      {
        zone: 'vxlantest',
        type: 'vxlan',
        vxlanId: 10000,
        mtu: 1450,
        peers: ['10.10.12.11', '10.10.12.12'],
        pending: true
      }
    ],
    vnets: [
      { vnet: 'lab10', zone: 'labnet', tag: 10, alias: '业务网段', pending: false },
      { vnet: 'vx10', zone: 'vxlantest', alias: '跨节点覆盖网络', vlanaware: true, pending: true }
    ],
    subnets: [
      {
        subnet: '10.10.10.0/24',
        zone: 'labnet',
        vnet: 'lab10',
        gateway: '10.10.10.1',
        snat: true,
        dhcpRange: { start: '10.10.10.100', end: '10.10.10.199' }
      },
      { subnet: '10.20.0.0/24', zone: 'vxlantest', vnet: 'vx10', gateway: '10.20.0.1', pending: true }
    ],
    enabled: true,
    pending: true,
    warnings: []
  },
  nodeSettings: {
    node: 'pve',
    network: [
      { iface: 'vmbr0', type: 'bridge', active: true, exists: true, autostart: true, address: '10.10.12.60/24' },
      { iface: 'eth0', type: 'eth', active: true, exists: true, autostart: true }
    ],
    dns: { search: 'example.com', dns1: '223.5.5.5', dns2: '' },
    time: { timezone: 'Asia/Shanghai', localtime: 1762400000, time: '10:30' },
    config: { description: '验证节点' },
    certificates: [],
    repositories: null,
    firewallOptions: null,
    lvm: [],
    lvmthin: [],
    directories: [],
    zfs: [],
    warnings: []
  },
  nodeHardware: {
    node: 'pve',
    manufacturer: 'Dell Inc.',
    productName: 'PowerEdge R740',
    cpuModel: 'Intel Xeon Silver 4210R',
    temperatures: [],
    disks: [
      {
        devpath: '/dev/sda',
        model: 'PERC H730P',
        serial: 'WD-WCC4N1234567',
        size: 447 * GB,
        type: 'hdd',
        health: 'PASSED',
        used: 'LVM',
        vendor: 'DELL',
        rpm: 7200,
        temperature: 34
      },
      {
        devpath: '/dev/nvme0n1',
        model: 'SAMSUNG MZQLB960HAJR',
        serial: 'S3KJNX0M123456',
        size: 894 * GB,
        type: 'ssd',
        health: 'PASSED',
        wearout: 2,
        vendor: 'SAMSUNG',
        temperature: 41
      }
    ],
    warnings: [],
    collectedAt: 1762400000
  },
  clusterJoin: {
    selfNode: 'pve',
    clusterName: 'cluster-a',
    nodes: [
      { name: 'pve', nodeid: 1, ring0: '10.10.12.60', votes: 1, online: true },
      { name: 'pve2', nodeid: 2, ring0: '10.10.12.61', votes: 1, online: true },
      { name: 'pve3', nodeid: 3, ring0: '10.10.12.62', votes: 1, online: true }
    ],
    configDigest: 'abc123',
    warnings: []
  }
}

/** 主窗口 mock：页面脚本执行前注入 window.pvevdi */
function mainMock(payload) {
  // addInitScript 会序列化函数体，数据通过第二个参数（payload）注入
  const { theme, dashboard, detail, imagesData, newModuleData, sshBootstrap } = payload
  const ok = (data) => Promise.resolve({ ok: true, data })
  let aiStreamListener = null
  const listeners = new Set()
  const sshListeners = new Set()
  const mockSshSessions = []
  let current = { serverUrl: 'https://pve.example.com:8006', username: 'root@pam', allowSelfSigned: true, rememberPassword: false, hasSavedPassword: false, credentialStorageAvailable: true, theme: theme, refreshInterval: 8, uiFont: 'inter', customFont: '', accentColor: '#0078d4', networkView: 'cards', launchAtLogin: false, notificationsEnabled: true, notifyVmShutdown: true, notifyTaskFailure: true, aiProvider: 'openai', aiBaseUrl: 'https://api.openai.com/v1', aiModel: 'gpt-4o-mini', aiPermission: 'confirm', hasAiApiKey: true, sidebarCollapsed: false, appearanceVersion: 2, appBackground: '' }
  Object.defineProperty(window, 'pvevdi', {
    configurable: true,
    writable: true,
    value: {
      bootstrap: () =>
        ok({
          appVersion: payload.appVersion,
          settings: current,
          backgrounds: {},
          session: {
            serverUrl: 'https://pve.example.com:8006',
            username: 'root@pam',
            clusterName: 'pve-cluster',
            connectedAt: Date.now()
          },
          autoLoginError: null
        }),
      dashboard: () => ok(dashboard),
      // 独立 SSH 窗口的启动上下文
      sshWindowBootstrap: () => (sshBootstrap ? ok(sshBootstrap) : Promise.resolve({ ok: false, error: { message: 'not an ssh window' } })),
      openSshWindow: (input) => {
        window.__lastSshWindowOpen = input ?? null
        return ok(null)
      },
      liveMetrics: () => ok({ fetchedAt: Date.now(), nodes: [] }),
      vmDetail: () => ok(detail),
      vmSnapshot: (input) =>
        ok({
          name: input.name ?? input.rollback ?? input.delete ?? 'snapshot',
          upid: 'UPID:mock:snapshot',
          message: input.delete
            ? `快照「${input.delete}」已删除。`
            : input.rollback
              ? `已回滚到「${input.rollback}」。`
              : `快照「${input.name}」创建任务已提交。`
        }),
      vmMigrate: () => ok({ upid: 'UPID:mock:migrate', message: '迁移任务已提交。' }),
      vmTemplate: () => ok({ upid: 'UPID:mock:template', message: '已提交转为模板。' }),
      vmCloudInit: () => ok({ message: 'cloud-init 配置已写入。', upid: 'UPID:mock:ci', warnings: [] }),
      vmSendKey: () => ok(undefined),
      taskList: () => ok(newModuleData.taskList),
      taskStop: () => ok(undefined),
      taskDelete: () => ok(undefined),
      subscriptionInfo: () => ok(newModuleData.subscription),
      subscriptionUpdate: () => ok(undefined),
      subscriptionDelete: () => ok(undefined),
      nodeApt: () => ok(newModuleData.nodeApt),
      nodeAptRefresh: () => ok({ node: 'pve', upid: 'UPID:mock:apt', message: '软件包索引已刷新。' }),
      nodeAptRepoSave: () => ok(undefined),
      nodeCertificate: () => ok(newModuleData.nodeCertificate),
      nodeCertificateUpload: () => ok(undefined),
      nodeCertificateReset: () => ok(undefined),
      isoImages: () => ok(imagesData),
      updatePreferences: (patch) => {
        current = { ...current, ...patch }
        for (const fn of listeners) fn(current)
        return ok(current)
      },
      testNotification: () => ok(undefined),
      aiChat: async (input) => {
        for (const delta of [
          '## 集群状态\n\n',
          '- **节点**：3 个在线\n',
          '- **虚拟机**：3 台运行\n'
        ]) {
          aiStreamListener?.({ conversationId: input.conversationId, delta })
          await new Promise((resolve) => setTimeout(resolve, 180))
        }
        return ok({
          status: 'message',
          reply: '## 集群状态\n\n- **节点**：3 个在线\n- **虚拟机**：3 台运行\n- 最近任务：没有失败\n\n> 这是 mock AI 的回复。',
          events: [
            {
              id: 'ai-evt-1',
              tool: 'get_cluster_overview',
              title: '查询集群概览',
              risk: 'read',
              status: 'ok',
              summary: '读取节点、虚拟机与任务概览'
            }
          ]
        })
      },
      aiApprove: () => ok({ status: 'message', reply: '已按确认执行（mock）。', events: [] }),
      aiReset: () => ok(null),
      onAiStream: (fn) => {
        aiStreamListener = fn
        return () => {
          if (aiStreamListener === fn) aiStreamListener = null
        }
      },
      taskLog: (_node, upid) =>
        String(upid).includes('qmmigrate')
          ? ok([])
          : ok([
              { n: 1, t: 'TASK OK' },
              { n: 2, t: 'finished' }
            ]),
      taskStatus: (_node, upid) =>
        ok({
          upid: String(upid),
          status: 'stopped',
          exitStatus: String(upid).includes('qmmigrate') ? 'migration aborted' : 'OK'
        }),
      aiTest: () =>
        ok({ ok: true, provider: 'openai', model: 'gpt-4o-mini', message: 'OK', latencyMs: 12 }),
      onSettingsChanged: (fn) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
      getWindowState: () => Promise.resolve({ maximized: false }),
      onWindowState: () => () => {},
      windowMinimize: () => {},
      windowHide: () => {},
      windowToggleMaximize: () => {},
      windowClose: () => {},
      openConsoleWindow: () => ok(null),
      openExternal: () => ok(null),
      // SSH：返回假的会话与目录列表，供界面断言
      sshProbe: () => ok({ ok: true, message: 'SSH 可用，检测到 48 个线程', host: 'pve.example.com', port: 22, username: 'root' }),
      sshShellOpen: (input) => {
        const sessionId = 'ssh-mock-' + Date.now()
        mockSshSessions.push(sessionId)
        // 模拟主进程推送 banner，让终端里真的出现字符
        setTimeout(() => {
          for (const listener of sshListeners) {
            listener({
              type: 'data',
              sessionId,
              data: 'Welcome to Proxmox VE 8.2.4\r\nroot@pve1:~# '
            })
          }
        }, 120)
        return ok({
          sessionId,
          host: 'pve.example.com',
          username: 'root',
          title: 'root@pve1',
          createdAt: Date.now(),
          cols: input?.cols ?? 120,
          rows: input?.rows ?? 32,
          transport: input?.vm ? 'guest-ssh' : 'ssh'
        })
      },
      sshShellList: () => ok([]),
      sshShellWrite: () => ok(null),
      sshShellResize: () => ok(null),
      sshShellClose: () => ok(null),
      onSshShellEvent: (fn) => {
        sshListeners.add(fn)
        return () => sshListeners.delete(fn)
      },
      sshFsList: (input) => {
        ;(window.__sshFsCalls ??= []).push(input ?? {})
        return ok({
          path: input?.path ?? '/root',
          home: '/root',
          entries: [
            { name: '.config', path: '/root/.config', type: 'dir', size: 0, mtime: Date.now() - 86400000 },
            { name: 'iso', path: '/root/iso', type: 'dir', size: 0, mtime: Date.now() - 7200000 },
            { name: '.bashrc', path: '/root/.bashrc', type: 'file', size: 3107, mtime: Date.now() - 2592000000 },
            { name: '.bash_logout', path: '/root/.bash_logout', type: 'file', size: 220, mtime: Date.now() - 2592000000 },
            { name: 'docker-entrypoint.sh', path: '/root/docker-entrypoint.sh', type: 'file', size: 6862, mtime: Date.now() - 604800000 }
          ]
        })
      },
      sshFsRead: (input) => {
        const payload = {
          path: input?.path ?? '/root/.bashrc',
          size: 3107,
          text: '# ~/.bashrc\nexport PATH=$PATH:/usr/sbin\n',
          truncated: false,
          binary: false,
          mtime: Date.now()
        }
        return ok(payload)
      },
      sshFsWrite: () => ok({ path: '/root/.bashrc', size: 40 }),
      sshFsCreateFile: (input) => ok({ path: input?.path }),
      sshFsCreateDir: (input) => ok({ path: input?.path }),
      sshFsRemove: (input) => ok({ path: input?.path }),
      sshFsRename: (input) => ok({ from: input?.from, to: input?.to }),
      sshFsUpload: () => ok(null),
      sshFsDownload: () => ok(null),
      // 新模块
      accessOverview: () => ok(newModuleData.access),
      accessUserSave: () => ok(null),
      accessUserDelete: () => ok(null),
      accessGroupSave: () => ok(null),
      accessGroupDelete: () => ok(null),
      accessAclUpdate: () => ok(null),
      accessTokenSave: () =>
        ok({
          tokenId: 'deploy',
          fullTokenId: 'automation@pve!deploy',
          value: 'a1b2c3d4-0000-4000-8000-abcdefabcdef',
          message: '令牌已创建。'
        }),
      accessTokenDelete: () => ok(null),
      storageOverview: () => ok(newModuleData.storage),
      storageContents: () => ok(newModuleData.storageContents),
      storageDefinitionSave: () => ok(null),
      storageContentDelete: () => ok({ upid: 'UPID:pve:0001', message: '已删除' }),
      poolSave: () => ok(null),
      poolMemberUpdate: () => ok(null),
      backupOverview: () => ok(newModuleData.backup),
      backupStart: () => ok({ upid: 'UPID:pve:0002', message: '备份任务已提交' }),
      backupJobSave: () => ok(null),
      backupRestore: () => ok({ upid: 'UPID:pve:0003', message: '还原任务已提交' }),
      firewallOverview: (scope) => ok({ ...newModuleData.firewall.cluster, scope }),
      firewallRuleSave: () => ok(null),
      firewallOptionsSave: () => ok(null),
      firewallAliasSave: () => ok(null),
      haOverview: () => ok(newModuleData.ha),
      haResourceSave: () => ok(null),
      haGroupSave: () => ok(null),
      sdnOverview: () => ok(newModuleData.sdn),
      sdnZoneSave: () => ok(null),
      sdnVnetSave: () => ok(null),
      sdnSubnetSave: () => ok(null),
      sdnApply: () => ok(null),
      clusterJoinInfo: () => ok(newModuleData.clusterJoin),
      clusterJoin: () => ok(null),
      clusterNodeRemove: () => ok(null),
      nodeSettings: () => ok(newModuleData.nodeSettings),
      nodeHardware: () => ok(newModuleData.nodeHardware),
      diskInit: () => ok(null)
    }
  })
}

/** 控制台窗口 mock */
function consoleMock(payload) {
  const { theme } = payload
  const ok = (data) => Promise.resolve({ ok: true, data })
  const listeners = new Set()
  let current = { theme, accentColor: '#4cc2ff', uiFont: 'inter', customFont: '' }
  Object.defineProperty(window, 'pvevdi', {
    configurable: true,
    writable: true,
    value: {
      bootstrap: () => ok({ settings: current }),
      consoleWindowBootstrap: () =>
        ok({
          request: { kind: 'vm', node: 'pve', type: 'qemu', vmid: 300, name: 'DevOps-Server' },
          settings: current
        }),
      consoleOpen: () =>
        ok({
          sessionId: 'mock',
          mode: 'novnc',
          wsUrl: 'ws://127.0.0.1:1/none',
          vncPassword: '',
          title: 'DevOps-Server',
          subtitle: 'pve · QEMU 300 · noVNC',
          username: 'root@pam'
        }),
      consoleClose: () => ok(null),
      updatePreferences: (patch) => {
        current = { ...current, ...patch }
        for (const fn of listeners) fn(current)
        return ok(current)
      },
      testNotification: () => ok(undefined),
      aiChat: () =>
        ok({
          status: 'message',
          reply: '## 集群状态\n\n- **节点**：3 个在线\n- **虚拟机**：3 台运行\n- 最近任务：没有失败\n\n> 这是 mock AI 的回复。',
          events: [
            {
              id: 'ai-evt-1',
              tool: 'get_cluster_overview',
              title: '查询集群概览',
              risk: 'read',
              status: 'ok',
              summary: '读取节点、虚拟机与任务概览'
            }
          ]
        }),
      aiApprove: () => ok({ status: 'message', reply: '已按确认执行（mock）。', events: [] }),
      aiReset: () => ok(null),
      onAiStream: () => () => {},
      taskLog: (_node, upid) =>
        String(upid).includes('qmmigrate')
          ? ok([])
          : ok([
              { n: 1, t: 'TASK OK' },
              { n: 2, t: 'finished' }
            ]),
      taskStatus: (_node, upid) =>
        ok({
          upid: String(upid),
          status: 'stopped',
          exitStatus: String(upid).includes('qmmigrate') ? 'migration aborted' : 'OK'
        }),
      aiTest: () =>
        ok({ ok: true, provider: 'openai', model: 'gpt-4o-mini', message: 'OK', latencyMs: 12 }),
      onSettingsChanged: (fn) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
      getWindowState: () => Promise.resolve({ maximized: false }),
      onWindowState: () => () => {},
      windowMinimize: () => {},
      windowToggleMaximize: () => {},
      windowClose: () => {}
    }
  })
}

const results = []
const check = (name, pass, extra = '') => results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
const shot = async (page, name) => {
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(outDir, name) })
}

const browser = await chromium.launch({ executablePath: edgePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 })
const logs = []

try {
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') logs.push(`[console] ${m.text()}`)
  })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  await page.addInitScript(mainMock, { appVersion: APP_VERSION, theme: 'light', dashboard, detail, imagesData, newModuleData })
  await page.goto(`http://127.0.0.1:${port}/index.html`)
  try {
    await page.waitForSelector('text=DBI-Business-Server', { timeout: 25_000 })
  } catch (error) {
    console.log('RENDER_LOGS://n' + logs.slice(0, 12).join('\n'))
    console.log('BODY://n' + (await page.evaluate(() => document.body.innerText)).slice(0, 600))
    await page.screenshot({ path: path.join(outDir, 'diag.png') })
    throw error
  }
  await page.waitForTimeout(1300)
  await shot(page, '02-overview-light.png')

  // ── 标题栏：左上角只留品牌 + 版本号 ──────────────────────────────
  // 需求：logo 处加版本号，撤掉 IP 与设备（集群）名。
  const titlebar = await page.evaluate(() => {
    const header = document.querySelector('header')
    if (!header) return null
    const text = header.innerText.replace(/\s+/g, ' ').trim()
    return {
      text,
      hasVersion: /v\d+\.\d+\.\d+/.test(text),
      hasIp: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(text),
      hasProto: /https?:\/\//.test(text),
      // 集群名来自 mock 的 cluster.name
      hasClusterName: text.includes('pve-cluster')
    }
  })
  check(
    '标题栏显示软件版本号（与 package.json 一致）',
    Boolean(titlebar?.hasVersion) && titlebar.text.includes(`v${APP_VERSION}`),
    JSON.stringify({ expect: `v${APP_VERSION}`, text: titlebar?.text })
  )
  check(
    '标题栏不再显示 PVE 地址',
    Boolean(titlebar) && !titlebar.hasIp && !titlebar.hasProto,
    JSON.stringify({ hasIp: titlebar?.hasIp, text: titlebar?.text })
  )
  check('标题栏不再显示设备（集群）名称', Boolean(titlebar) && !titlebar.hasClusterName, JSON.stringify(titlebar))

  // ── 顶部四张统计卡：节点 / 运行中虚拟机 / LXC 容器 / 用户数量 ─────
  const statCards = await page.evaluate(() => {
    // StatCard 根节点：带 bg-card 的方框，内部第一行是 12px 的指标名
    const cards = [...document.querySelectorAll('div.border.border-border.bg-card')]
      .filter((el) => el.querySelector('.font-mono.text-\\[26px\\]'))
      .map((el) => {
        const label = el.querySelector('.text-\\[12px\\].font-medium')?.textContent?.trim() ?? ''
        const value = el.querySelector('.font-mono.text-\\[26px\\]')?.textContent?.trim() ?? ''
        return { label, value, text: el.innerText.replace(/\s+/g, ' ').trim() }
      })
    return {
      labels: cards.map((c) => c.label),
      cards,
      hasLxc: cards.some((c) => c.label === 'LXC 容器'),
      hasUser: cards.some((c) => c.label === '用户数量'),
      // 被替换掉的两张不该再出现在这一排
      hasCpuCard: cards.some((c) => c.label === 'CPU 使用率'),
      hasMemCard: cards.some((c) => c.label === '内存使用率')
    }
  })
  check(
    '顶部统计卡为 节点 / 虚拟机 / LXC 容器 / 用户数量',
    statCards.labels.length === 4 &&
      statCards.labels[0] === '节点' &&
      statCards.labels[1] === '运行中虚拟机' &&
      statCards.labels[2] === 'LXC 容器' &&
      statCards.labels[3] === '用户数量',
    JSON.stringify(statCards.labels)
  )
  check('顶部「CPU 使用率」卡片已替换为 LXC 容器', statCards.hasLxc && !statCards.hasCpuCard, JSON.stringify(statCards.labels))
  check(
    '顶部「内存使用率」卡片已替换为用户数量',
    statCards.hasUser && !statCards.hasMemCard,
    JSON.stringify(statCards.labels)
  )
  // mock 里只有 1 个 LXC（vmid 118，running），四张卡里应有 1 / 1
  check(
    'LXC 容器卡片计数正确（1 运行 / 共 1）',
    statCards.cards.find((c) => c.label === 'LXC 容器')?.text.includes('1') ?? false,
    JSON.stringify(statCards.cards.find((c) => c.label === 'LXC 容器'))
  )
  // mock 的 userCount = 7，卡片应显示 7 而不是占位符「—」
  const userCard = statCards.cards.find((c) => c.label === '用户数量')
  check('用户数量卡片取到真实账号数（7）', userCard?.value === '7', JSON.stringify(userCard))
  // 服务器资源底栏第一格应为「PVE 地址」，值是去掉协议头的地址
  const pveAddr = await page.evaluate(() => {
    const label = [...document.querySelectorAll('div')].find(
      (el) => el.children.length === 0 && el.textContent?.trim() === 'PVE 地址'
    )
    if (!label) return null
    const value = label.nextElementSibling?.textContent?.trim() ?? ''
    return { label: 'PVE 地址', value }
  })
  check('服务器资源底栏显示 PVE 地址（不再是 CPU 型号）', pveAddr?.value === 'pve.example.com:8006', JSON.stringify(pveAddr))

  // 侧栏不再有「新建虚拟机」按钮
  const sidebarProbe = await page.evaluate(() => {
    const aside = document.querySelector('aside')
    if (!aside) return null
    const labels = [...aside.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '')
    const navLabels = [...aside.querySelectorAll('nav button')].map((b) => b.textContent?.trim() ?? '')
    return { hasCreate: labels.some((t) => t.includes('新建虚拟机')), firstItem: navLabels[0] }
  })
  check('侧栏已移除「新建虚拟机」按钮', Boolean(sidebarProbe) && !sidebarProbe.hasCreate, JSON.stringify(sidebarProbe))
  check('侧栏首项为导航（总览）', Boolean(sidebarProbe) && sidebarProbe.firstItem === '总览', JSON.stringify(sidebarProbe))

  // 软件设置 → 首选项（名字改了，避免和「节点设置」混淆）
  const sidebarSettings = await page.evaluate(() => {
    const aside = document.querySelector('aside')
    if (!aside) return null
    const labels = [...aside.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '')
    return { hasPreference: labels.includes('首选项'), hasSettings: labels.includes('设置'), labels }
  })
  check('侧栏底部入口改名为「首选项」', Boolean(sidebarSettings?.hasPreference), JSON.stringify(sidebarSettings))
  check('侧栏不再出现仅写「设置」的入口', Boolean(sidebarSettings) && !sidebarSettings.hasSettings, JSON.stringify(sidebarSettings?.labels))

  // 服务器资源三块改为 ECharts 仪表盘
  const gauges = await page.evaluate(() => {
    const holder = document.querySelector('[aria-label^="CPU 使用率"]')?.parentElement?.parentElement
    const canvases = holder ? [...holder.querySelectorAll('canvas')] : []
    const labels = [...document.querySelectorAll('[role="img"][aria-label]')]
      .map((el) => el.getAttribute('aria-label') ?? '')
      .filter((label) => /^(CPU 使用率|内存使用|根磁盘使用) /.test(label))
    return {
      canvasCount: canvases.length,
      widths: canvases.map((c) => c.width),
      heights: canvases.map((c) => c.height),
      labels,
      // 仪表盘画布必须有像素内容，否则说明 echarts 没画出来
      painted: canvases.every((c) => {
        const ctx = c.getContext('2d')
        if (!ctx) return false
        const data = ctx.getImageData(0, 0, c.width, c.height).data
        for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true
        return false
      })
    }
  })
  check('服务器资源渲染 3 个仪表盘画布', gauges.canvasCount === 3, JSON.stringify({ count: gauges.canvasCount }))
  check(
    '仪表盘画布已绘制内容（非空白）',
    gauges.painted && gauges.widths.every((w) => w > 0),
    JSON.stringify({ painted: gauges.painted, widths: gauges.widths })
  )
  check(
    '仪表盘覆盖 CPU / 内存 / 根磁盘三项',
    gauges.labels.length === 3 &&
      gauges.labels.some((l) => l.startsWith('CPU 使用率')) &&
      gauges.labels.some((l) => l.startsWith('内存使用')) &&
      gauges.labels.some((l) => l.startsWith('根磁盘使用')),
    JSON.stringify(gauges.labels)
  )

  // 按核负载格子：数量 = 核心数，底色 = 负载档位，位置在「CPU 负载」标题上方
  const coreGrid = await page.evaluate(() => {
    const grid = [...document.querySelectorAll('[role="img"][aria-label*="线程负载"]')].find((el) =>
      el.getAttribute('aria-label')?.includes('线程负载')
    )
    if (!grid) return null
    const cells = [...grid.querySelectorAll('[data-core]')]
    const tones = cells.map((cell) => {
      const style = getComputedStyle(cell)
      return { index: Number(cell.getAttribute('data-core')), load: cell.getAttribute('data-load'), bg: style.backgroundColor }
    })

    // 找出「CPU 负载」这个标题元素，比较纵向位置
    const heading = [...document.querySelectorAll('div')].find(
      (el) => el.children.length === 0 && el.textContent?.trim() === 'CPU 负载'
    )
    const gridBox = grid.getBoundingClientRect()
    const headingBox = heading?.getBoundingClientRect() ?? null

    return {
      label: grid.getAttribute('aria-label'),
      count: cells.length,
      sized: cells.every((cell) => {
        const box = cell.getBoundingClientRect()
        return box.width > 0 && box.height > 0
      }),
      distinctTones: new Set(tones.map((tone) => tone.bg)).size,
      heavyTone: tones.find((tone) => Number(tone.load) >= 0.85)?.bg ?? '',
      idleTone: tones.find((tone) => Number(tone.load) === 0)?.bg ?? '',
      aboveChart: Boolean(headingBox) && gridBox.bottom <= headingBox.top + 1,
      sample: tones.slice(0, 4)
    }
  })

  check('按核负载格子已渲染 16 个格子', coreGrid?.count === 16, JSON.stringify({ count: coreGrid?.count }))
  check('每个格子都有实际尺寸', Boolean(coreGrid?.sized), JSON.stringify({ sized: coreGrid?.sized }))
  const cellBox = await page.evaluate(() => {
    const grid = [...document.querySelectorAll('[role="img"]')].find((el) =>
      el.getAttribute('aria-label')?.includes('线程负载')
    )
    const cell = grid?.querySelector('[data-core]')
    if (!cell) return null
    const box = cell.getBoundingClientRect()
    const gridBox = grid.getBoundingClientRect()
    return {
      w: Math.round(box.width * 10) / 10,
      h: Math.round(box.height * 10) / 10,
      gridW: Math.round(gridBox.width),
      gridH: Math.round(gridBox.height),
      cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length
    }
  })
  check(
    '格子为 12px 见方（宽高一致）',
    Boolean(cellBox) && Math.abs(cellBox.w - cellBox.h) < 1.5 && Math.abs(cellBox.w - 12) < 1.5,
    JSON.stringify(cellBox)
  )
  check('格子排成单行 16 列', cellBox?.cols === 16, JSON.stringify({ cols: cellBox?.cols }))
  check('格子按负载分出多个色档', (coreGrid?.distinctTones ?? 0) >= 3, JSON.stringify({ tones: coreGrid?.distinctTones }))
  check(
    '满载格子与空载格子颜色不同',
    Boolean(coreGrid) && coreGrid.heavyTone !== '' && coreGrid.idleTone !== '' && coreGrid.heavyTone !== coreGrid.idleTone,
    JSON.stringify({ heavy: coreGrid?.heavyTone, idle: coreGrid?.idleTone })
  )
  check('按核格子位于「CPU 负载」标题上方', Boolean(coreGrid?.aboveChart), JSON.stringify({ above: coreGrid?.aboveChart }))
  check(
    '按核格子带可读的 aria 描述',
    Boolean(coreGrid?.label) && /16 线程负载.*个线程高于 35%/.test(coreGrid?.label ?? ''),
    JSON.stringify({ label: coreGrid?.label })
  )

  const gaugeTheme = await page.evaluate(() => {
    const host = document.querySelector('[aria-label^="CPU 使用率"]')
    const canvas = host?.querySelector('canvas')
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    // 取最亮的像素亮度，浅色主题下文字应为深色、背景为浅色
    let bright = 0
    let opaque = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      opaque += 1
      bright = Math.max(bright, 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    }
    return { bright, opaque }
  })
  check('浅色主题下仪表盘有可见像素', Boolean(gaugeTheme) && gaugeTheme.opaque > 500, JSON.stringify(gaugeTheme))

  const themeClass = await page.evaluate(() => document.documentElement.className)
  check('主界面应用浅色主题', themeClass.includes('light'), `className=${themeClass}`)

  // 镜像页：刷新 / 从 URL 导入 必须是实底白
  await page.getByRole('button', { name: /^镜像/ }).first().click()
  await page.waitForTimeout(1200)
  const buttonStyles = await page.evaluate(() => {
    const pick = (text) => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
      if (!btn) return null
      const cs = getComputedStyle(btn)
      return { bg: cs.backgroundColor, color: cs.color }
    }
    return { refresh: pick('刷新'), url: pick('从 URL 导入'), upload: pick('上传 ISO') }
  })
  check('“刷新”按钮为实底白', buttonStyles.refresh?.bg === 'rgb(255, 255, 255)', JSON.stringify(buttonStyles.refresh))
  check('“从 URL 导入”按钮为实底白', buttonStyles.url?.bg === 'rgb(255, 255, 255)', JSON.stringify(buttonStyles.url))
  await shot(page, '03-images-light.png')

  // 虚拟机抽屉
  await page.getByRole('button', { name: /^虚拟机/ }).first().click()
  await page.waitForTimeout(900)
  await page.locator('tbody tr', { hasText: 'DBI-Business-Server' }).first().click()
  await page.waitForSelector('text=性能遥测', { timeout: 20_000 })
  await shot(page, '04-drawer-light-overview.png')

  await page.getByRole('tab', { name: '网络' }).click()
  await shot(page, '05-drawer-light-network.png')

  await page.getByRole('tab', { name: '硬件' }).click()
  await shot(page, '06-drawer-light-hardware.png')

  const layout = await page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"]')
    if (!sheet) return null
    const r = sheet.getBoundingClientRect()
    const scroller = sheet.querySelector('.overflow-y-auto')
    return {
      width: Math.round(r.width),
      scrollW: scroller ? scroller.scrollWidth : 0,
      clientW: scroller ? scroller.clientWidth : 0
    }
  })
  check('抽屉宽度适中（≤780px）', Boolean(layout) && layout.width <= 780, JSON.stringify(layout))
  check('抽屉内容无横向溢出', Boolean(layout) && layout.scrollW <= layout.clientW + 1, JSON.stringify(layout))

  const tabbar = await page.evaluate(() => {
    const list = document.querySelector('[role="tablist"]')
    if (!list) return null
    const cs = getComputedStyle(list)
    const wrap = list.parentElement
    const wrapCs = wrap ? getComputedStyle(wrap) : null
    const tabs = [...list.querySelectorAll('[role="tab"]')].map((t) => {
      const r = t.getBoundingClientRect()
      return { label: t.textContent?.trim(), x: Math.round(r.x), w: Math.round(r.width) }
    })
    const gaps = []
    for (let i = 1; i < tabs.length; i += 1) gaps.push(tabs[i].x - (tabs[i - 1].x + tabs[i - 1].w))
    return {
      overflowX: cs.overflowX,
      listScrollW: list.scrollWidth,
      listClientW: list.clientWidth,
      wrapBorderBottom: wrapCs ? wrapCs.borderBottomWidth : null,
      listBorderBottom: cs.borderBottomWidth,
      tabs,
      gaps
    }
  })
  check('tab 栏无横向滚动容器', Boolean(tabbar) && tabbar.overflowX === 'visible', JSON.stringify({ overflowX: tabbar?.overflowX }))
  check(
    'tab 栏内容未溢出',
    Boolean(tabbar) && tabbar.listScrollW <= tabbar.listClientW + 1,
    JSON.stringify({ scrollW: tabbar?.listScrollW, clientW: tabbar?.listClientW })
  )
  check(
    'tab 栏只有一条底线（外层无 border）',
    Boolean(tabbar) && (tabbar.wrapBorderBottom === '0px' || tabbar.wrapBorderBottom === null) && tabbar.listBorderBottom === '1px',
    JSON.stringify({ wrap: tabbar?.wrapBorderBottom, list: tabbar?.listBorderBottom })
  )
  check(
    'tab 间距均匀',
    Boolean(tabbar) && tabbar.gaps.length > 0 && new Set(tabbar.gaps).size === 1,
    JSON.stringify(tabbar?.gaps)
  )

  // 抽屉第二行运维工具栏：快照 / 迁移 / 转模板 / cloud-init / 组合键
  const toolbar = await page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"]')
    if (!sheet) return null
    // 只统计抽屉头部第二行的文字按钮：精确匹配文案且宽度 > 40（排除内容区里同名的小图标按钮）
    const wanted = ['快照', '迁移', '转模板', 'cloud-init', '组合键']
    const buttons = [...sheet.querySelectorAll('button')]
      .filter((b) => {
        const label = b.textContent?.trim() ?? ''
        return wanted.includes(label) && b.getBoundingClientRect().width > 40
      })
      .map((b) => {
        const r = b.getBoundingClientRect()
        return { label: b.textContent?.trim(), w: Math.round(r.width), h: Math.round(r.height) }
      })
    return { buttons, count: buttons.length, allVisible: buttons.every((b) => b.w > 0 && b.h > 0) }
  })
  check(
    '抽屉运维工具栏包含 5 个操作',
    Boolean(toolbar) && toolbar.count === 5,
    JSON.stringify(toolbar?.buttons?.map((b) => b.label))
  )
  check('抽屉运维工具栏按钮可见', Boolean(toolbar) && toolbar.allVisible, JSON.stringify(toolbar?.buttons))

  // 快照页：新建按钮 + 行内回滚/删除
  await page.getByRole('tab', { name: '快照' }).click()
  await page.waitForTimeout(400)
  const snapshotTab = await page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"]')
    if (!sheet) return null
    const text = (sheet.textContent ?? '').trim()
    const buttons = [...sheet.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '')
    return {
      hasCreate: buttons.includes('新建快照'),
      hasRollback: buttons.some((t) => t === '回滚'),
      hasDelete: buttons.some((t) => t === ''),
      rowText: text.includes('before-upgrade')
    }
  })
  check('快照页有新建入口', Boolean(snapshotTab) && snapshotTab.hasCreate, JSON.stringify(snapshotTab))
  check('快照页有回滚入口', Boolean(snapshotTab) && snapshotTab.hasRollback)
  check('快照页渲染出快照行', Boolean(snapshotTab) && snapshotTab.rowText)
  await shot(page, '17-drawer-snapshots.png')

  // 打开「新建快照」弹窗，验证表单可用后关闭
  await page.getByRole('button', { name: '新建快照' }).click()
  await page.waitForTimeout(400)
  const snapshotDialog = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    const target = dialogs.find((d) => (d.textContent ?? '').includes('记录当前磁盘状态'))
    if (!target) return null
    const input = target.querySelector('input[aria-label="快照名称"]')
    const submit = [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === '创建快照')
    return { hasInput: Boolean(input), hasSubmit: Boolean(submit) }
  })
  check('新建快照弹窗表单完整', Boolean(snapshotDialog) && snapshotDialog.hasInput && snapshotDialog.hasSubmit, JSON.stringify(snapshotDialog))
  await shot(page, '32-dialog-snapshot.png')

  // 弹窗视觉：标题带 / 页脚分隔线 / 关闭按钮不切竖线 / 内容内边距统一
  const dialogSkin = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    const target = dialogs.find((d) => (d.textContent ?? '').includes('记录当前磁盘状态'))
    if (!target) return null
    const header = target.firstElementChild
    const footer = [...target.children].reverse().find((el) => el.tagName === 'DIV' && el.querySelector('button'))
    const closeBtn = target.querySelector('button[aria-label="关闭"], button[aria-label="Close"], button')
    const close = [...target.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('关闭'))
    const r = target.getBoundingClientRect()
    const hr = header ? header.getBoundingClientRect() : null
    const fr = footer ? footer.getBoundingClientRect() : null
    const body = [...target.children].find((el) => el !== header && el !== footer)
    const br = body ? body.getBoundingClientRect() : null
    const cs = (el) => (el ? getComputedStyle(el) : null)
    return {
      width: Math.round(r.width),
      headerBg: cs(header)?.backgroundColor,
      headerBorderBottom: cs(header)?.borderBottomWidth,
      headerH: hr ? Math.round(hr.height) : null,
      footerBorderTop: cs(footer)?.borderTopWidth,
      footerH: fr ? Math.round(fr.height) : null,
      bodyPadX: cs(body)?.paddingLeft,
      closeBorderLeft: close ? cs(close).borderLeftWidth : null,
      closeIsIcon: Boolean(close),
      inputTop: (() => {
        const input = target.querySelector('input[aria-label="快照名称"]')
        if (!input || !br) return null
        return Math.round(input.getBoundingClientRect().left - br.left)
      })()
    }
  })
  check(
    '弹窗标题带为浅底并有下边线',
    Boolean(dialogSkin) && dialogSkin.headerBorderBottom === '1px' && dialogSkin.headerBg !== 'rgba(0, 0, 0, 0)',
    JSON.stringify({ bg: dialogSkin?.headerBg, border: dialogSkin?.headerBorderBottom })
  )
  check(
    '弹窗页脚为通栏分隔线',
    Boolean(dialogSkin) && dialogSkin.footerBorderTop === '1px',
    JSON.stringify({ border: dialogSkin?.footerBorderTop, h: dialogSkin?.footerH })
  )
  check(
    '关闭按钮不再切出竖线边框',
    Boolean(dialogSkin) && dialogSkin.closeIsIcon && (dialogSkin.closeBorderLeft === '0px' || dialogSkin.closeBorderLeft === null),
    JSON.stringify({ borderLeft: dialogSkin?.closeBorderLeft })
  )
  check(
    '弹窗内容左右内边距统一（20px）',
    Boolean(dialogSkin) && dialogSkin.bodyPadX === '20px' && dialogSkin.inputTop === 20,
    JSON.stringify({ padX: dialogSkin?.bodyPadX, inputLeft: dialogSkin?.inputTop })
  )
  check(
    '弹窗宽度不超出视口',
    Boolean(dialogSkin) && dialogSkin.width <= 520,
    JSON.stringify({ width: dialogSkin?.width })
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // 迁移弹窗：目标节点下拉必须有其他节点可选
  await page.getByRole('button', { name: '迁移' }).first().click()
  await page.waitForTimeout(500)
  const migrateDialog = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    const target = dialogs.find((d) => (d.textContent ?? '').includes('迁移由 PVE 任务队列执行'))
    if (!target) return null
    return {
      found: true,
      hasTargetSelect: Boolean(target.querySelector('[aria-label="目标节点"]')),
      hasOnline: Boolean(target.querySelector('[aria-label="在线迁移"]')),
      hasLocalDisks: Boolean(target.querySelector('[aria-label="迁移本地磁盘"]'))
    }
  })
  check(
    '迁移弹窗可打开且字段完整',
    Boolean(migrateDialog) && migrateDialog.hasTargetSelect && migrateDialog.hasOnline && migrateDialog.hasLocalDisks,
    JSON.stringify(migrateDialog)
  )
  await shot(page, '18-dialog-migrate.png')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // 组合键弹窗
  await page.getByRole('button', { name: '组合键' }).first().click()
  await page.waitForTimeout(500)
  const sendKeyDialog = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    const target = dialogs.find((d) => (d.textContent ?? '').includes('按键直接送达虚拟键盘'))
    if (!target) return null
    const hasCtrlAltDel = (target.textContent ?? '').includes('Ctrl+Alt+Del')
    const hasCustom = Boolean(target.querySelector('input[aria-label="按键"]'))
    return { hasCtrlAltDel, hasCustom }
  })
  check('组合键弹窗含常用与自定义组合', Boolean(sendKeyDialog) && sendKeyDialog.hasCtrlAltDel && sendKeyDialog.hasCustom, JSON.stringify(sendKeyDialog))
  await shot(page, '19-dialog-sendkey.png')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // cloud-init 弹窗
  await page.getByRole('button', { name: 'cloud-init' }).first().click()
  await page.waitForTimeout(500)
  const ciDialog = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    const target = dialogs.find((d) => (d.textContent ?? '').includes('由云镜像读取'))
    if (!target) return null
    return {
      hasHost: Boolean(target.querySelector('input[aria-label="云主机名"]')),
      hasKeys: Boolean(target.querySelector('textarea[aria-label="SSH 公钥"]')),
      hasIp: Boolean(target.querySelector('input[aria-label="网络配置"]'))
    }
  })
  check(
    'cloud-init 弹窗字段完整',
    Boolean(ciDialog) && ciDialog.hasHost && ciDialog.hasKeys && ciDialog.hasIp,
    JSON.stringify(ciDialog)
  )
  await shot(page, '20-dialog-cloudinit.png')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // 新增模块：存储 / 备份 / 高可用 / 防火墙 / 访问控制 / 任务
  const newViews = [
    { nav: '存储', shot: '12-storage', key: 'local-lvm' },
    { nav: '备份', shot: '13-backup', key: 'vzdump-qemu-204' },
    { nav: '高可用', shot: '14-ha', key: 'vm:204' },
    { nav: '防火墙', shot: '15-firewall', key: '管理端口' },
    { nav: '访问控制', shot: '16-access', key: 'automation@pve' },
    { nav: '任务', shot: '21-tasks', key: '迁移虚拟机' }
  ]

  for (const view of newViews) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(350)
    await page.getByRole('button', { name: new RegExp(`^${view.nav}`) }).first().click()
    await page.waitForTimeout(900)
    const rendered = await page.evaluate((keyword) => document.body.innerText.includes(keyword), view.key)
    check(`${view.nav}视图渲染出数据`, rendered, view.key)
    const crashed = await page.evaluate(() => document.body.innerText.includes('Something went wrong'))
    check(`${view.nav}视图无错误边界`, !crashed)
    await shot(page, `${view.shot}-light.png`)
  }

  // SSH：主窗口不再有 SSH 页，终端一律独立窗口
  const sidebarSsh = await page.evaluate(() => {
    const aside = document.querySelector('aside')
    const labels = aside ? [...aside.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '') : []
    return {
      hasSshNav: labels.some((label) => label === 'SSH'),
      inlineXterm: document.querySelectorAll('.xterm').length
    }
  })
  check('主窗口已移除 SSH 终端页', Boolean(sidebarSsh) && !sidebarSsh.hasSshNav, JSON.stringify(sidebarSsh))
  check('主窗口不内嵌终端', (sidebarSsh?.inlineXterm ?? -1) === 0, JSON.stringify({ inlineXterm: sidebarSsh?.inlineXterm }))

  // 独立 SSH 窗口：新开页面，带 ?ssh=1 走 SshWindowApp
  const sshPage = await context.newPage()
  sshPage.on('console', (m) => {
    if (m.type() === 'error') logs.push(`[ssh-console] ${m.text()}`)
  })
  sshPage.on('pageerror', (e) => logs.push(`[ssh-pageerror] ${e.message}`))
  const sshBootstrap = {
    request: { tabs: 1 },
    settings: {
      serverUrl: 'https://pve.example.com:8006',
      username: 'root@pam',
      theme: 'light',
      uiFont: 'inter',
      customFont: '',
      accentColor: '#0078d4'
    }
  }
  await sshPage.addInitScript(mainMock, {
    appVersion: APP_VERSION,
    theme: 'light',
    dashboard,
    detail,
    imagesData,
    newModuleData,
    sshBootstrap
  })
  await sshPage.goto(`http://127.0.0.1:${port}/index.html?ssh=1`)
  await sshPage.waitForTimeout(2200)

  const sshWindowShell = await sshPage.evaluate(() => {
    const body = document.body.innerText
    return {
      hasTitleBar: body.includes('SSH 终端'),
      hasCloseBtn: [...document.querySelectorAll('button')].some(
        (b) => (b.getAttribute('aria-label') ?? '') === '关闭窗口'
      )
    }
  })
  check('SSH 独立窗口有自绘标题栏', Boolean(sshWindowShell?.hasTitleBar), JSON.stringify(sshWindowShell))
  check('SSH 独立窗口有关闭按钮', Boolean(sshWindowShell?.hasCloseBtn), JSON.stringify(sshWindowShell))

  const sshPanel = await sshPage.evaluate(() => {
    const body = document.body.innerText
    // xterm 6 的 DOM 渲染器不再生成 canvas，判据换成 .xterm-rows 里的行
    const rows = [...document.querySelectorAll('.xterm-rows > div')]
    const termRoot = document.querySelector('.xterm')
    const tabButtons = [...document.querySelectorAll('button')].filter((b) =>
      (b.getAttribute('title') ?? '') === '关闭标签'
    )
    return {
      tabCount: tabButtons.length,
      hasXterm: Boolean(termRoot),
      rowCount: rows.length,
      termText: rows.map((r) => r.textContent ?? '').join(''),
      hasFiles: body.includes('.bashrc'),
      hasPathBar: body.includes('/root'),
      hasStatus: body.includes('xterm.js')
    }
  })

  check('SSH 窗口渲染出 xterm 终端', Boolean(sshPanel?.hasXterm), JSON.stringify({ hasXterm: sshPanel?.hasXterm }))
  check(
    '终端输出已写入屏幕行',
    (sshPanel?.rowCount ?? 0) > 0 && (sshPanel?.termText ?? '').includes('Proxmox VE'),
    JSON.stringify({ rows: sshPanel?.rowCount, text: (sshPanel?.termText ?? '').slice(0, 40) })
  )
  check('SSH 有标签栏与可关闭标签', (sshPanel?.tabCount ?? 0) >= 1, JSON.stringify({ tabs: sshPanel?.tabCount }))
  check('SSH 底部状态条显示会话信息', Boolean(sshPanel?.hasStatus), JSON.stringify({ hasStatus: sshPanel?.hasStatus }))
  check('右侧文件面板列出目录内容', Boolean(sshPanel?.hasFiles), JSON.stringify({ hasFiles: sshPanel?.hasFiles }))
  check('文件面板有路径栏', Boolean(sshPanel?.hasPathBar), JSON.stringify({ hasPath: sshPanel?.hasPathBar }))
  await sshPage.screenshot({ path: path.join(outDir, '22-ssh-window-light.png') })

  // 悬停态截图：确认按钮变底色时标题栏那条下边线依然连续
  await sshPage.locator('[data-window-button="minimize"]').first().hover()
  await sshPage.waitForTimeout(300)
  await sshPage.screenshot({
    path: path.join(outDir, '25-ssh-window-buttons-hover.png'),
    clip: { x: 1080, y: 0, width: 200, height: 44 },
    scale: 'device'
  })
  await sshPage.mouse.move(4, 600)
  await sshPage.waitForTimeout(200)

  /**
   * 标题栏按钮不能溢出：宿主是 h-10 + border-b，内容盒只有 39px。
   * 按钮写死 40px 时会盖住那条下边线，悬停变色后看起来像「底部横线断了一截」。
   */
  const windowButtonFit = await sshPage.evaluate(() => {
    const group = document.querySelector('[data-window-buttons]')
    const bar = group?.parentElement
    if (!group || !bar) return null
    const g = group.getBoundingClientRect()
    const b = bar.getBoundingClientRect()
    const barCs = getComputedStyle(bar)
    return {
      groupH: Math.round(g.height * 10) / 10,
      barH: Math.round(b.height * 10) / 10,
      barBorderBottom: barCs.borderBottomWidth,
      groupOverflow: Math.round((g.bottom - b.bottom) * 10) / 10,
      buttonsHeight: [...group.querySelectorAll('button')].map((el) => Math.round(el.getBoundingClientRect().height))
    }
  })
  check(
    '标题栏按钮不超出标题栏高度',
    windowButtonFit !== null && windowButtonFit.groupOverflow <= 0,
    JSON.stringify(windowButtonFit)
  )
  check(
    '标题栏按钮撑满内容盒（不压住下边线）',
    windowButtonFit !== null &&
      windowButtonFit.buttonsHeight.every((h) => h === windowButtonFit.groupH) &&
      windowButtonFit.groupH === windowButtonFit.barH - 1,
    JSON.stringify(windowButtonFit)
  )

  // 悬停最小化后，标题栏下边线不能被盖掉（按钮背景不能压到 border 所在那一行）
  const hoverLine = await sshPage.evaluate(async () => {
    const btn = document.querySelector('[data-window-button="minimize"]')
    const bar = btn?.parentElement?.parentElement
    if (!bar) return null
    return { barBottom: Math.round(bar.getBoundingClientRect().bottom), btnBottom: Math.round(btn.getBoundingClientRect().bottom) }
  })
  if (hoverLine) {
    await sshPage.locator('[data-window-button="minimize"]').first().hover()
    await sshPage.waitForTimeout(260)
    const hovered = await sshPage.evaluate(() => {
      const btn = document.querySelector('[data-window-button="minimize"]')
      const bar = btn?.parentElement?.parentElement
      return { barBottom: Math.round(bar.getBoundingClientRect().bottom), btnBottom: Math.round(btn.getBoundingClientRect().bottom) }
    })
    check(
      '悬停最小化后按钮下沿不越过标题栏底边',
      hovered.btnBottom < hovered.barBottom,
      JSON.stringify({ idle: hoverLine, hovered })
    )
    await sshPage.mouse.move(4, 600)
    await sshPage.waitForTimeout(200)
  }

  /**
   * 终端与文件面板之间的分隔线必须横贯整窗，不能只在文件面板那段出现。
   * 取像素行比对：分隔线那一行从左到右应当是同一种颜色。
   */
  const divider = await sshPage.evaluate(() => {
    const row = [...document.querySelectorAll('div')].find(
      (d) => typeof d.className === 'string' && d.className.includes('border-b') && d.classList.contains('flex') && d.querySelector('.xterm')
    )
    if (!row) return null
    const r = row.getBoundingClientRect()
    return { y: Math.round(r.bottom) - 1, width: Math.round(r.width) }
  })
  if (divider) {
    const stripBuf = await sshPage.screenshot({ clip: { x: 0, y: divider.y, width: 1280, height: 1 } })
    const runs = await sshPage.evaluate(async (dataUrl) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, img.width, 1).data
      const out = []
      let prev = null
      let start = 0
      for (let x = 0; x <= img.width; x += 1) {
        const key = x === img.width ? 'END' : `${d[x * 4]},${d[x * 4 + 1]},${d[x * 4 + 2]}`
        if (key !== prev) {
          if (prev !== null) out.push({ from: start, to: x - 1, color: prev })
          prev = key
          start = x
        }
      }
      return out
    }, `data:image/png;base64,${stripBuf.toString('base64')}`)
    check(
      '终端底部分割线横贯整窗',
      runs.length === 1 && runs[0].from === 0 && runs[0].to === 1279,
      JSON.stringify({ y: divider.y, runs })
    )
  } else {
    check('终端底部分割线横贯整窗', false, '未找到终端行容器')
  }


  // 新建第二个标签 → 应该变成两个
  const addBtn = sshPage.locator('button[title="新建 SSH 标签"]').first()
  if (await addBtn.count()) {
    await addBtn.click()
    await sshPage.waitForTimeout(1200)
  }
  const tabAfterAdd = await sshPage.evaluate(
    () => [...document.querySelectorAll('button')].filter((b) => (b.getAttribute('title') ?? '') === '关闭标签').length
  )
  check('可多开 SSH 标签', tabAfterAdd === 2, JSON.stringify({ tabs: tabAfterAdd }))

  // 文件预览：点文件名应进入编辑态
  const fileBtn = sshPage.locator('button').filter({ hasText: '.bashrc' }).first()
  await fileBtn.click()
  await sshPage.waitForTimeout(900)
  const previewState = await sshPage.evaluate(() => {
    const areas = [...document.querySelectorAll('textarea')]
    // 取第一个可见且有值的编辑区，避开弹窗里残留的 textarea
    const area = areas.find((el) => el.offsetParent !== null && el.value.length > 0) ?? areas.find((el) => el.offsetParent !== null)
    return {
      hasEditor: Boolean(area),
      content: area instanceof HTMLTextAreaElement ? area.value.slice(0, 40) : '',
      hasSave: [...document.querySelectorAll('button')].some((b) => (b.textContent ?? '').trim() === '保存')
    }
  })
  check('文件可点击进入文本预览', Boolean(previewState?.hasEditor), JSON.stringify({ hasEditor: previewState?.hasEditor }))
  check('预览载入了文件内容', (previewState?.content ?? '').includes('.bashrc'), JSON.stringify({ content: previewState?.content }))
  check('预览带保存入口', Boolean(previewState?.hasSave), JSON.stringify({ hasSave: previewState?.hasSave }))
  await sshPage.screenshot({ path: path.join(outDir, '23-ssh-preview-light.png') })

  // 返回列表
  const closePreview = sshPage.locator('button[title="关闭预览"]').first()
  if (await closePreview.count()) await closePreview.click()
  await sshPage.waitForTimeout(400)

  // 新建目录按钮
  check('文件面板有新建目录入口', (await sshPage.locator('button[title="新建目录"]').count()) > 0)
  check('文件面板有上传入口', (await sshPage.locator('button[title="上传文件"]').count()) > 0)
  check('文件面板有重命名与删除入口', (await sshPage.locator('button[title="重命名"]').count()) > 0)

  // 标签样式：选中项有底部下划线，且下划线只在选中项上
  const tabStyle = await sshPage.evaluate(() => {
    const rows = [...document.querySelectorAll('div')].filter((el) =>
      (el.className ?? '').toString().includes('border-r border-border/70')
    )
    const underlines = rows.map((row) => {
      const bar = row.querySelector('span')
      const style = bar ? getComputedStyle(bar) : null
      return { h: style?.height ?? '', bg: style?.backgroundColor ?? '' }
    })
    const barHeights = underlines.map((u) => u.h)
    return {
      tabs: rows.length,
      barHeights,
      // 有且只有一条可见下划线
      visibleBars: underlines.filter((u) => u.h === '2px' && u.bg !== 'rgba(0, 0, 0, 0)').length
    }
  })
  check('标签使用底部下划线选中态', tabStyle.tabs >= 1 && tabStyle.barHeights.every((h) => h === '2px'), JSON.stringify(tabStyle))
  check('只有选中标签显示下划线', tabStyle.visibleBars === 1, JSON.stringify({ visibleBars: tabStyle.visibleBars, tabs: tabStyle.tabs }))
  await sshPage.screenshot({ path: path.join(outDir, '24-ssh-tabs-light.png') })

  await sshPage.close()

  // 控制台类型选择：VNC / xterm.js 两项，不支持的那项置灰
  await page.getByRole('button', { name: /^虚拟机/ }).first().click()
  await page.waitForSelector('tbody tr', { timeout: 20_000 })
  await page.waitForTimeout(600)

  /**
   * 打开指定虚拟机行操作菜单里的「控制台」子菜单，读回两项的可用状态。
   * 用 data-console-mode / data-console-enabled 断言，避免依赖文案。
   * 注意：Radix 靠 pointerdown 触发，必须用真实点击而不是 el.click()。
   */
  const rowOf = (vmName) => page.locator('tbody tr', { hasText: vmName }).first()

  const inspectConsole = async (vmName, shotName) => {
    await rowOf(vmName).locator('button[aria-label="更多操作"]').click()
    await page.waitForSelector('[role="menu"]', { timeout: 8000 }).catch(() => null)
    await page.waitForTimeout(300)
    const items = await page.evaluate(() => {
      return [...document.querySelectorAll('[data-console-mode]')].map((item) => ({
        mode: item.getAttribute('data-console-mode'),
        backend: item.getAttribute('data-console-backend'),
        enabled: item.getAttribute('data-console-enabled') === 'true',
        disabled:
          item.getAttribute('aria-disabled') === 'true' ||
          item.hasAttribute('data-disabled') ||
          item.getAttribute('data-state') === 'disabled',
        title: item.getAttribute('title') ?? '',
        text: (item.textContent ?? '').trim(),
        opacity: getComputedStyle(item).opacity
      }))
    })
    if (items.length === 0) {
      const html = await page.evaluate(() => {
        const menu = document.querySelector('[role="menu"]')
        return menu ? menu.outerHTML.slice(0, 900) : 'NO_MENU'
      })
      console.log(`[console-probe] ${vmName} ${html}`)
    }
    if (shotName) await shot(page, shotName)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    return items
  }

  const asItems = (result) => (Array.isArray(result) ? result : [])
  const consoleQemu = await inspectConsole('DBI-Business-Server', '34-console-menu-qemu.png')
  check(
    '控制台菜单同时提供 VNC 与 xterm.js 两项',
    asItems(consoleQemu).map((i) => i.mode).sort().join(',') === 'novnc,xterm',
    JSON.stringify(consoleQemu)
  )
  check(
    'VNC 与 xterm 都支持的虚拟机两项均可点',
    asItems(consoleQemu).length === 2 && asItems(consoleQemu).every((i) => i.enabled && !i.disabled),
    JSON.stringify(asItems(consoleQemu).map((i) => ({ mode: i.mode, enabled: i.enabled })))
  )

  const consoleLxc = await inspectConsole('cert-hub', '35-console-menu-lxc.png')
  const lxcVnc = asItems(consoleLxc).find((i) => i.mode === 'novnc')
  const lxcXterm = asItems(consoleLxc).find((i) => i.mode === 'xterm')
  check(
    'LXC 容器上 VNC 置灰',
    Boolean(lxcVnc) && !lxcVnc.enabled && lxcVnc.disabled,
    JSON.stringify(lxcVnc ?? null)
  )
  check(
    'LXC 容器上 xterm.js 可用',
    Boolean(lxcXterm) && lxcXterm.enabled && !lxcXterm.disabled,
    JSON.stringify(lxcXterm ?? null)
  )
  check(
    '置灰项降低不透明度',
    Boolean(lxcVnc) && Number(lxcVnc.opacity) < 1,
    JSON.stringify({ opacity: lxcVnc?.opacity })
  )
  check(
    '置灰项给出不可用原因',
    Boolean(lxcVnc) && lxcVnc.title.length > 0,
    JSON.stringify({ title: lxcVnc?.title })
  )

  // 检测方式优化：xterm 菜单项要标出实际走的通道，客户机 SSH 可用时提示直连虚拟机内部
  const consoleQemuAgain = await inspectConsole('DBI-Business-Server', null)
  const qemuXterm = asItems(consoleQemuAgain).find((i) => i.mode === 'xterm')
  check(
    'xterm 项标出实际通道（客户机 SSH）',
    Boolean(qemuXterm) && qemuXterm.backend === 'guest-ssh' && qemuXterm.text.includes('SSH'),
    JSON.stringify({ backend: qemuXterm?.backend, text: qemuXterm?.text })
  )
  check(
    'xterm 提示里给出客户机地址',
    Boolean(qemuXterm) && qemuXterm.title.includes('10.10.12.204'),
    JSON.stringify({ title: qemuXterm?.title })
  )
  check(
    '客户机 SSH 可用时 xterm 不再置灰',
    Boolean(qemuXterm) && qemuXterm.enabled && !qemuXterm.disabled,
    JSON.stringify({ enabled: qemuXterm?.enabled })
  )

  // 文件面板对接虚拟机内部：SSH 窗口带 vm.guestHost 时，面板请求必须携带 guest 目标
  const sshVmPage = await context.newPage()
  sshVmPage.on('pageerror', (e) => logs.push(`[ssh-vm-window] ${e.message}`))
  await sshVmPage.addInitScript(mainMock, {
    appVersion: APP_VERSION,
    theme: 'light',
    dashboard,
    detail,
    imagesData,
    newModuleData,
    sshBootstrap: {
      request: {
        tabs: 1,
        vm: {
          node: 'pve',
          vmid: 204,
          type: 'qemu',
          name: 'DBI-Business-Server',
          guestHost: '10.10.12.204',
          ostype: 'win11'
        }
      },
      settings: {
        serverUrl: 'https://pve.example.com:8006',
        username: 'root@pam',
        theme: 'light',
        uiFont: 'inter',
        customFont: '',
        accentColor: '#0078d4'
      }
    }
  })
  await sshVmPage.goto(`http://127.0.0.1:${port}/index.html?ssh=1`)
  await sshVmPage.waitForTimeout(2400)

  const guestFsCall = await sshVmPage.evaluate(() => {
    const calls = window.__sshFsCalls ?? []
    const withGuest = calls.filter((call) => call?.guest?.host)
    const badge = document.querySelector('[data-sftp-source]')
    return {
      total: calls.length,
      withGuest: withGuest.length,
      host: withGuest[0]?.guest?.host ?? null,
      username: withGuest[0]?.guest?.username ?? null,
      path: withGuest[0]?.path ?? null,
      badgeKind: badge?.getAttribute('data-sftp-source') ?? null,
      badgeText: (badge?.textContent ?? '').trim(),
      badgeTitle: badge?.getAttribute('title') ?? ''
    }
  })
  check(
    '文件面板请求带上客户机目标',
    guestFsCall.total > 0 && guestFsCall.withGuest === guestFsCall.total,
    JSON.stringify(guestFsCall)
  )
  check(
    '客户机目标使用探测到的 IP',
    guestFsCall.host === '10.10.12.204',
    JSON.stringify({ host: guestFsCall.host })
  )
  check(
    'Windows 客户机默认用 Administrator 登录',
    guestFsCall.username === 'Administrator',
    JSON.stringify({ username: guestFsCall.username })
  )
  check(
    '文件面板标出数据来源为虚拟机内部',
    guestFsCall.badgeKind === 'guest' && guestFsCall.badgeText.includes('10.10.12.204'),
    JSON.stringify({ kind: guestFsCall.badgeKind, text: guestFsCall.badgeText })
  )
  check(
    '来源提示里写明登录账号（避免误以为是节点）',
    guestFsCall.badgeTitle.includes('虚拟机') && guestFsCall.badgeTitle.includes('Administrator'),
    JSON.stringify({ title: guestFsCall.badgeTitle })
  )
  const filesSource = await sshVmPage.evaluate(() => {
    const el = document.querySelector('[data-files-source]')
    return { kind: el?.getAttribute('data-files-source') ?? null, text: (el?.textContent ?? '').trim() }
  })
  check(
    '状态条标明文件面板来源是客户机',
    filesSource.kind === 'guest' && filesSource.text.includes('10.10.12.204'),
    JSON.stringify(filesSource)
  )
  await sshVmPage.screenshot({ path: path.join(outDir, '36-ssh-vm-guest-files.png') })
  await sshVmPage.close()

  // 回到任务页（上面切去过 SSH），再验任务操作
  await page.getByRole('button', { name: /^任务/ }).first().click()
  await page.waitForTimeout(900)

  // 任务页：运行中的任务应出现「停止」，全部任务都能删除
  const taskActions = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
    return {
      hasStop: buttons.some((b) => (b.getAttribute('aria-label') ?? '') === '停止任务'),
      hasDelete: buttons.some((b) => (b.getAttribute('aria-label') ?? '') === '删除任务记录'),
      hasRange: Boolean(document.querySelector('[aria-label="时间范围"]')),
      hasLog: buttons.some((b) => (b.getAttribute('aria-label') ?? '') === '查看日志')
    }
  })
  check('任务页有停止运行中任务入口', taskActions.hasStop, JSON.stringify(taskActions))
  check('任务页有删除记录与日志入口', taskActions.hasDelete && taskActions.hasLog, JSON.stringify(taskActions))
  check('任务页有时间范围筛选', taskActions.hasRange)

  // 节点运维弹窗：订阅 / 软件包 / 证书三个面板
  await page.getByRole('button', { name: /^节点/ }).first().click()
  await page.waitForTimeout(900)
  await shot(page, '37-nodes-view-light.png')

  // 节点页「服务器信息」：硬件详情已并入，且只留一颗 CPU 温度（不列逐核）
  const nodeServerInfo = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('div')].find(
      (el) => el.children.length === 0 && el.textContent?.trim() === '服务器信息'
    )
    const card = heading?.closest('div.border')
    const text = card?.innerText ?? ''
    return {
      found: Boolean(heading),
      text: text.slice(0, 400),
      hasModel: text.includes('CPU 型号'),
      hasBoard: text.includes('主板'),
      hasServerModel: text.includes('服务器型号'),
      hasCpuTemp: text.includes('CPU 温度'),
      // 逐核温度形如「核心 0」「Core 0」/ 多个温度值，这一栏不该出现
      perCoreRows: /核心\s*\d/.test(text),
      tempCount: (text.match(/\d+\s*°C/g) ?? []).length
    }
  })
  check('节点页「服务器信息」已合并硬件字段', Boolean(nodeServerInfo.found) && nodeServerInfo.hasModel && nodeServerInfo.hasBoard && nodeServerInfo.hasServerModel, JSON.stringify({ text: nodeServerInfo.text }))
  check('「服务器信息」只留一颗 CPU 温度，不列逐核', nodeServerInfo.hasCpuTemp && !nodeServerInfo.perCoreRows && nodeServerInfo.tempCount <= 1, JSON.stringify({ perCore: nodeServerInfo.perCoreRows, temps: nodeServerInfo.tempCount }))

  await page.getByRole('button', { name: '运维' }).first().click()
  await page.waitForTimeout(800)
  const opsSub = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => (x.textContent ?? '').includes('节点运维'))
    if (!d) return null
    const text = d.textContent ?? ''
    return {
      found: true,
      hasStatus: text.includes('订阅状态'),
      hasKey: Boolean(d.querySelector('input[aria-label="订阅密钥"]')),
      hasTabs: ['订阅', '软件包', '证书'].every((label) =>
        [...d.querySelectorAll('button')].some((b) => b.textContent?.trim() === label)
      )
    }
  })
  check('节点运维弹窗含订阅面板', Boolean(opsSub) && opsSub.hasStatus && opsSub.hasKey, JSON.stringify(opsSub))
  check('节点运维弹窗含三个页签', Boolean(opsSub) && opsSub.hasTabs)

  /**
   * 弹窗排版：内容不能贴边（左右都要留白），页签用下划线而不是黑底方块，
   * 且输入框与保存按钮等高——这三处是「看起来不美观」的主要来源。
   */
  const opsLayout = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => (x.textContent ?? '').includes('节点运维'))
    if (!d) return null
    const dialogRect = d.getBoundingClientRect()
    const body = [...d.querySelectorAll('div')].find((el) => {
      const c = typeof el.className === 'string' ? el.className : ''
      return c.includes('overflow-y-auto') && c.includes('px-5') && el.querySelector('input[aria-label="订阅密钥"]')
    })
    const bodyRect = body?.getBoundingClientRect()
    const bodyCs = body ? getComputedStyle(body) : null
    // 量的是「内容实际起点」，不是容器外沿——容器本身就是满宽的，padding 在它内部
    const padLeft = bodyRect ? Math.round(bodyRect.left + parseFloat(bodyCs.paddingLeft) - dialogRect.left) : null
    const padRight = bodyRect ? Math.round(dialogRect.right - (bodyRect.right - parseFloat(bodyCs.paddingRight))) : null

    const tabs = [...d.querySelectorAll('[data-ops-tab]')]
    const activeTab = tabs.find((t) => t.getAttribute('data-ops-tab-active') === 'true')
    const activeCs = activeTab ? getComputedStyle(activeTab) : null

    const input = d.querySelector('input[aria-label="订阅密钥"]')
    const saveBtn = [...d.querySelectorAll('button')].find((b) => b.textContent?.trim() === '保存')
    const inputH = input ? Math.round(input.getBoundingClientRect().height) : null
    const saveH = saveBtn ? Math.round(saveBtn.getBoundingClientRect().height) : null

    return {
      padLeft,
      padRight,
      tabCount: tabs.length,
      activeTabBg: activeCs?.backgroundColor ?? null,
      activeTabBorderBottom: activeCs ? `${activeCs.borderBottomWidth} ${activeCs.borderBottomStyle}` : null,
      inputH,
      saveH,
      dialogWidth: Math.round(dialogRect.width)
    }
  })
  check(
    '运维弹窗内容左右留出内边距',
    opsLayout !== null && (opsLayout.padLeft ?? 0) >= 16 && (opsLayout.padRight ?? 0) >= 16,
    JSON.stringify({ layout: opsLayout })
  )
  check(
    '运维页签改为下划线选中态（不再是黑底方块）',
    opsLayout !== null &&
      opsLayout.tabCount === 3 &&
      opsLayout.activeTabBorderBottom?.startsWith('2px') &&
      (opsLayout.activeTabBg === 'rgba(0, 0, 0, 0)' || opsLayout.activeTabBg === 'transparent'),
    JSON.stringify({ tabs: opsLayout?.tabCount, bg: opsLayout?.activeTabBg, border: opsLayout?.activeTabBorderBottom })
  )
  check(
    '订阅密钥输入框与保存按钮等高',
    opsLayout !== null && opsLayout.inputH !== null && opsLayout.inputH === opsLayout.saveH,
    JSON.stringify({ inputH: opsLayout?.inputH, saveH: opsLayout?.saveH })
  )
  await shot(page, '22-node-ops-subscription.png')

  /**
   * 像素级复核：页签底部那一行必须是品牌色下划线。
   * 旧版是黑底白字方块，选中处采样会是深色；这里采样能直接分辨两者。
   */
  {
    const buf = fs.readFileSync(path.join(outDir, '22-node-ops-subscription.png'))
    const sample = await page.evaluate(async (dataUrl) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const px = (x, y) => {
        const d = ctx.getImageData(x, y, 1, 1).data
        return [d[0], d[1], d[2]]
      }
      const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => (x.textContent ?? '').includes('节点运维'))
      const tab = d.querySelector('[data-ops-tab="subscription"]')
      const tr = tab.getBoundingClientRect()
      // 沿底边横向扫一遍，取非透明背景的像素里最「蓝」的那个
      const y = Math.round(tr.bottom) - 1
      let bluest = [255, 255, 255]
      for (let x = Math.round(tr.x); x < Math.round(tr.right); x += 2) {
        const p = px(x, y)
        if (p[2] - p[0] > bluest[2] - bluest[0]) bluest = p
      }
      // 页签上方空白处作为「无下划线」的对照
      const above = px(Math.round(tr.x + 4), Math.round(tr.y) + 2)
      return { underline: bluest, above, delta: bluest[2] - bluest[0], aboveDelta: above[2] - above[0] }
    }, `data:image/png;base64,${buf.toString('base64')}`)
    check(
      '运维页签底边渲染出品牌色下划线（非黑底方块）',
      sample.delta >= 60 && sample.aboveDelta < 30,
      JSON.stringify(sample)
    )
  }

  await page.getByRole('button', { name: '软件包', exact: true }).click()
  await page.waitForTimeout(700)
  const opsApt = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => (x.textContent ?? '').includes('节点运维'))
    if (!d) return null
    const text = d.textContent ?? ''
    return {
      hasUpdates: text.includes('pve-manager'),
      hasRepos: text.includes('enterprise.proxmox.com') || text.includes('deb.debian.org'),
      hasRefresh: [...d.querySelectorAll('button')].some((b) => b.textContent?.trim() === '刷新索引')
    }
  })
  check('软件包面板渲染更新与软件源', Boolean(opsApt) && opsApt.hasUpdates && opsApt.hasRepos, JSON.stringify(opsApt))
  check('软件包面板有刷新索引按钮', Boolean(opsApt) && opsApt.hasRefresh)
  await shot(page, '23-node-ops-apt.png')

  await page.getByRole('button', { name: '证书', exact: true }).click()
  await page.waitForTimeout(700)
  const opsCert = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => (x.textContent ?? '').includes('节点运维'))
    if (!d) return null
    const text = d.textContent ?? ''
    return {
      hasSubject: text.includes('pve.example.com'),
      hasUpload: [...d.querySelectorAll('button')].some((b) => b.textContent?.trim() === '上传证书'),
      hasPem: Boolean(d.querySelector('textarea[aria-label="私钥"]'))
    }
  })
  check('证书面板渲染证书信息', Boolean(opsCert) && opsCert.hasSubject, JSON.stringify(opsCert))
  check('证书面板有上传入口与私钥输入', Boolean(opsCert) && opsCert.hasUpload && opsCert.hasPem)
  await shot(page, '24-node-ops-certificate.png')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // SDN：区域 / VNet / 子网三个页签 + 待下发变更提示
  await page.getByRole('button', { name: /^SDN/ }).first().click()
  await page.waitForTimeout(1000)
  const sdnZones = await page.evaluate(() => {
    const text = document.body.innerText
    const buttons = [...document.querySelectorAll('button')]
    return {
      hasZone: text.includes('labnet'),
      hasVxlan: text.includes('vxlantest'),
      hasPending: text.includes('待下发'),
      hasApply: buttons.some((b) => b.textContent?.trim() === '下发配置'),
      hasDiscard: buttons.some((b) => b.textContent?.trim() === '丢弃变更'),
      tabs: ['区域', 'VNet', '子网'].filter((label) =>
        [...document.querySelectorAll('[role="tab"]')].some((t) => t.textContent?.trim() === label)
      ).length
    }
  })
  check('SDN 区域页签渲染区域与类型', sdnZones.hasZone && sdnZones.hasVxlan, JSON.stringify(sdnZones))
  check('SDN 有待下发变更时可下发 / 丢弃', sdnZones.hasApply && sdnZones.hasDiscard, JSON.stringify(sdnZones))
  check('SDN 三个页签齐全', sdnZones.tabs === 3, String(sdnZones.tabs))
  await shot(page, '25-sdn-zones.png')

  await page.getByRole('tab', { name: 'VNet' }).click()
  await page.waitForTimeout(500)
  const sdnVnets = await page.evaluate(() => {
    const text = document.body.innerText
    return {
      hasLab10: text.includes('lab10'),
      hasAlias: text.includes('业务网段'),
      hasVlanAware: text.includes('VLAN 感知')
    }
  })
  check('SDN VNet 页签渲染别名与 VLAN 感知', sdnVnets.hasLab10 && sdnVnets.hasAlias && sdnVnets.hasVlanAware, JSON.stringify(sdnVnets))
  await shot(page, '26-sdn-vnets.png')

  await page.getByRole('tab', { name: '子网' }).click()
  await page.waitForTimeout(500)
  const sdnSubnets = await page.evaluate(() => {
    const text = document.body.innerText
    return {
      hasCidr: text.includes('10.10.10.0/24'),
      hasGateway: text.includes('10.10.10.1'),
      hasSnat: text.includes('SNAT')
    }
  })
  check('SDN 子网页签渲染网关与 SNAT', sdnSubnets.hasCidr && sdnSubnets.hasGateway && sdnSubnets.hasSnat, JSON.stringify(sdnSubnets))
  await shot(page, '27-sdn-subnets.png')

  // 新建区域弹窗：类型切换后字段应随之变化
  await page.getByRole('tab', { name: '区域' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: '新建区域' }).first().click()
  await page.waitForTimeout(600)
  const sdnDialog = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => (x.textContent ?? '').includes('新建 SDN 区域'))
    if (!d) return null
    const text = d.textContent ?? ''
    return {
      hasBridge: text.includes('物理网桥'),
      hasType: text.includes('Simple'),
      hasName: Boolean(d.querySelector('#sdn-zone-name'))
    }
  })
  check('新建 SDN 区域弹窗含名称 / 类型 / 网桥', Boolean(sdnDialog) && sdnDialog.hasBridge && sdnDialog.hasType && sdnDialog.hasName, JSON.stringify(sdnDialog))
  await shot(page, '28-dialog-sdn-zone.png')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // 集群成员：加入集群入口 + 移出节点
  await page.getByRole('button', { name: /^集群/ }).first().click()
  await page.waitForTimeout(1000)
  const clusterCard = await page.evaluate(() => {
    const text = document.body.innerText
    const buttons = [...document.querySelectorAll('button')]
    return {
      hasMembers: text.includes('集群成员'),
      hasLoad: text.includes('节点负载'),
      hasSelf: text.includes('本节点'),
      hasVotes: text.includes('票数 1'),
      hasJoin: buttons.some((b) => b.textContent?.trim() === '加入集群'),
      joinDisabled: buttons.filter((b) => b.textContent?.trim() === '加入集群').every((b) => b.disabled)
    }
  })
  check('集群成员卡渲染成员与本节点标记', clusterCard.hasMembers && clusterCard.hasSelf, JSON.stringify(clusterCard))
  check('集群页不再重复「节点负载」（改由节点页承载）', !clusterCard.hasLoad, JSON.stringify(clusterCard))
  check('多节点集群下「加入集群」被禁用', clusterCard.hasJoin && clusterCard.joinDisabled, JSON.stringify(clusterCard))
  await shot(page, '29-cluster-members.png')

  const removeButtons = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('移出节点'))
    .map((b) => b.getAttribute('aria-label')))
  check(
    '非本节点显示移出入口、本节点无移出按钮',
    removeButtons.length === 2 && !removeButtons.includes('移出节点 pve'),
    JSON.stringify(removeButtons)
  )

  // 节点 → 设置 → 磁盘：初始化入口与用途标记
  // 注意：侧栏底部也有一个「设置」，必须限定在节点卡片内部点，否则会跳到全局设置页
  await page.getByRole('button', { name: /^节点/ }).first().click()
  await page.waitForTimeout(900)
  await page.locator('button:has(svg.lucide-settings-2)').first().click()
  await page.waitForTimeout(1800)
  const diskTable = await page.evaluate(() => {
    const section = document.querySelector('[data-section="disks"]')
    if (!section) return null
    const text = section.textContent ?? ''
    const headers = [...section.querySelectorAll('th')].map((th) => th.textContent?.trim())
    const scroller = section.querySelector('.overflow-x-auto')
    return {
      found: true,
      headers,
      hasUsed: text.includes('LVM'),
      hasIdle: text.includes('空闲'),
      hasInit: [...section.querySelectorAll('button')].some((b) => (b.getAttribute('aria-label') ?? '').startsWith('初始化磁盘')),
      initCount: [...section.querySelectorAll('button')].filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('初始化磁盘')).length,
      overflow: scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : false,
      scroll: scroller ? { scrollW: scroller.scrollWidth, clientW: scroller.clientWidth } : null
    }
  })
  check('磁盘表有用途与操作列', Boolean(diskTable) && diskTable.headers.includes('用途') && diskTable.headers.includes('操作'), JSON.stringify(diskTable))
  check('磁盘表区分已占用与空闲', Boolean(diskTable) && diskTable.hasUsed && diskTable.hasIdle, JSON.stringify(diskTable))
  check('每块磁盘都有初始化入口', Boolean(diskTable) && diskTable.initCount === 2, JSON.stringify(diskTable))
  check('磁盘表在窄栏内不横向溢出', Boolean(diskTable) && !diskTable.overflow, JSON.stringify(diskTable?.scroll ?? null))
  await shot(page, '30-node-disks.png')

  await page.locator('[data-section="disks"] button[aria-label^="初始化磁盘"]').first().click()
  await page.waitForTimeout(700)
  const diskDialog = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => (x.textContent ?? '').includes('初始化磁盘'))
    if (!d) return null
    const text = d.textContent ?? ''
    return {
      found: true,
      hasPath: text.includes('/dev/sda'),
      hasMode: text.includes('LVM-thin'),
      hasName: Boolean(d.querySelector('#disk-init-name')),
      hasWarning: text.includes('数据将全部丢失') || text.includes('不可撤销')
    }
  })
  // 下拉收起时只渲染当前项，必须展开才能核对全部用途
  await page.locator('[role="dialog"] [role="combobox"]').first().click()
  await page.waitForTimeout(500)
  const modeOptions = await page.evaluate(() =>
    [...document.querySelectorAll('[role="option"]')].map((el) => el.textContent?.trim())
  )
  const hasAllModes = ['LVM-thin', 'LVM', 'ZFS', '目录', '仅 GPT 分区表', '擦除磁盘'].every((label) =>
    modeOptions.includes(label)
  )
  check('磁盘初始化弹窗含路径 / 用途 / 存储名', Boolean(diskDialog) && diskDialog.hasPath && diskDialog.hasMode && diskDialog.hasName, JSON.stringify(diskDialog))
  check('磁盘用途下拉含 6 种初始化方式', hasAllModes, JSON.stringify(modeOptions))
  check('磁盘初始化弹窗有数据丢失警告', Boolean(diskDialog) && diskDialog.hasWarning)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await shot(page, '31-dialog-disk-init.png')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // 深色模式
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /^虚拟机/ }).first().click()
  await page.waitForTimeout(700)
  await page.evaluate(async () => window.pvevdi.updatePreferences({ theme: 'dark' }))
  await page.waitForTimeout(900)
  await shot(page, '07-list-dark.png')

  // 深色模式下回总览，仪表盘颜色应随主题重绘
  await page.getByRole('button', { name: /^总览/ }).first().click()
  await page.waitForTimeout(1200)
  const gaugeDark = await page.evaluate(() => {
    const host = document.querySelector('[aria-label^="CPU 使用率"]')
    const canvas = host?.querySelector('canvas')
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let bright = 0
    let opaque = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      opaque += 1
      bright = Math.max(bright, 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    }
    return { bright, opaque, themeClass: document.documentElement.className }
  })
  check(
    '深色主题下仪表盘重绘为浅色文字',
    Boolean(gaugeDark) && gaugeDark.themeClass.includes('dark') && gaugeDark.bright > 200,
    JSON.stringify(gaugeDark)
  )
  await shot(page, '34-overview-dark-gauges.png')
  await page.getByRole('button', { name: /^虚拟机/ }).first().click()
  await page.waitForTimeout(900)

  await page.locator('tbody tr', { hasText: 'DBI-Business-Server' }).first().click()
  await page.waitForSelector('text=性能遥测', { timeout: 20_000 })
  await shot(page, '08-drawer-dark-overview.png')
  await page.getByRole('tab', { name: '网络' }).click()
  await shot(page, '09-drawer-dark-network.png')

  // 深色模式下的弹窗：标题带 / 页脚必须是可读的深色，不能出现白块
  await page.getByRole('tab', { name: '快照' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '新建快照' }).click()
  await page.waitForTimeout(400)
  const darkDialog = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    const target = dialogs.find((d) => (d.textContent ?? '').includes('记录当前磁盘状态'))
    if (!target) return null
    const header = target.firstElementChild
    const footer = [...target.children].reverse().find((el) => el.tagName === 'DIV' && el.querySelector('button'))
    const title = target.querySelector('h2, [id^="radix"]')
    const parse = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const bright = (c) => {
      const [r, g, b] = parse(c)
      return 0.299 * r + 0.587 * g + 0.114 * b
    }
    return {
      headerBg: header ? getComputedStyle(header).backgroundColor : null,
      footerBg: footer ? getComputedStyle(footer).backgroundColor : null,
      titleColor: title ? getComputedStyle(title).color : null,
      headerLum: header ? bright(getComputedStyle(header).backgroundColor) : null,
      titleLum: title ? bright(getComputedStyle(title).color) : null
    }
  })
  check(
    '深色模式弹窗头部与页脚保持深色',
    Boolean(darkDialog) && darkDialog.headerLum < 80 && (darkDialog.footerBg !== 'rgb(255, 255, 255)'),
    JSON.stringify(darkDialog)
  )
  check(
    '深色模式弹窗标题为浅色文字',
    Boolean(darkDialog) && darkDialog.titleLum > 180,
    JSON.stringify({ title: darkDialog?.titleColor })
  )
  await shot(page, '33-dialog-snapshot-dark.png')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // 运行概览：任务日志、可关闭告警
  await page.locator('aside').getByRole('button', { name: '总览' }).click()
  await page.waitForTimeout(700)
  const alertClose = page.getByRole('button', { name: '关闭告警' })
  check('运行概览告警条有闭合入口', (await alertClose.count()) > 0)
  if ((await alertClose.count()) > 0) {
    await alertClose.first().click()
    await page.waitForTimeout(250)
    check('运行概览告警条可关闭', (await alertClose.count()) === 0)
  }

  const overviewTask = page.getByRole('button', { name: /查看任务日志/ }).first()
  check('概览任务行可打开日志', (await overviewTask.count()) > 0)
  if ((await overviewTask.count()) > 0) {
    await overviewTask.click()
    await page.waitForTimeout(500)
    const taskLog = await page.evaluate(() => document.body.innerText)
    check('概览任务日志有内容', taskLog.includes('任务日志') && taskLog.includes('TASK OK'), taskLog.slice(0, 180))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  const failedTask = page.getByRole('button', { name: /查看任务日志：(迁移虚拟机|qmmigrate)/ }).first()
  if ((await failedTask.count()) > 0) {
    await failedTask.click()
    await page.waitForTimeout(500)
    const failedLog = await page.evaluate(() => document.body.innerText)
    check(
      '无日志任务显示状态与退出码而不是空白',
      failedLog.includes('任务没有返回日志输出') && failedLog.includes('migration aborted'),
      failedLog.slice(0, 180)
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  // AI 助手 + 侧边栏收起
  await page.locator('aside').getByRole('button', { name: 'AI 助手' }).click()
  await page.waitForTimeout(600)
  const aiShell = await page.evaluate(() => ({
    heading: document.body.innerText.includes('AI 运维助手'),
    configured: document.body.innerText.includes('OpenAI / GPT'),
    textarea: Boolean(document.querySelector('textarea[placeholder*="告诉 AI"]'))
  }))
  check('AI 助手入口与界面可用', aiShell.heading && aiShell.configured && aiShell.textarea, JSON.stringify(aiShell))

  const aiInput = page.locator('textarea[placeholder*="告诉 AI"]').first()
  await aiInput.fill('列出所有虚拟机')
  await page.getByRole('button', { name: '发送' }).last().click()
  await page.waitForTimeout(220)
  const aiStreaming = await page.evaluate(() => ({
    text: document.body.innerText.includes('集群状态'),
    markdown: Boolean(document.querySelector('.markdown-body')),
    streamingLabel: document.body.innerText.includes('STREAMING')
  }))
  check('AI 流式输出可见', aiStreaming.text && aiStreaming.markdown && aiStreaming.streamingLabel, JSON.stringify(aiStreaming))
  await page.waitForTimeout(750)
  const aiReply = await page.evaluate(() => document.body.innerText)
  check('AI 对话返回结果', aiReply.includes('这是 mock AI 的回复'), aiReply.slice(0, 200))
  const aiMarkdown = await page.evaluate(() => {
    const body = document.querySelector('.markdown-body')
    return {
      heading: body?.textContent?.includes('集群状态') ?? false,
      bold: body?.querySelector('strong')?.textContent ?? '',
      list: Boolean(body?.querySelector('li')),
      quote: Boolean(body?.querySelector('blockquote'))
    }
  })
  check(
    'AI 回复按 Markdown 渲染（标题/粗体/列表/引用）',
    aiMarkdown.heading && aiMarkdown.bold === '节点' && aiMarkdown.list && aiMarkdown.quote,
    JSON.stringify(aiMarkdown)
  )
  const activeHighlight = await page.evaluate(() => {
    const aside = document.querySelector('aside')
    const active = aside?.querySelector('nav button[aria-current="page"]')
    return {
      aside: Math.round(aside?.getBoundingClientRect().width ?? 0),
      item: Math.round(active?.getBoundingClientRect().width ?? 0)
    }
  })
  check(
    '侧栏高亮宽度与侧栏一致',
    activeHighlight.aside > 0 && Math.abs(activeHighlight.aside - activeHighlight.item) <= 2,
    JSON.stringify(activeHighlight)
  )

  await page.getByRole('button', { name: '收起侧边栏' }).click()
  await page.waitForTimeout(350)
  const collapsed = await page.evaluate(() => {
    const aside = document.querySelector('aside')
    return {
      attr: aside?.getAttribute('data-sidebar-collapsed'),
      width: Math.round(aside?.getBoundingClientRect().width ?? 0)
    }
  })
  check('侧边栏可收起为图标栏', collapsed.attr === 'true' && collapsed.width <= 64, JSON.stringify(collapsed))
  await page.getByRole('button', { name: '展开侧边栏' }).click()
  await page.waitForTimeout(300)

  await page.locator('aside').getByRole('button', { name: '首选项' }).click()
  await page.waitForTimeout(600)
  const aiSettings = await page.evaluate(() => ({
    provider: Boolean(document.querySelector('[aria-label="AI 服务商"]')),
    permission: Boolean(document.querySelector('[aria-label="AI 权限边界"]')),
    key: Boolean(document.querySelector('[aria-label="AI API Key"]')),
    test: document.body.innerText.includes('测试连接')
  }))
  check(
    '设置页包含 AI 服务商 / 权限边界 / Key / 测试连接',
    aiSettings.provider && aiSettings.permission && aiSettings.key && aiSettings.test,
    JSON.stringify(aiSettings)
  )

  // 控制台窗口
  const consolePage = await context.newPage()
  consolePage.on('pageerror', (e) => logs.push(`[console-window] ${e.message}`))
  await consolePage.addInitScript(consoleMock, { theme: 'dark' })
  await consolePage.setViewportSize({ width: 1280, height: 780 })
  await consolePage.goto(`http://127.0.0.1:${port}/index.html?console=1`)
  await consolePage.waitForSelector('[data-console-root]', { timeout: 20_000 })
  await consolePage.waitForTimeout(1800)
  await consolePage.screenshot({ path: path.join(outDir, '10-console-dark.png') })

  const noVncTools = await consolePage.evaluate(() => {
    const labels = [...document.querySelectorAll('[data-console-root] button[aria-label]')].map((b) =>
      b.getAttribute('aria-label')
    )
    return {
      quality: labels.some((label) => label?.startsWith('画质：')),
      cursor: labels.includes('本地光标') || labels.includes('关闭本地光标'),
      shortcuts: labels.includes('快捷键'),
      fullscreen: labels.some((label) => label === '全屏' || label === '退出全屏')
    }
  })
  check('noVNC 工具栏有画质切换', noVncTools.quality, JSON.stringify(noVncTools))
  check('noVNC 工具栏有本地光标开关', noVncTools.cursor, JSON.stringify(noVncTools))
  check('noVNC 工具栏有快捷键入口', noVncTools.shortcuts, JSON.stringify(noVncTools))
  check('noVNC 工具栏有全屏按钮', noVncTools.fullscreen, JSON.stringify(noVncTools))

  await consolePage.locator('[aria-label^="画质："]').click()
  await consolePage.waitForTimeout(300)
  const qualityDialog = await consolePage.evaluate(() => {
    const text = document.body.innerText
    return {
      open: text.includes('VNC 连接质量'),
      presets: ['流畅', '均衡', '高清'].every((label) => text.includes(label))
    }
  })
  check('画质弹窗包含三档预设', qualityDialog.open && qualityDialog.presets, JSON.stringify(qualityDialog))
  await consolePage.screenshot({ path: path.join(outDir, '10b-console-quality.png') })
  await consolePage.keyboard.press('Escape')
  await consolePage.waitForTimeout(250)

  await consolePage.locator('[aria-label="快捷键"]').click()
  await consolePage.waitForTimeout(300)
  const shortcutDialog = await consolePage.evaluate(() => {
    const text = document.body.innerText
    return {
      open: text.includes('VNC 快捷键'),
      cad: text.includes('Ctrl + Alt + Del'),
      f1: text.includes('Ctrl + Alt + F1'),
      paste: text.includes('粘贴本机剪贴板')
    }
  })
  check(
    '快捷键弹窗包含 CAD / F1 / 粘贴',
    shortcutDialog.open && shortcutDialog.cad && shortcutDialog.f1 && shortcutDialog.paste,
    JSON.stringify(shortcutDialog)
  )
  await consolePage.screenshot({ path: path.join(outDir, '10c-console-shortcuts.png') })
  await consolePage.keyboard.press('Escape')
  await consolePage.waitForTimeout(250)

  const consoleMetrics = await consolePage.evaluate(() => {
    const rootEl = document.querySelector('[data-console-root]')
    const header = rootEl.querySelector('header')
    const canvas = rootEl.querySelector('.relative.min-h-0.flex-1')
    const hasFooterText = rootEl.textContent.includes('本地回环桥')
    return {
      rootH: Math.round(rootEl.getBoundingClientRect().height),
      headerH: Math.round(header.getBoundingClientRect().height),
      canvasH: Math.round(canvas.getBoundingClientRect().height),
      hasFooterText,
      scrollH: document.documentElement.scrollHeight
    }
  })
  check('控制台无底部状态条', !consoleMetrics.hasFooterText, JSON.stringify(consoleMetrics))
  check(
    '控制台画布顶到窗口底部',
    consoleMetrics.canvasH >= consoleMetrics.rootH - consoleMetrics.headerH - 1,
    JSON.stringify(consoleMetrics)
  )
  check('控制台无纵向溢出', consoleMetrics.scrollH <= 780, `scrollH=${consoleMetrics.scrollH}`)

  await consolePage.evaluate(async () => window.pvevdi.updatePreferences({ theme: 'light' }))
  await consolePage.waitForTimeout(1000)
  const consoleLight = await consolePage.evaluate(() => ({
    cls: document.documentElement.className,
    headerBg: getComputedStyle(document.querySelector('[data-console-root] header')).backgroundColor,
    canvasBg: getComputedStyle(document.querySelector('[data-console-root] .relative.min-h-0.flex-1')).backgroundColor
  }))
  check('控制台跟随日夜切换', consoleLight.cls.includes('light'), JSON.stringify(consoleLight))
  await consolePage.screenshot({ path: path.join(outDir, '11-console-light.png') })
} catch (err) {
  results.push(`FAIL  脚本异常 — ${err.message}`)
  console.error(err)
} finally {
  console.log(results.join('\n'))
  if (logs.length) console.log('\nrenderer 错误日志:\n' + logs.slice(0, 15).join('\n'))
  await browser.close().catch(() => {})
  server.close()
}
