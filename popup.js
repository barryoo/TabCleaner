// 浏览器兼容性处理：Firefox 使用 browser，Chrome 使用 chrome
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

let whitelistCache = null;

function setWhitelistCache(whitelist) {
  whitelistCache = Array.isArray(whitelist) ? whitelist : [];
}

function getI18nMessageWithFallback(messageId) {
  const message = browserAPI.i18n.getMessage(messageId);
  if (message) return message;

  const uiLanguage = (
    (browserAPI.i18n.getUILanguage && browserAPI.i18n.getUILanguage()) ||
    ""
  ).toLowerCase();
  const isZh = uiLanguage.startsWith("zh");

  const fallbackTable = {
    permanentProtectedTip: {
      zh: "已处于永久保护中",
      en: "Already in permanent whitelist",
    },
    temporaryProtectionExpiresAt: { zh: "过期时间:", en: "Expires at:" },
    cancelTemporaryProtection: {
      zh: "取消临时保护",
      en: "Cancel temporary protection",
    },
  };

  const fallback = fallbackTable[messageId];
  if (!fallback) return "";
  return isZh ? fallback.zh : fallback.en;
}

// 与 background.js 保持一致的匹配逻辑：支持带 protocol / 不带 protocol 的规则
function normalizeUrlForMatching(rawUrl) {
  try {
    const urlObj = new URL(rawUrl);
    const full = urlObj.protocol + "//" + urlObj.host + urlObj.pathname;
    const hostPath = urlObj.host + urlObj.pathname;
    return { full, hostPath };
  } catch (e) {
    return { full: rawUrl, hostPath: rawUrl };
  }
}

function matchesPattern(url, pattern) {
  const escapedPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const regex = new RegExp("^" + escapedPattern + "$");
  return regex.test(url);
}

function matchesUrlPattern(rawUrl, pattern) {
  const normalized = normalizeUrlForMatching(rawUrl);
  if (pattern.includes("://")) {
    const candidates = [pattern];
    // 兼容 https://example.com 与 https://example.com/ 的等价情况（尽量不依赖正则，避免解析差异）
    const schemeIndex = pattern.indexOf("://");
    const afterHostStart = schemeIndex + 3;
    const hasPathSlash = pattern.indexOf("/", afterHostStart) !== -1;
    if (!hasPathSlash) {
      const qIndex = pattern.indexOf("?", afterHostStart);
      const hashIndex = pattern.indexOf("#", afterHostStart);
      const cutIndex = [qIndex, hashIndex].filter((i) => i !== -1).sort()[0];
      if (cutIndex === undefined) {
        candidates.push(pattern + "/");
      } else {
        candidates.push(pattern.slice(0, cutIndex) + "/" + pattern.slice(cutIndex));
      }
    }
    return candidates.some((p) => matchesPattern(normalized.full, p));
  }
  return matchesPattern(normalized.hostPath, pattern);
}

async function refreshWhitelistCache() {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(["whitelist"], (result) => {
      setWhitelistCache(result.whitelist || []);
      resolve(whitelistCache);
    });
  });
}

function updateWhitelistIndicators(whitelist = whitelistCache) {
  if (!whitelist) return;

  document.querySelectorAll(".pattern-protected-indicator").forEach((el) => {
    const inputId = el.getAttribute("data-for");
    const input = inputId ? document.getElementById(inputId) : null;
    const value = input ? input.value.trim() : "";
    const isProtected = Boolean(value) && whitelist.includes(value);
    el.classList.toggle("is-protected", isProtected);
  });
}

// Message display function
function showMessage(messageId, substitutions = null, isError = false) {
  const messageEl = document.getElementById("message");
  const text = substitutions
    ? browserAPI.i18n.getMessage(messageId, substitutions)
    : browserAPI.i18n.getMessage(messageId);

  // Add icon based on message type
  const icon = isError
    ? '<i class="fas fa-exclamation-triangle"></i>'
    : '<i class="fas fa-check-circle"></i>';
  messageEl.innerHTML = icon + " " + text;

  messageEl.classList.toggle("error", isError);
  messageEl.classList.add("show");
  setTimeout(() => {
    messageEl.classList.remove("show");
  }, 3000);
}

