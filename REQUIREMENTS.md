# TabCleaner 功能优化需求文档

**文档版本**: 1.0
**创建日期**: 2025-12-06
**最后更新**: 2025-12-06
**状态**: 待实施

---

## 📋 目录

1. [需求概述](#需求概述)
2. [需求1: 临时保护状态显示与倒计时](#需求1-临时保护状态显示与倒计时)
3. [需求2: 路径匹配粒度控制](#需求2-路径匹配粒度控制)
4. [技术实施方案](#技术实施方案)
5. [验收标准](#验收标准)
6. [风险评估](#风险评估)

---

## 需求概述

### 背景
当前 TabCleaner 扩展已具备基础的标签页保护功能(临时保护 24h/1周 + 永久白名单),但在用户体验方面存在以下痛点:

1. **缺乏状态反馈**: 用户点击临时保护后,无法直观看到当前标签页是否已处于保护状态,以及剩余保护时间
2. **粒度控制不足**: 永久白名单只提供一个输入框,用户需要手动编写通配符规则,门槛较高且容易出错

### 目标
通过本次优化,实现:
- ✅ **可视化保护状态**: 让用户清晰了解标签页的保护情况
- ✅ **智能路径建议**: 自动生成多种粒度的 URL 匹配规则,降低使用门槛
- ✅ **统一交互体验**: 临时保护和永久保护使用相同的路径选择逻辑

---

## 需求1: 临时保护状态显示与倒计时

### 用户故事
> 作为一个用户,当我为某个标签页设置了 24 小时临时保护后,我希望能够在 Popup 界面中**清晰看到该标签页当前处于保护状态**,并且能够**实时查看剩余保护时间**,以便我决定是否需要延长或取消保护。

### 功能描述

#### 1.1 保护状态指示器

**位置**: "Tab Protection" 卡片顶部
**显示时机**:
- 当前标签页处于临时保护状态时显示
- 当前标签页未被保护时不显示

**内容示例**:
```
┌─────────────────────────────────────────┐
│ 🛡️ Tab Protection                       │
├─────────────────────────────────────────┤
│ ✅ 当前标签页已保护                       │
│ ⏱️ 剩余时间: 23小时45分钟                 │
│ 📅 过期时间: 2025-12-07 14:30           │
└─────────────────────────────────────────┘
```

**未保护状态**:
什么也不显示。

#### 1.2 倒计时更新机制

- **更新频率**: 每 5 秒更新一次(与现有的 `loadTabStatus` 同步)
- **显示格式**:
  - 剩余时间 > 24 小时: `X天Y小时`
  - 剩余时间 1-24 小时: `X小时Y分钟`
  - 剩余时间 < 1 小时: `X分钟Y秒`
  - 剩余时间 < 1 分钟: `X秒`

#### 1.3 视觉设计

**保护状态卡片样式**:
- 背景色: 浅绿色渐变 (`linear-gradient(135deg, #d4f8e8 0%, #abecd6 100%)`)
- 边框: 绿色边框 (`2px solid #51cf66`)
- 图标: 使用 Font Awesome 的 `fa-shield-check` (保护中) / `fa-shield-alt` (未保护)
- 动画: 保护状态切换时使用淡入淡出动画 (0.3s ease)

**倒计时文本样式**:
- 字体: 16px 加粗
- 颜色: 深绿色 `#2d7a4e`
- 当剩余时间 < 1 小时时,颜色变为橙色 `#ff922b` (警告状态)
- 当剩余时间 < 10 分钟时,颜色变为红色 `#ff6b6b` (紧急状态)

#### 1.4 交互行为

**快捷延长功能**:
在保护状态卡片中增加快捷按钮:
```
┌─────────────────────────────────────────┐
│ ✅ 当前标签页已保护                       │
│ ⏱️ 剩余时间: 2小时30分钟                  │
│                                         │
│ [+1小时] [+24小时] [取消保护]            │
└─────────────────────────────────────────┘
```

- **+1小时**: 在当前过期时间基础上延长 1 小时
- **+24小时**: 在当前过期时间基础上延长 24 小时
- **取消保护**: 立即移除临时保护,恢复为普通标签页

---

## 需求2: 路径匹配粒度控制

### 用户故事
> 作为一个用户,当我想要保护某个网站的标签页时,我希望能够**快速选择不同粒度的 URL 匹配规则**,而不是手动编写复杂的通配符模式。例如,我可能只想保护某个具体页面、某个路径下的所有页面,或者整个域名下的所有页面。

### 功能描述

#### 2.1 自动生成三种路径选项

当用户打开 Popup 时,自动根据当前标签页的 URL 生成以下三种匹配规则:

| 选项名称 | 匹配粒度 | 生成规则 | 示例 URL | 生成结果 |
|---------|---------|---------|---------|---------|
| **完整路径** | 精确匹配 | `protocol://domain/path` (去除查询参数和锚点) | `https://github.com/user/repo/issues/123?tab=comments#issuecomment-456` | `https://github.com/user/repo/issues/123` |
| **路径通配符** | 同级路径 | `domain/path/.../*` (最后一级路径替换为 `*`) | `https://github.com/user/repo/issues/123` | `github.com/user/repo/issues/*` |
| **域名通配符** | 整站匹配 | `domain/*` | `https://github.com/user/repo/issues/123` | `github.com/*` |

**特殊情况处理**:

1. **根路径** (如 `https://example.com/`)
   - 完整路径: `https://example.com/`
   - 路径通配符: `example.com/*` (无子路径,直接使用域名通配符)
   - 域名通配符: `example.com/*`

2. **带端口号** (如 `http://localhost:3000/app/dashboard`)
   - 完整路径: `http://localhost:3000/app/dashboard`
   - 路径通配符: `localhost:3000/app/*`
   - 域名通配符: `localhost:3000/*`

3. **子域名** (如 `https://docs.github.com/en/get-started`)
   - 完整路径: `https://docs.github.com/en/get-started`
   - 路径通配符: `docs.github.com/en/*`
   - 域名通配符: `docs.github.com/*`
   - (可选) 增加第四个选项: `*.github.com/*` (匹配所有子域名)

#### 2.2 UI 布局设计

**新增"路径选择器"区域** (位于"Permanent Whitelist"下方):

```
┌──────────────────────────────────────────────────────┐
│ 📋 Permanent Whitelist                               │
├──────────────────────────────────────────────────────┤
│ ℹ️ 选择要保护的 URL 范围:                              │
│                                                      │
│ ○ 完整路径 (仅匹配此页面)                             │
│   https://github.com/user/repo/issues/123           │
│                                                      │
│ ⦿ 路径通配符 (匹配同级路径)                           │
│   github.com/user/repo/issues/*                     │
│                                                      │
│ ○ 域名通配符 (匹配整个网站)                           │
│   github.com/*                                      │
│                                                      │
│ 自定义规则:                                           │
│ [___________________________________________]        │
│                                                      │
│ [24小时] [1周] [永久保护] [移除保护]                  │
└──────────────────────────────────────────────────────┘
```

**交互规则**:
1. 使用**单选按钮** (radio button),一次只能选择一种粒度
2. 默认选中"路径通配符"(中间选项,平衡精确性和灵活性)
3. 每个选项包含:
   - 单选按钮 (`<input type="radio">`)
   - 粒度说明文本 (如"仅匹配此页面")
   - 可编辑的 URL 文本框 (`<input type="text">`)
4. 额外提供一个"自定义规则"输入框,允许用户完全自定义
5. 点击保护按钮时,读取当前选中选项的 URL 值

#### 2.3 文本编辑功能

**可编辑性**:
- 所有 URL 文本框均可手动编辑
- 编辑后,该选项自动被选中
- 编辑时支持常用快捷键 (Ctrl+A 全选, Ctrl+C 复制等)

**实时校验**:
- 当用户手动编辑 URL 时,进行基础格式校验:
  - ✅ 允许的字符: `a-z A-Z 0-9 - . * / : _ ~`
  - ❌ 禁止的字符: `空格 , ; & = ? #`
- 如果输入非法字符,文本框边框变为红色,并显示提示信息
- 提示信息示例: "⚠️ URL 规则不能包含查询参数或特殊字符"

#### 2.4 保护按钮行为调整

**原有按钮**:
- `24小时` / `1周`: 设置临时保护 (使用选中的 URL 规则设置 `idleTime[tabId]`)
- `永久保护`: 添加到白名单 (将选中的 URL 规则添加到 `whitelist`)
- `移除保护`: 从白名单移除 (删除匹配的规则)

**新增逻辑**:
1. 点击保护按钮前,检查当前选中的 URL 规则
2. 临时保护 (24h/1周):
   - 将选中的 URL 规则**临时存储**到 `chrome.storage.local.tempProtectedUrls`
   - 在 `background.js` 检查时,匹配 `tempProtectedUrls` 中的规则
3. 永久保护:
   - 将选中的 URL 规则添加到 `whitelist` 数组
   - 去重: 如果已存在,提示"该规则已在白名单中"

#### 2.5 与现有白名单管理的整合

**白名单列表显示** (可选增强功能):
在"Permanent Whitelist"卡片中增加已保存规则的列表:

```
┌──────────────────────────────────────────────────────┐
│ 📋 已保护的网站:                                      │
│                                                      │
│ ✅ github.com/*                          [删除]      │
│ ✅ docs.google.com/*                     [删除]      │
│ ✅ localhost:3000/*                      [删除]      │
└──────────────────────────────────────────────────────┘
```

**显示规则**:
- 最多显示 5 条规则
- 超过 5 条时,显示"还有 X 个规则..."并提供"查看全部"按钮
- 每条规则右侧有"删除"按钮,点击后从白名单移除

---

## 技术实施方案

### 3.1 数据结构设计

#### 存储结构 (chrome.storage.local)

```javascript
{
  // 现有字段
  "idleLimit": 1800000,  // 闲置时间限制 (毫秒)
  "whitelist": [         // 永久白名单
    "github.com/*",
    "localhost:3000/*"
  ],

  // 新增字段
  "tempProtectedUrls": { // 临时保护的 URL 规则
    "123": {             // tabId 作为 key
      "url": "github.com/user/repo/issues/*",
      "expiresAt": 1733476800000  // 过期时间戳
    }
  }
}
```

#### 内存数据 (background.js)

```javascript
// 现有
let idleTime = {
  123: 1733390400000  // tabId: 最后活跃时间戳 或 过期时间戳
};

// 新增: 区分临时保护和正常闲置
let protectionExpiry = {  // 临时保护过期时间
  123: 1733476800000      // tabId: 过期时间戳
};
```

### 3.2 核心函数实现

#### popup.js 中的新增函数

```javascript
/**
 * 根据当前标签页 URL 生成三种粒度的匹配规则
 * @param {string} url - 原始 URL
 * @returns {Object} { full, path, domain }
 */
function generateUrlPatterns(url) {
  try {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol;
    const hostname = urlObj.hostname;
    const port = urlObj.port ? `:${urlObj.port}` : '';
    const pathname = urlObj.pathname;

    // 1. 完整路径 (去除查询参数和锚点)
    const full = `${protocol}//${hostname}${port}${pathname}`;

    // 2. 路径通配符 (最后一级替换为 *)
    const pathSegments = pathname.split('/').filter(s => s);
    let pathPattern;
    if (pathSegments.length === 0) {
      pathPattern = `${hostname}${port}/*`;
    } else {
      pathSegments[pathSegments.length - 1] = '*';
      pathPattern = `${hostname}${port}/${pathSegments.join('/')}`;
    }

    // 3. 域名通配符
    const domain = `${hostname}${port}/*`;

    return { full, path: pathPattern, domain };
  } catch (e) {
    console.error('Invalid URL:', url);
    return { full: '', path: '', domain: '' };
  }
}

/**
 * 获取当前标签页的保护状态
 * @param {number} tabId
 * @returns {Promise<Object|null>} { expiresAt, remainingMs }
 */
async function getProtectionStatus(tabId) {
  const result = await chrome.storage.local.get(['tempProtectedUrls']);
  const tempProtected = result.tempProtectedUrls || {};

  if (tempProtected[tabId]) {
    const expiresAt = tempProtected[tabId].expiresAt;
    const remainingMs = expiresAt - Date.now();

    if (remainingMs > 0) {
      return { expiresAt, remainingMs };
    } else {
      // 过期,清理数据
      delete tempProtected[tabId];
      await chrome.storage.local.set({ tempProtectedUrls: tempProtected });
      return null;
    }
  }

  return null;
}

/**
 * 格式化剩余时间
 * @param {number} ms - 毫秒数
 * @returns {string} 格式化的时间字符串
 */
function formatRemainingTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}天${hours % 24}小时`;
  } else if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分钟${seconds % 60}秒`;
  } else {
    return `${seconds}秒`;
  }
}

/**
 * 更新保护状态显示
 */
async function updateProtectionStatusDisplay() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) return;

  const tabId = tabs[0].id;
  const status = await getProtectionStatus(tabId);

  const statusCard = document.getElementById('protectionStatusCard');

  if (status) {
    const timeText = formatRemainingTime(status.remainingMs);
    const expiresDate = new Date(status.expiresAt);
    const colorClass = status.remainingMs < 3600000 ? 'warning' :
                       status.remainingMs < 600000 ? 'danger' : 'success';

    statusCard.innerHTML = `
      <div class="protection-active ${colorClass}">
        <i class="fas fa-shield-check"></i>
        <span>当前标签页已保护</span>
        <div class="countdown">⏱️ 剩余时间: ${timeText}</div>
        <div class="expire-time">📅 过期时间: ${expiresDate.toLocaleString('zh-CN')}</div>
        <div class="quick-actions">
          <button class="extend-protection" data-hours="1">+1小时</button>
          <button class="extend-protection" data-hours="24">+24小时</button>
          <button class="cancel-protection">取消保护</button>
        </div>
      </div>
    `;
  } else {
    statusCard.innerHTML = `
      <div class="protection-inactive">
        <i class="fas fa-shield-alt"></i>
        <span>当前标签页未设置临时保护</span>
      </div>
    `;
  }
}
```

#### background.js 中的修改

```javascript
// 修改检查逻辑,支持 URL 规则匹配
async function shouldProtectTab(tabId, tabUrl) {
  // 1. 检查永久白名单
  const whitelist = (await getFromLocalStorage("whitelist")) || [];
  if (isWhitelisted(tabUrl, whitelist)) {
    return true;
  }

  // 2. 检查临时保护规则
  const tempProtected = (await getFromLocalStorage("tempProtectedUrls")) || {};
  if (tempProtected[tabId]) {
    const { url: pattern, expiresAt } = tempProtected[tabId];
    const now = Date.now();

    if (now < expiresAt && matchesPattern(tabUrl, pattern)) {
      return true;
    } else if (now >= expiresAt) {
      // 过期,清理数据
      delete tempProtected[tabId];
      await chrome.storage.local.set({ tempProtectedUrls: tempProtected });
    }
  }

  return false;
}

