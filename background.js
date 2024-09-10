let idleTime = {};
const IDLE_LIMIT = 1 * 60 * 1000; // 15 minutes in milliseconds
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
function resetIdleTime(tabId) {
  idleTime[tabId] = Date.now();
}

// 检查闲置时间
setInterval(() => {
  const now = Date.now();
  for (const tabId in idleTime) {
    // 如果当前标签是激活的，跳过丢弃
    if (parseInt(tabId) === activeTabId) {
      console.log("active tab, skip", activeTabId);
      continue;
    }
    //discard
    if (now - idleTime[tabId] > IDLE_LIMIT) {
      chrome.tabs.discard(parseInt(tabId));
      delete idleTime[tabId]; // 移除已丢弃的标签页的闲置记录
    }
  }
}, 60000); // 每分钟检查一次
