// discard button
document.getElementById("discardCurrent").addEventListener("click", () => {
  discardTabs("current");
});

document.getElementById("discardHalfHour").addEventListener("click", () => {
  discardTabs("halfHour");
});

document.getElementById("discardOthers").addEventListener("click", () => {
  discardTabs("others");
});

document.getElementById("discardGroup").addEventListener("click", () => {
  discardTabs("group");
});

function discardTabs(option) {
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    const now = Date.now();
    const activeTabId = tabs.find((tab) => tab.active)?.id;

    tabs.forEach((tab) => {
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
        chrome.tabs.discard(tab.id);
      }
    });
  });
}

//=============ignore tabs============

document.getElementById("ignoreTab24Hour").addEventListener("click", () => {
  ignoreTab(24 * 60);
});

document.getElementById("ignoreTab1Week").addEventListener("click", () => {
  ignoreTab(7 * 24 * 60);
});

// 当弹出窗口加载时，设置输入框的默认值
document.addEventListener("DOMContentLoaded", () => {
  getCurrentTabUrlWithoutParams((url) => {
    document.getElementById("whitelistUrl").value = url; // 设置输入框默认值
  });
});
// 获取当前标签页的 URL，并去掉参数
function getCurrentTabUrlWithoutParams(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const url = tabs[0].url;
      const urlWithoutParams = url.split("?")[0]; // 去掉参数
      callback(urlWithoutParams);
    }
  });
}

document.getElementById("ignoreTab").addEventListener("click", () => {
  const url = document.getElementById("whitelistUrl").value.trim();
  if (url) {
    chrome.storage.local.get(["whitelist"], (result) => {
      const whitelist = result.whitelist || [];
      if (!whitelist.includes(url)) {
        whitelist.push(url);
        chrome.storage.local.set({ whitelist: whitelist }, () => {
          console.log(`Added ${url} to whitelist.`);
        });
      }
    });
  }
});

document.getElementById("resetIgnoreTab").addEventListener("click", () => {
  const url = document.getElementById("ignoreTab").value.trim();
  if (url) {
    chrome.storage.local.get(["whitelist"], (result) => {
      const whitelist = result.whitelist || [];
      if (whitelist.includes(url)) {
        whitelist.splice(whitelist.indexOf(url), 1);
        chrome.storage.local.set({ whitelist: whitelist }, () => {
          console.log(`remove ${url} from whitelist.`);
        });
      }
    });
  }
});

function ignoreTab(time) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      const now = Date.now();
      const expirationTime = now + time * 1000;

      // 存储该标签页的忽略状态
      chrome.extension.getBackgroundPage().resetIdleTime(tabId, expirationTime);
      alert("this tab will not be discard for " + time / 60 + " hours.");
    }
  });
}

//设置最大闲置时间
document.getElementById("save").addEventListener("click", () => {
  const idleLimit = document.getElementById("idleLimit").value;
  const idleLimitInMs = idleLimit * 1000; // 转换为毫秒

  // 存储用户设置
  chrome.storage.local.set({ idleLimit: idleLimitInMs }, () => {
    console.log("Idle limit set to " + idleLimitInMs + " milliseconds.");
  });
});

// 在弹出窗口打开时加载当前设置
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["idleLimit"], (result) => {
    if (result.idleLimit) {
      document.getElementById("idleLimit").value = result.idleLimit / 1000; // 转换为秒
    } else {
      //默认的时间
      document.getElementById("idleLimit").value = 10;
    }
  });
});
