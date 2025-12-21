// 浏览器兼容性处理：Firefox 使用 browser，Chrome 使用 chrome
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

let idleTime = {};
let lastActiveTabId = null; // 记录上一个激活的标签页ID
const IDLE_LIMIT = 1 * 60 * 1000; // default idle time: 1 minutes

// 监听标签页更新事件
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   console.log("更新了一个标签页");
//   if (changeInfo.status === "complete") {
//     resetIdleTime(tabId);
//   }
// });

//监听标签页的关闭事件
browserAPI.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log("关闭了一个标签页", tabId);
  delete idleTime[tabId];

  // 如果关闭的是最后激活的标签页，清除记录
  if (lastActiveTabId === tabId) {
    lastActiveTabId = null;
  }
});

// 监听标签页激活事件
browserAPI.tabs.onActivated.addListener((activeInfo) => {
  console.log("激活了一个标签页", activeInfo.tabId);

  // 如果有上一个激活的标签页，重置其闲置时间为当前时间
  // 这样可以正确记录该标签页最后一次被使用的时间
  if (lastActiveTabId !== null && lastActiveTabId !== activeInfo.tabId) {
    resetIdleTime(lastActiveTabId);
    console.log("重置上一个激活标签页的闲置时间", lastActiveTabId);
  }

  // 重置当前激活标签页的闲置时间
  resetIdleTime(activeInfo.tabId);

  // 更新最后激活的标签页ID
  lastActiveTabId = activeInfo.tabId;
});

// 监听新标签页的创建事件
browserAPI.tabs.onCreated.addListener((tab) => {
  resetIdleTime(tab.id);
});

// 监听来自 popup 的消息
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "resetIdleTime") {
    resetIdleTime(message.tabId, message.time);
    sendResponse();
  }
});

// 重置闲置时间
function resetIdleTime(tabId, time) {
  if (time) {
    idleTime[tabId] = time;
  } else {
    idleTime[tabId] = Date.now();
  }
}

// 检查闲置时间
setInterval(async () => {
  console.log("# start check idle time=================================");
  console.log("# 当前监控的标签页数量为", Object.keys(idleTime).length);

  //如果加载插件前,其他标签页已经打开,则初始化idleTime
  if (isEmptyObject(idleTime)) {
    console.log("init idleTime");
    const tabs = await queryTabs({});
    console.log("tab count", tabs.length);
    for (const tab of tabs) {
      idleTime[tab.id] = Date.now();
    }
    return;
  }

  //准备数据
  let idleLimit = (await getFromLocalStorage("idleLimit")) || IDLE_LIMIT;
  const whitelist = (await getFromLocalStorage("whitelist")) || [];
  const activeTabs = await queryTabs({ active: true });
  console.log("==get all avtive tab");
  const activeTabIds = activeTabs.map((tab) => {
    console.log("active tab ", tab.url);
    return tab.id;
  });

  console.log("==whitelist", whitelist);
  const now = Date.now();

  let index = 0;
  for (const tabId in idleTime) {
    try {
      index += 1;
      const tab = await browserAPI.tabs.get(parseInt(tabId));
      if (!tab) {
        console.log("tab not found, skip");
        continue;
      }

      const tabUrl = tab?.url;
      console.log("===check ", index, tabId, tabUrl, tab.title);

      if (tab.discarded) {
        console.log("discarded, skip");
        continue;
      }
      // 如果当前标签是激活的，跳过
      if (activeTabIds.includes(parseInt(tabId))) {
        console.log("active tab, skip");
        continue;
      }

      // 如果当前标签在白名单中，跳过
      if (isWhitelisted(tabUrl, whitelist)) {
        console.log("whitelisted, skip");
        continue;
      }

      //discard
      if (now - idleTime[tabId] > idleLimit) {
        console.log("准备discard");
        try {
          await browserAPI.tabs.discard(parseInt(tabId));
          console.log("✅ 自动丢弃标签页: " + tab.title);
          delete idleTime[tabId]; // 移除已丢弃的标签页的闲置记录
        } catch (error) {
          console.log('❌ 自动丢弃失败 "' + tab.title + '": ' + error.message);
          // 如果丢弃失败，不删除闲置记录，下次继续尝试
        }
      } else {
        console.log("存活时间为", now - idleTime[tabId], "低于", idleLimit);
      }
    } catch (e) {
      console.log(e);
    }
  }
}, 10000); // 每分钟检查一次

function isWhitelisted(url, whitelist) {
  return whitelist.some((pattern) => {
    const regex = new RegExp("^" + pattern + ".*$");
    return regex.test(url);
  });
}

function getFromLocalStorage(key) {
  return new Promise((resolve, reject) => {
    browserAPI.storage.local.get(key, (result) => {
      if (browserAPI.runtime.lastError) {
        reject(browserAPI.runtime.lastError);
      } else {
        resolve(result[key]);
      }
    });
  });
}

function queryTabs(options) {
  return new Promise((resolve, reject) => {
    browserAPI.tabs.query(options, (tabs) => {
      resolve(tabs);
    });
  });
}

function isEmptyObject(obj) {
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
}
