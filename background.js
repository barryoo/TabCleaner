let idleTime = {};
const IDLE_LIMIT = 1 * 60 * 1000; // default idle time: 1 minutes
let activeTabId = 0;

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    resetIdleTime(tabId);
  }
});

// 监听标签页激活事件
chrome.tabs.onActivated.addListener((activeInfo) => {
  resetIdleTime(activeInfo.tabId);
  activeTabId = activeInfo.tabId;
});

// 监听新标签页的创建事件
chrome.tabs.onCreated.addListener((tab) => {
  resetIdleTime(tab.id);
});

// 重置闲置时间
function resetIdleTime(tabId, time) {
  if (!time) {
    idleTime[tabId] = time;
  }
  idleTime[tabId] = Date.now();
}

// 检查闲置时间
setInterval(async () => {
  let idleLimieStorage = (await getFromLocalStorage("idleLimit")) || IDLE_LIMIT;
  const whitelist = (await getFromLocalStorage("whitelist")) || [];
  console.log("whitelist", whitelist);
  const now = Date.now();
  for (const tabId in idleTime) {
    try {
      console.log("check ", tabId, idleTime[tabId]);
      // 如果当前标签是激活的，跳过丢弃
      if (parseInt(tabId) === activeTabId) {
        console.log("active tab, skip", activeTabId);
        continue;
      }

      // 如果当前标签在白名单中，跳过丢弃
      const tabUrl = (await chrome.tabs.get(parseInt(tabId)))?.url;
      if (isWhitelisted(tabUrl, whitelist)) {
        console.log("whitelisted, skip", tabUrl);
        continue;
      }

      //discard
      if (now - idleTime[tabId] > idleLimieStorage) {
        chrome.tabs.discard(parseInt(tabId));
        console.log("discard tab", tabId);

        delete idleTime[tabId]; // 移除已丢弃的标签页的闲置记录
      }
    } catch (e) {
      console.log(e);
    }
  }
}, 60000); // 每分钟检查一次

function isWhitelisted(url, whitelist) {
  return whitelist.some((pattern) => {
    const regex = new RegExp("^" + pattern + ".*$");
    return regex.test(url);
  });
}

function getFromLocalStorage(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result[key]);
      }
    });
  });
}