// Initialize i18n text
function initializeI18n() {
  // 普通文本
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const messageId = element.getAttribute("data-i18n");
    const message = getI18nMessageWithFallback(messageId);
    if (message) {
      element.textContent = message;
    }
  });

  // 占位符文本
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const messageId = element.getAttribute("data-i18n-placeholder");
    const message = getI18nMessageWithFallback(messageId);
    if (message) {
      element.placeholder = message;
    }
  });

  // 标题提示
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const messageId = element.getAttribute("data-i18n-title");
    const tooltipText = getI18nMessageWithFallback(messageId);
    element.title = tooltipText;
    // 同步给自定义 tooltip 使用（避免仅看到 help 光标但没有原生 title 提示）
    element.setAttribute("data-tooltip", tooltipText);
  });
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  initializeI18n();
  loadIdleLimit();
  loadTabStatus();
  updateProtectionStatusDisplay(); // 初始化保护状态显示
  initializePathSelector(); // 初始化路径选择器
});

// 加载闲置时间限制
function loadIdleLimit() {
  browserAPI.storage.local.get(["idleLimit"], (result) => {
    const idleLimitInput = document.getElementById("idleLimit");
    if (result.idleLimit) {
      idleLimitInput.value = Math.floor(result.idleLimit / 1000);
    } else {
      // 默认30分钟
      idleLimitInput.value = 1800;
    }
  });
}

// discard button
document.getElementById("discardCurrent")?.addEventListener("click", () => {
  discardTabs("current");
  showMessage("tabDiscarded");
  updateTabStatusAfterDiscard();
});

document.getElementById("discardHalfHour")?.addEventListener("click", () => {
  discardTabs("halfHour");
  showMessage("idleTabsDiscarded");
  updateTabStatusAfterDiscard();
});

document.getElementById("discardOthers")?.addEventListener("click", () => {
  discardTabs("others");
  showMessage("otherTabsDiscarded");
  updateTabStatusAfterDiscard();
});

document.getElementById("discardGroup")?.addEventListener("click", () => {
  discardTabs("group");
  showMessage("tabGroupDiscarded");
  updateTabStatusAfterDiscard();
});

// 检查标签页是否可以被丢弃
function canDiscardTab(tab) {
  // 不能丢弃已经被丢弃的标签页
  if (tab.discarded) {
    return false;
  }

  // 不能丢弃活跃的标签页（当前正在查看的）
  if (tab.active) {
    return false;
  }

  // 不能丢弃特殊页面
  const specialUrls = [
    "chrome://",
    "chrome-extension://",
    "moz-extension://",
    "edge://",
    "about:",
    "file://",
  ];

  if (specialUrls.some((prefix) => tab.url.startsWith(prefix))) {
    return false;
  }

  // 不能丢弃正在播放音频的标签页
  if (tab.audible) {
    return false;
  }

  return true;
}

async function discardTabs(option) {
  browserAPI.tabs.query({ currentWindow: true }, async (tabs) => {
    const now = Date.now();
    const activeTabId = tabs.find((tab) => tab.active)?.id;
    let discardedCount = 0;
    let failedCount = 0;

    for (const tab of tabs) {
      let shouldDiscard = false;

      switch (option) {
        case "current":
          shouldDiscard = tab.id === activeTabId;
          break;
        case "halfHour":
          if (tab.id in idleTime) {
            shouldDiscard = now - idleTime[tab.id] > 30 * 60 * 1000; // 30分钟
          }
          break;
        case "others":
          shouldDiscard = tab.id !== activeTabId;
          break;
        case "group":
          const activeGroupId = tabs.find((t) => t.id === activeTabId)?.groupId;
          shouldDiscard = tab.groupId === activeGroupId;
          break;
      }

      if (shouldDiscard) {
        if (canDiscardTab(tab)) {
          try {
            await browserAPI.tabs.discard(tab.id);
            discardedCount++;
            console.log("✅ 成功丢弃标签页: " + tab.title);
          } catch (error) {
            failedCount++;
            console.log(
              '❌ 无法丢弃标签页 "' + tab.title + '": ' + error.message
            );
          }
        } else {
          console.log('⚠️ 跳过标签页 "' + tab.title + '": 不符合丢弃条件');
        }
      }
    }

    // 显示操作结果
    if (discardedCount > 0) {
      console.log(
        "🎉 操作完成: 成功丢弃 " +
          discardedCount +
          " 个标签页" +
          (failedCount > 0 ? ", " + failedCount + " 个失败" : "")
      );
    } else if (failedCount > 0) {
      console.log("⚠️ 操作完成: " + failedCount + " 个标签页无法丢弃");
    } else {
      console.log("ℹ️ 没有找到符合条件的标签页");
    }
  });
}