// 通配符匹配函数
function matchesPattern(url, pattern) {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return regex.test(url);
}
```

### 3.3 UI 组件设计

#### HTML 结构修改

在 `popup.html` 的 "Tab Protection" section 中:

```html
<div class="section">
  <div class="section-title">
    <i class="fas fa-shield-alt"></i>
    <span data-i18n="protectionCurrentTab">Tab Protection</span>
  </div>

  <!-- 新增: 保护状态卡片 -->
  <div id="protectionStatusCard" class="protection-status-card">
    <!-- 动态内容由 JS 填充 -->
  </div>

  <!-- 原有的临时保护按钮 -->
  <div class="info-card">
    <p><i class="fas fa-info-circle"></i><span data-i18n="temporaryProtection">Temporary Protection</span></p>
    <ul>
      <li data-i18n="temporaryProtectionDesc">Protect current tab from being discarded for a specific duration</li>
    </ul>
  </div>
  <div class="button-row" style="grid-template-columns: 1fr 1fr 1fr;">
    <button id="ignoreTab24Hour" class="success">
      <i class="fas fa-clock"></i><span data-i18n="dontDiscardIn24h">24h</span>
    </button>
    <button id="ignoreTab1Week" class="success">
      <i class="fas fa-calendar-week"></i><span data-i18n="dontDiscardIn1Week">1w</span>
    </button>
    <button id="resetProtect" class="secondary">
      <i class="fas fa-undo"></i><span data-i18n="resetProtection">Reset</span>
    </button>
  </div>

  <!-- 新增: 路径选择器 -->
  <div class="info-card">
    <p><i class="fas fa-list"></i><span data-i18n="permanentProtection">Permanent Whitelist</span></p>
    <ul>
      <li>选择要保护的 URL 范围:</li>
    </ul>
  </div>

  <div class="url-pattern-selector">
    <label class="pattern-option">
      <input type="radio" name="urlPattern" value="full" />
      <span class="pattern-label">完整路径 (仅匹配此页面)</span>
      <input type="text" id="urlPatternFull" class="pattern-input" />
    </label>

    <label class="pattern-option">
      <input type="radio" name="urlPattern" value="path" checked />
      <span class="pattern-label">路径通配符 (匹配同级路径)</span>
      <input type="text" id="urlPatternPath" class="pattern-input" />
    </label>

    <label class="pattern-option">
      <input type="radio" name="urlPattern" value="domain" />
      <span class="pattern-label">域名通配符 (匹配整个网站)</span>
      <input type="text" id="urlPatternDomain" class="pattern-input" />
    </label>

    <label class="pattern-option">
      <span class="pattern-label">自定义规则:</span>
      <input type="text" id="urlPatternCustom" class="pattern-input" placeholder="输入自定义规则..." />
    </label>
  </div>

  <div class="button-row" style="grid-template-columns: 1fr 1fr 1fr 1fr; margin-top: 12px;">
    <button id="protect24Hour" class="success">
      <i class="fas fa-clock"></i><span>24小时</span>
    </button>
    <button id="protect1Week" class="success">
      <i class="fas fa-calendar-week"></i><span>1周</span>
    </button>
    <button id="protectPermanent" class="success">
      <i class="fas fa-infinity"></i><span>永久</span>
    </button>
    <button id="removeProtection" class="danger">
      <i class="fas fa-trash"></i><span>移除</span>
    </button>
  </div>
