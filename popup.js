// 浏览器兼容性处理：Firefox 使用 browser，Chrome 使用 chrome
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

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
    const message = browserAPI.i18n.getMessage(messageId);
    if (message) {
      element.textContent = message;
    }
  });

  // 占位符文本
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const messageId = element.getAttribute("data-i18n-placeholder");
    const message = browserAPI.i18n.getMessage(messageId);
    if (message) {
      element.placeholder = message;
    }
  });

  // 标题提示
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const messageId = element.getAttribute("data-i18n-title");
    const message = browserAPI.i18n.getMessage(messageId);
    if (message) {
      element.title = message;
    }
  });
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  initializeI18n();
  getCurrentTabUrlWithoutParams((url) => {
    document.getElementById("whitelistUrl").value = url;
  });
  loadIdleLimit();
  loadTabStatus();
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
document.getElementById("discardCurrent").addEventListener("click", () => {
  discardTabs("current");
  showMessage("tabDiscarded");
  updateTabStatusAfterDiscard();
});

document.getElementById("discardHalfHour").addEventListener("click", () => {
  discardTabs("halfHour");
  showMessage("idleTabsDiscarded");
  updateTabStatusAfterDiscard();
});

document.getElementById("discardOthers").addEventListener("click", () => {
  discardTabs("others");
  showMessage("otherTabsDiscarded");
  updateTabStatusAfterDiscard();
});

document.getElementById("discardGroup").addEventListener("click", () => {
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

//=============ignore tabs============

document.getElementById("ignoreTab24Hour").addEventListener("click", () => {
  ignoreTab(24 * 60);
});

document.getElementById("ignoreTab1Week").addEventListener("click", () => {
  ignoreTab(7 * 24 * 60);
});

document.getElementById("resetProtect").addEventListener("click", () => {
  ignoreTab(0);
});

// 获取当前标签页的 URL，并转换为通配符格式
function getCurrentTabUrlWithoutParams(callback) {
  browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const url = new URL(tabs[0].url);
      // 构建通配符格式：domain/*
      const wildcardUrl = url.hostname + "/*";
      callback(wildcardUrl);
    }
  });
}

document.getElementById("ignoreTab").addEventListener("click", () => {
  const url = document.getElementById("whitelistUrl").value.trim();
  if (url) {
    browserAPI.storage.local.get(["whitelist"], (result) => {
      const whitelist = result.whitelist || [];
      if (!whitelist.includes(url)) {
        whitelist.push(url);
        browserAPI.storage.local.set({ whitelist: whitelist }, () => {
          showMessage("addedToProtectionList", [url]);
        });
      } else {
        showMessage("alreadyProtected", [url], true);
      }
    });
  }
});

document.getElementById("resetIgnoreTab").addEventListener("click", () => {
  const url = document.getElementById("whitelistUrl").value.trim();
  if (url) {
    browserAPI.storage.local.get(["whitelist"], (result) => {
      const whitelist = result.whitelist || [];
      if (whitelist.includes(url)) {
        whitelist.splice(whitelist.indexOf(url), 1);
        browserAPI.storage.local.set({ whitelist: whitelist }, () => {
          showMessage("removedFromProtectionList", [url]);
        });
      } else {
        showMessage("notInProtectionList", [url], true);
      }
    });
  }
});

function ignoreTab(minutes) {
  browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      const now = Date.now();
      const expirationTime = now + minutes * 60 * 1000;

      browserAPI.runtime.sendMessage(
        { type: "resetIdleTime", tabId: tabId, time: expirationTime },
        () => {
          if (minutes > 0) {
            showMessage("tabProtectedFor", [minutes / 60]);
          }
        }
      );
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
}, 5000);