// 保存闲置时间限制
document.getElementById("save").addEventListener("click", () => {
  const idleLimit = document.getElementById("idleLimit").value;
  const idleLimitInMs = idleLimit * 1000;
  browserAPI.storage.local.set({ idleLimit: idleLimitInMs }, () => {
    showMessage("idleLimitSaved", [idleLimit]);
  });
});

// 加载标签页状态信息
function loadTabStatus() {
  // 添加加载动画
  const activeTabsElement = document.getElementById("activeTabsCount");
  const discardedTabsElement = document.getElementById("discardedTabsCount");
  const totalTabsElement = document.getElementById("totalTabsCount");

  // 添加加载状态
  [activeTabsElement, discardedTabsElement, totalTabsElement].forEach((el) => {
    if (el) {
      el.classList.add("loading");
      el.textContent = "...";
    }
  });

  browserAPI.tabs.query({}, (tabs) => {
    const totalTabs = tabs.length;
    const activeTabs = tabs.filter((tab) => !tab.discarded).length;
    const discardedTabs = tabs.filter((tab) => tab.discarded).length;

    // 延迟更新以显示动画效果
    setTimeout(() => {
      // 移除加载状态并更新数字
      if (activeTabsElement) {
        activeTabsElement.classList.remove("loading");
        activeTabsElement.textContent = activeTabs;
      }
      if (discardedTabsElement) {
        discardedTabsElement.classList.remove("loading");
        discardedTabsElement.textContent = discardedTabs;
      }
      if (totalTabsElement) {
        totalTabsElement.classList.remove("loading");
        totalTabsElement.textContent = totalTabs;
      }
    }, 300);
  });
}

// 在执行丢弃操作后更新状态
function updateTabStatusAfterDiscard() {
  setTimeout(() => {
    loadTabStatus();
  }, 500); // 延迟500ms确保丢弃操作完成
}

// 定期更新标签页状态（每5秒更新一次）
setInterval(() => {
  loadTabStatus();
  updateProtectionStatusDisplay(); // 同时更新保护状态
  refreshWhitelistCache().then(updateWhitelistIndicators); // 同时更新白名单命中提示
}, 5000);

//=============新增功能: URL 路径生成和保护状态管理============

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
    const port = urlObj.port ? ":" + urlObj.port : "";
    const pathname = urlObj.pathname;

    // 1. 完整路径 (去除查询参数和锚点)
    const full = protocol + "//" + hostname + port + pathname;

    // 2. 路径通配符 (最后一级替换为 *)
    const pathSegments = pathname.split("/").filter((s) => s);
    let pathPattern;
    if (pathSegments.length === 0) {
      pathPattern = hostname + port + "/*";
    } else {
      pathSegments[pathSegments.length - 1] = "*";
      pathPattern = hostname + port + "/" + pathSegments.join("/");
    }

    // 3. 域名通配符
    const domain = hostname + port + "/*";

    return { full, path: pathPattern, domain };
  } catch (e) {
    console.error("❌ Invalid URL:", url, e);
    return { full: "", path: "", domain: "" };
  }
}

/**
 * 获取当前标签页的保护状态
 * @param {number} tabId
 * @returns {Promise<Object|null>} { expiresAt, remainingMs, url }
 */
async function getProtectionStatus(tabId) {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(["tempProtectedUrls"], (result) => {
      const tempProtected = result.tempProtectedUrls || {};

      if (tempProtected[tabId]) {
        const expiresAt = tempProtected[tabId].expiresAt;
        const url = tempProtected[tabId].url;
        const remainingMs = expiresAt - Date.now();

        if (remainingMs > 0) {
          resolve({ expiresAt, remainingMs, url });
        } else {
          // 过期,清理数据
          delete tempProtected[tabId];
          browserAPI.storage.local.set(
            { tempProtectedUrls: tempProtected },
            () => {
              resolve(null);
            }
          );
        }
      } else {
        resolve(null);
      }
    });
  });
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
    return days + "天" + (hours % 24) + "小时";
  } else if (hours > 0) {
    return hours + "小时" + (minutes % 60) + "分钟";
  } else if (minutes > 0) {
    return minutes + "分钟" + (seconds % 60) + "秒";
  } else {
    return seconds + "秒";
  }
}

/**
 * 更新保护状态显示
 */