</div>
```

#### CSS 样式新增

```css
/* 保护状态卡片 */
.protection-status-card {
  margin-bottom: 12px;
  border-radius: 10px;
  overflow: hidden;
}

.protection-active {
  background: linear-gradient(135deg, #d4f8e8 0%, #abecd6 100%);
  border: 2px solid #51cf66;
  padding: 16px;
  text-align: center;
}

.protection-active.warning {
  background: linear-gradient(135deg, #fff3bf 0%, #ffe066 100%);
  border-color: #ff922b;
}

.protection-active.danger {
  background: linear-gradient(135deg, #ffe0e0 0%, #ffb3b3 100%);
  border-color: #ff6b6b;
}

.protection-active i {
  font-size: 24px;
  color: #2d7a4e;
  margin-bottom: 8px;
}

.countdown {
  font-size: 16px;
  font-weight: 600;
  color: #2d7a4e;
  margin: 8px 0;
}

.expire-time {
  font-size: 12px;
  color: #4a5568;
  margin-bottom: 12px;
}

.quick-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.quick-actions button {
  padding: 6px 10px;
  font-size: 10px;
}

.protection-inactive {
  background: rgba(102, 126, 234, 0.05);
  border: 1px solid rgba(102, 126, 234, 0.2);
  padding: 12px;
  text-align: center;
  color: #4a5568;
}

/* 路径选择器 */
.url-pattern-selector {
  margin-top: 12px;
}

.pattern-option {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px;
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.5);
  transition: all 0.3s ease;
  cursor: pointer;
}

.pattern-option:hover {
  background: rgba(102, 126, 234, 0.05);
  border-color: #667eea;
}

.pattern-option input[type="radio"] {
  flex-shrink: 0;
  cursor: pointer;
}

.pattern-label {
  font-size: 11px;
  font-weight: 500;
  color: #4a5568;
  min-width: 120px;
  flex-shrink: 0;
}

.pattern-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 6px;
  font-size: 11px;
  font-family: 'SF Mono', Monaco, monospace;
  background: white;
}

.pattern-input:focus {
  border-color: #667eea;
  outline: none;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.pattern-input.error {
  border-color: #ff6b6b;
  background: #fff5f5;
}
```

---

## 验收标准

### 需求1 验收标准

- [ ] **状态显示**: 当标签页处于临时保护状态时,在 Popup 中能够看到绿色的保护状态卡片
- [ ] **倒计时准确性**: 倒计时每 5 秒更新一次,误差不超过 5 秒
- [ ] **时间格式正确**: 不同时间范围使用正确的显示格式 (天/小时/分钟/秒)
- [ ] **颜色预警**: 剩余时间 < 1 小时时显示橙色,< 10 分钟时显示红色
- [ ] **快捷延长功能**: 点击 +1小时/+24小时 按钮后,倒计时正确增加
- [ ] **取消保护**: 点击"取消保护"按钮后,保护状态立即移除,卡片显示"未设置临时保护"
- [ ] **过期自动清理**: 保护时间到期后,自动清理数据并更新 UI

### 需求2 验收标准

- [ ] **路径自动生成**: 打开 Popup 时,自动生成三种粒度的 URL 规则
- [ ] **生成规则正确**:
  - 完整路径: 正确移除查询参数和锚点
  - 路径通配符: 最后一级路径替换为 `*`
  - 域名通配符: 只保留 `hostname:port/*`
- [ ] **单选互斥**: 单选按钮正常工作,一次只能选中一个选项
- [ ] **文本可编辑**: 所有 URL 输入框都可以手动编辑
- [ ] **编辑自动选中**: 手动编辑某个输入框时,对应的单选按钮自动被选中
- [ ] **保护按钮集成**:
  - 点击"24小时"/"1周"按钮,使用选中的 URL 规则设置临时保护
  - 点击"永久"按钮,将选中的 URL 规则添加到白名单
  - 点击"移除"按钮,从白名单中移除匹配的规则
- [ ] **去重检查**: 添加已存在的规则时,显示提示"该规则已在白名单中"
- [ ] **实时校验**: 输入非法字符时,输入框变红并显示错误提示

### 跨功能测试

- [ ] **数据持久化**: 关闭浏览器后重新打开,临时保护状态和白名单数据正确保留
- [ ] **多窗口同步**: 在多个窗口中打开 Popup,状态显示一致
- [ ] **边界情况**:
  - 特殊 URL (chrome://, file://, localhost, 带端口号, 子域名) 正确处理
  - 根路径 URL (如 `https://example.com/`) 正确生成规则
  - 过长的 URL 在 UI 中正确显示 (使用省略号或滚动)
- [ ] **性能**: Popup 打开速度 < 500ms,倒计时更新不卡顿

---

## 风险评估

### 技术风险

| 风险项 | 严重程度 | 发生概率 | 应对措施 |
|-------|---------|---------|---------|
| Service Worker 生命周期限制导致倒计时不准确 | 中 | 中 | 将过期时间存储在 `chrome.storage.local` 而非内存,避免 Service Worker 重启导致数据丢失 |
| URL 正则匹配性能问题 (白名单规则过多) | 低 | 低 | 使用 `startsWith` 等简单匹配优先,复杂通配符才用正则;限制白名单条目上限 (如 100 条) |
| 不同浏览器 URL 解析差异 | 低 | 低 | 统一使用 `URL` 对象解析,避免字符串操作 |
| Popup 高频更新导致性能问题 | 低 | 低 | 使用防抖 (debounce) 限制更新频率;仅在 Popup 打开时启动定时器,关闭时清理 |

### 用户体验风险

| 风险项 | 严重程度 | 应对措施 |
|-------|---------|---------|
| 用户不理解三种粒度的区别 | 中 | 在每个选项后增加示例说明,如"(如: 匹配 /issues/123, /issues/456)" |
| 倒计时频繁跳动造成干扰 | 低 | 使用过渡动画,避免突兀的数字变化 |
| 临时保护和永久保护概念混淆 | 中 | 使用不同的颜色和图标区分;在 UI 中明确标注"临时"和"永久" |
| 误操作删除白名单规则 | 低 | 删除前增加二次确认弹窗 |

### 兼容性风险

| 风险项 | 应对措施 |
|-------|---------|
| Chrome 不同版本 API 差异 | 在 `manifest.json` 中明确 `minimum_chrome_version`,并在代码中做特性检测 |
| 其他 Chromium 浏览器 (Edge, Brave) 兼容性 | 在这些浏览器中进行实际测试 |



## 未来扩展方向

以下功能可在后续版本中考虑:

1. **白名单管理界面**:
   - 提供独立的白名单管理页面,支持批量导入/导出
   - 增加规则优先级排序功能

2. **云同步**:
   - 使用 `chrome.storage.sync` 同步白名单和保护规则到其他设备
