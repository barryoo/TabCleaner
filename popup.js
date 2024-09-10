document.getElementById("ignore-tab").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      const now = Date.now();
      const expirationTime = now + 24 * 60 * 60 * 1000; // 1 day in milliseconds

      // 存储该标签页的忽略状态
      chrome.storage.local.set({ [tabId]: expirationTime }, () => {
        alert("this tab will not be discard for 24 hours.");
      });
    }
  });
});
document.getElementById("save").addEventListener("click", () => {
  const idleLimit = document.getElementById("idleLimit").value;
  const idleLimitInMs = idleLimit * 60 * 1000; // 转换为毫秒

  // 存储用户设置
  chrome.storage.local.set({ idleLimit: idleLimitInMs }, () => {
    console.log("Idle limit set to " + idleLimitInMs + " milliseconds.");
  });
});

// 在弹出窗口打开时加载当前设置
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["idleLimit"], (result) => {
    if (result.idleLimit) {
      document.getElementById("idleLimit").value =
        result.idleLimit / (60 * 1000); // 转换为分钟
    } else {
      //默认的时间
      document.getElementById("idleLimit").value = 15;
    }
  });
});

// discard button

// 为每个按钮添加事件监听器
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