async function updateProtectionStatusDisplay() {
  const tabs = await browserAPI.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tabs.length === 0) return;

  const tabId = tabs[0].id;
  const status = await getProtectionStatus(tabId);

  const statusCard = document.getElementById("protectionStatusCard");
  if (!statusCard) return;

  if (status) {
    const expiresDate = new Date(status.expiresAt);
    const colorClass =
      status.remainingMs < 600000
        ? "danger"
        : status.remainingMs < 3600000
        ? "warning"
        : "success";

    statusCard.innerHTML = [
      '<div class="protection-active mini ' + colorClass + '">',
      '  <i class="fas fa-shield-alt"></i>',
      '  <span class="protection-mini-text">' +
        browserAPI.i18n.getMessage("temporaryProtectionExpiresAt") +
        " " +
        expiresDate.toLocaleString("zh-CN") +
        "</span>",
      '  <button class="cancel-protection-icon" title="' +
        browserAPI.i18n.getMessage("cancelTemporaryProtection") +
        '"><i class="fas fa-times"></i></button>',
      "</div>",
    ].join("\n");

    statusCard
      .querySelector(".cancel-protection-icon")
      ?.addEventListener("click", async () => {
        await cancelProtection(tabId);
        showMessage("protectionCanceled");
        updateProtectionStatusDisplay();
      });
  } else {
    // 未保护状态 - 不显示任何内容
    statusCard.innerHTML = "";
  }
}

/**
 * 延长保护时间
 * @param {number} tabId
 * @param {number} extendMs - 延长的毫秒数
 */
