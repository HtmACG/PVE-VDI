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
    allowedTags: []
  },
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
  tasks: []
}

const detail = {
  ref: { node: 'pve', type: 'qemu', vmid: 204 },
  name: 'DBI-Business-Server',
  os: { family: 'linux', name: 'Linux', version: '10.1.2', source: 'agent' },
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
  const { theme, dashboard, detail, imagesData, newModuleData } = payload
  const ok = (data) => Promise.resolve({ ok: true, data })
  const listeners = new Set()
  let current = { serverUrl: 'https://pve.example.com:8006', username: 'root@pam', allowSelfSigned: true, rememberPassword: false, hasSavedPassword: false, credentialStorageAvailable: true, theme: theme, refreshInterval: 8, uiFont: 'inter', customFont: '', accentColor: '#0078d4', networkView: 'cards', launchAtLogin: false, appearanceVersion: 2, appBackground: '' }
  Object.defineProperty(window, 'pvevdi', {
    configurable: true,
    writable: true,
    value: {
      bootstrap: () =>
        ok({
          appVersion: '1.7.0',
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
  await page.addInitScript(mainMock, { theme: 'light', dashboard, detail, imagesData, newModuleData })
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
    { nav: '任务', shot: '21-tasks', key: 'qmmigrate' }
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
  await shot(page, '22-node-ops-subscription.png')

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
  check('集群成员卡保留节点负载区块', clusterCard.hasLoad, JSON.stringify(clusterCard))
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

  // 控制台窗口
  const consolePage = await context.newPage()
  consolePage.on('pageerror', (e) => logs.push(`[console-window] ${e.message}`))
  await consolePage.addInitScript(consoleMock, { theme: 'dark' })
  await consolePage.setViewportSize({ width: 1280, height: 780 })
  await consolePage.goto(`http://127.0.0.1:${port}/index.html?console=1`)
  await consolePage.waitForSelector('[data-console-root]', { timeout: 20_000 })
  await consolePage.waitForTimeout(1800)
  await consolePage.screenshot({ path: path.join(outDir, '10-console-dark.png') })

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
