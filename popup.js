document.addEventListener('DOMContentLoaded', () => {
  // 获取DOM元素
  const translateButton = document.getElementById('translatePage');
  const toggleLanguageButton = document.getElementById('toggleLanguage');
  const stopButton = document.getElementById('stopTranslation');
  const targetLangSelect = document.getElementById('targetLang');
  const statusMessage = document.getElementById('statusMessage');
  const progressIndicator = document.getElementById('progressIndicator');
  const openOptionsButton = document.getElementById('openOptions');
  const apiStatusElement = document.getElementById('apiStatus');

  // 初始化
  initializePopup();
  
  // 检查当前页面的翻译状态
  checkTranslationStatus();

  // 翻译按钮点击事件
  translateButton.addEventListener('click', async () => {
    const targetLang = targetLangSelect.value;
    
    // 保存目标语言设置
    chrome.storage.sync.set({ targetLanguage: targetLang });
    
    // 更新状态
    updateStatus('正在翻译...', 10);
    
    try {
      // 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        updateStatus('错误: 无法获取当前标签页', 0);
        return;
      }
      
      console.log('当前标签页:', tab.id, tab.url);
      
      // 检查是否可以在此页面上运行脚本
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('https://chrome.google.com/webstore')) {
        updateStatus('错误: 无法在此页面上运行翻译功能', 0);
        return;
      }
      
      // 发送消息到content script开始翻译
      chrome.tabs.sendMessage(tab.id, { 
        action: 'translate', 
        targetLang: targetLang 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('发送消息错误:', chrome.runtime.lastError);
          updateStatus('错误: ' + chrome.runtime.lastError.message, 0);
          return;
        }
        
        if (response && response.status === 'started') {
          updateStatus('翻译进行中...', 50);
        } else {
          console.log('收到未预期的响应:', response);
        }
      });
    } catch (error) {
      console.error('翻译过程中出错:', error);
      updateStatus('错误: ' + error.message, 0);
    }
  });

  // 停止翻译按钮点击事件
  stopButton.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tab.id, { action: 'stopTranslation' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        return;
      }
      
      if (response && response.status === 'stopped') {
        updateStatus('翻译已停止', 0);
      }
    });
  });

  // 打开选项页面按钮点击事件
  openOptionsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // 切换语言按钮点击事件
  toggleLanguageButton.addEventListener('click', async () => {
    try {
      // 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        updateStatus('错误: 无法获取当前标签页', 0);
        return;
      }
      
      // 发送消息到content script切换语言
      chrome.tabs.sendMessage(tab.id, { action: 'toggleLanguage' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('发送消息错误:', chrome.runtime.lastError);
          updateStatus('错误: ' + chrome.runtime.lastError.message, 0);
          return;
        }
        
        if (response && response.status === 'toggled') {
          // 更新按钮文本
          updateToggleButtonText(response.isTranslated);
          
          // 更新状态
          if (response.isTranslated) {
            updateStatus('已切换到翻译版本', 100);
          } else {
            updateStatus('已切换到原始版本', 0);
          }
        }
      });
    } catch (error) {
      console.error('切换语言过程中出错:', error);
      updateStatus('错误: ' + error.message, 0);
    }
  });

  // 监听来自content script的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 只处理翻译相关的消息，避免干扰其他消息处理
    if (!message.action || !(message.action.startsWith('translation') || message.action === 'summarizingPage')) {
      return false; // 不处理非翻译相关的消息
    }
    
    if (message.action === 'summarizingPage') {
      updateStatus('正在分析网页内容...', 20);
    } else if (message.action === 'translationProgress') {
      updateStatus(`翻译进度: ${message.progress}%`, message.progress);
    } else if (message.action === 'translationComplete') {
      updateStatus('翻译完成', 100);
      // 显示切换按钮
      toggleLanguageButton.style.display = 'block';
      // 更新切换按钮文本
      updateToggleButtonText(true);
      
      setTimeout(() => {
        updateStatus('', 0);
      }, 30000);
    } else if (message.action === 'translationError') {
      updateStatus(`错误: ${message.error}`, 0);
    }
    
    sendResponse({ received: true });
    return true;
  });

  // 初始化弹出窗口
  function initializePopup() {
    // 加载保存的目标语言
    chrome.storage.sync.get(['targetLanguage'], (result) => {
      if (result.targetLanguage) {
        targetLangSelect.value = result.targetLanguage;
      }
    });
    
    // 检查API配置状态
    checkApiConfiguration();
  }
  
  // 检查当前页面的翻译状态
  async function checkTranslationStatus() {
    try {
      // 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        return;
      }
      
      // 检查是否可以在此页面上运行脚本
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('https://chrome.google.com/webstore')) {
        return;
      }
      
      // 发送消息到content script检查翻译状态
      chrome.tabs.sendMessage(tab.id, { action: 'checkTranslationStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('检查翻译状态错误:', chrome.runtime.lastError);
          return;
        }
        
        if (response && response.isTranslated !== undefined) {
          // 如果页面已被翻译，显示切换按钮
          if (response.isTranslated) {
            toggleLanguageButton.style.display = 'block';
            updateToggleButtonText(true);
          } else if (response.currentTargetLang) {
            // 如果页面未被翻译但有目标语言，也显示切换按钮
            toggleLanguageButton.style.display = 'block';
            updateToggleButtonText(false);
          }
        }
      });
    } catch (error) {
      console.error('检查翻译状态过程中出错:', error);
    }
  }
  
  // 更新切换按钮文本
  function updateToggleButtonText(isTranslated) {
    if (isTranslated) {
      toggleLanguageButton.textContent = '查看原文';
      toggleLanguageButton.title = '点击查看原始语言';
    } else {
      toggleLanguageButton.textContent = '查看翻译';
      toggleLanguageButton.title = '点击查看翻译';
    }
  }

  // 检查API配置
  function checkApiConfiguration() {
    chrome.storage.sync.get(['apiBaseUrl', 'apiModel', 'apiKey'], (result) => {
      if (result.apiBaseUrl && result.apiModel && result.apiKey) {
        apiStatusElement.textContent = 'API已配置';
        apiStatusElement.className = 'connected';
        translateButton.disabled = false;
      } else {
        apiStatusElement.textContent = 'API未配置';
        apiStatusElement.className = 'error';
        translateButton.disabled = true;
        
        // 显示提示消息
        updateStatus('请先在设置中配置API', 0);
      }
    });
  }

  // 更新状态显示
  function updateStatus(message, progress) {
    statusMessage.textContent = message;
    progressIndicator.style.width = `${progress}%`;
    
    if (progress > 0) {
      progressIndicator.style.display = 'block';
    } else {
      progressIndicator.style.display = 'none';
    }
  }
});