async function extendProtection(tabId, extendMs) {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(["tempProtectedUrls"], (result) => {
      const tempProtected = result.tempProtectedUrls || {};

      if (tempProtected[tabId]) {
        tempProtected[tabId].expiresAt += extendMs;
        browserAPI.storage.local.set(
          { tempProtectedUrls: tempProtected },
          () => {
            console.log("✅ 延长保护时间:", tabId, extendMs / 3600000, "小时");
            resolve();
          }
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * 取消保护
 * @param {number} tabId
 */
async function cancelProtection(tabId) {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(["tempProtectedUrls"], (result) => {
      const tempProtected = result.tempProtectedUrls || {};

      if (tempProtected[tabId]) {
        delete tempProtected[tabId];
        browserAPI.storage.local.set(
          { tempProtectedUrls: tempProtected },
          () => {
            console.log("✅ 取消保护:", tabId);
            // 同时重置 idleTime，让标签页恢复正常计时
            browserAPI.runtime.sendMessage(
              { type: "resetIdleTime", tabId: tabId, time: null },
              resolve
            );
          }
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * 初始化路径选择器
 */
async function initializePathSelector() {
  const tabs = await browserAPI.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tabs.length === 0) return;

  const url = tabs[0].url;
  const patterns = generateUrlPatterns(url);

  // 填充三种粒度的输入框
  const fullInput = document.getElementById("urlPatternFull");
  const pathInput = document.getElementById("urlPatternPath");
  const domainInput = document.getElementById("urlPatternDomain");
  const customInput = document.getElementById("urlPatternCustom");

  if (fullInput) fullInput.value = patterns.full;
  if (pathInput) pathInput.value = patterns.path;
  if (domainInput) domainInput.value = patterns.domain;

  // 监听输入框编辑，自动选中对应的单选按钮
  const setupAutoSelect = (input, radioValue) => {
    if (!input) return;
    input.addEventListener("input", () => {
      const radio = document.querySelector(
        'input[name="urlPattern"][value="' + radioValue + '"]'
      );
      if (radio) radio.checked = true;
      updateWhitelistIndicators();
    });
  };

  setupAutoSelect(fullInput, "full");
  setupAutoSelect(pathInput, "path");
  setupAutoSelect(domainInput, "domain");

  // 自定义输入框自动选中对应的 radio
  if (customInput) {
    customInput.addEventListener("input", () => {
      const radio = document.querySelector(
        'input[name="urlPattern"][value="custom"]'
      );
      if (radio) radio.checked = true;
      updateWhitelistIndicators();
    });
  }

  // 初始化白名单命中提示
  await refreshWhitelistCache();

  // 如果当前标签页已被某条白名单规则保护，但三种建议规则都不在白名单里，
  // 自动把命中的白名单规则展示在“自定义规则”里，让用户能看到是哪条规则在生效。
  if (customInput && !customInput.value.trim() && url && whitelistCache) {
    const matchedRule = whitelistCache.find((p) => matchesUrlPattern(url, p));
    if (matchedRule) {
      customInput.value = matchedRule;
    }
  }

  updateWhitelistIndicators();
}

/**
 * 获取当前选中的 URL 规则
 * @returns {string|null}
 */
function getSelectedUrlPattern() {
  const selectedRadio = document.querySelector(
    'input[name="urlPattern"]:checked'
  );
  if (!selectedRadio) return null;

  const value = selectedRadio.value;
  let input;

  switch (value) {
    case "full":
      input = document.getElementById("urlPatternFull");
      break;
    case "path":
      input = document.getElementById("urlPatternPath");
      break;
    case "domain":
      input = document.getElementById("urlPatternDomain");
      break;
    case "custom":
      input = document.getElementById("urlPatternCustom");
      break;
  }

  return input ? input.value.trim() : null;
}

//=============新增功能: 新保护按钮事件处理============

// 24小时保护按钮
document
  .getElementById("protect24Hour")
  ?.addEventListener("click", async () => {
    const urlPattern = getSelectedUrlPattern();
    if (!urlPattern) {
      showMessage("pleaseSelectPattern", null, true);
      return;
    }

    await protectTabWithPattern(urlPattern, 24 * 60 * 60 * 1000);
    showMessage("tabProtectedFor", [24]);
    updateProtectionStatusDisplay();
  });

// 1周保护按钮
document.getElementById("protect1Week")?.addEventListener("click", async () => {
  const urlPattern = getSelectedUrlPattern();
  if (!urlPattern) {
    showMessage("pleaseSelectPattern", null, true);
    return;
  }

  await protectTabWithPattern(urlPattern, 7 * 24 * 60 * 60 * 1000);
  showMessage("tabProtectedFor", [7 * 24]);
  updateProtectionStatusDisplay();
});

// 永久保护按钮
document.getElementById("protectPermanent")?.addEventListener("click", () => {
  const urlPattern = getSelectedUrlPattern();
  if (!urlPattern) {
    showMessage("pleaseSelectPattern", null, true);
    return;
  }

  browserAPI.storage.local.get(["whitelist"], (result) => {
    const whitelist = result.whitelist || [];
    if (!whitelist.includes(urlPattern)) {
      whitelist.push(urlPattern);
      browserAPI.storage.local.set({ whitelist: whitelist }, () => {
        setWhitelistCache(whitelist);
        updateWhitelistIndicators(whitelist);
        showMessage("addedToProtectionList", [urlPattern]);
      });
    } else {
      showMessage("alreadyProtected", [urlPattern], true);
    }
  });
});

// 移除保护按钮（从白名单移除）
document.getElementById("removeProtection")?.addEventListener("click", () => {
  const urlPattern = getSelectedUrlPattern();
  if (!urlPattern) {
    showMessage("pleaseSelectPattern", null, true);
    return;
  }

  browserAPI.storage.local.get(["whitelist"], (result) => {
    const whitelist = result.whitelist || [];
    const index = whitelist.indexOf(urlPattern);
    if (index !== -1) {
      whitelist.splice(index, 1);
      browserAPI.storage.local.set({ whitelist: whitelist }, () => {
        setWhitelistCache(whitelist);
        updateWhitelistIndicators(whitelist);
        showMessage("removedFromProtectionList", [urlPattern]);
      });
    } else {
      showMessage("notInProtectionList", [urlPattern], true);
    }
  });
});

/**
 * 使用 URL 规则保护标签页
 * @param {string} urlPattern - URL 匹配规则
 * @param {number} durationMs - 保护时长(毫秒)
 */
async function protectTabWithPattern(urlPattern, durationMs) {
  const tabs = await browserAPI.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tabs.length === 0) return;

  const tabId = tabs[0].id;
  const expiresAt = Date.now() + durationMs;

  return new Promise((resolve) => {
    browserAPI.storage.local.get(["tempProtectedUrls"], (result) => {
      const tempProtected = result.tempProtectedUrls || {};

      tempProtected[tabId] = {
        url: urlPattern,
        expiresAt: expiresAt,
      };

      browserAPI.storage.local.set({ tempProtectedUrls: tempProtected }, () => {
        console.log(
          "✅ 设置临时保护:",
          tabId,
          urlPattern,
          "过期时间:",
          new Date(expiresAt).toLocaleString()
        );
        // 同时更新 idleTime
        browserAPI.runtime.sendMessage(
          { type: "resetIdleTime", tabId: tabId, time: expiresAt },
          resolve
        );
      });
    });
  });
}
