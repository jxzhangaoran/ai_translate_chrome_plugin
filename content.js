// 全局变量 - 使用window对象存储，避免重复声明
if (typeof window.aiTranslate === 'undefined') {
  window.aiTranslate = {
    isTranslating: false,
    translationAborted: false,
    currentTargetLang: '',
    debugMode: false,
    originalTexts: new Map() // 存储原始文本，用于恢复
  };
}

// 使用简写变量，方便访问
const aiTranslate = window.aiTranslate;

// 初始化标志，确保我们知道content script已加载
console.log('[AI翻译] Content script 已加载');

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[AI翻译] 收到消息:', message);
  
  if (message.action === 'translate') {
    // 开始翻译
    aiTranslate.currentTargetLang = message.targetLang;
    console.log('[AI翻译] 开始翻译，目标语言:', aiTranslate.currentTargetLang);
    
    // 立即发送响应，表示已收到请求
    sendResponse({ status: 'started' });
    
    // 异步开始翻译过程
    setTimeout(() => {
      startTranslation(aiTranslate.currentTargetLang).catch(error => {
        console.error('[AI翻译] 翻译过程中出错:', error);
        sendProgressMessage('translationError', null, error.message);
      });
    }, 0);
  } else if (message.action === 'stopTranslation') {
    // 停止翻译
    console.log('[AI翻译] 收到停止翻译请求');
    stopTranslation();
    sendResponse({ status: 'stopped' });
  } else {
    console.log('[AI翻译] 收到未知消息类型:', message.action);
    sendResponse({ status: 'unknown_action' });
  }
  
  return true; // 保持消息通道开放
});

// 发送测试消息到background，确认通信正常
chrome.runtime.sendMessage({ action: 'contentScriptLoaded' }, response => {
  if (chrome.runtime.lastError) {
    console.error('[AI翻译] 无法连接到background script:', chrome.runtime.lastError);
  } else {
    console.log('[AI翻译] 与background script通信正常:', response);
  }
});

// 获取网页内容
function getPageContent() {
  // 获取页面的可见文本内容
  const bodyText = document.body.innerText;
  
  // 获取页面标题
  const title = document.title;
  
  // 获取页面的meta描述
  let metaDescription = '';
  const metaDescriptionTag = document.querySelector('meta[name="description"]');
  if (metaDescriptionTag) {
    metaDescription = metaDescriptionTag.getAttribute('content') || '';
  }
  
  // 获取页面的h1标题
  let h1Titles = [];
  document.querySelectorAll('h1').forEach(h1 => {
    if (h1.innerText.trim()) {
      h1Titles.push(h1.innerText.trim());
    }
  });
  
  // 组合页面内容
  let pageContent = '';
  
  if (title) {
    pageContent += `标题: ${title}\n\n`;
  }
  
  if (metaDescription) {
    pageContent += `描述: ${metaDescription}\n\n`;
  }
  
  if (h1Titles.length > 0) {
    pageContent += `主标题: ${h1Titles.join(', ')}\n\n`;
  }
  
  // 添加页面正文内容，但限制长度
  const maxBodyLength = 5000; // 限制正文长度，避免API请求过大
  pageContent += `正文内容:\n${bodyText.substring(0, maxBodyLength)}`;
  if (bodyText.length > maxBodyLength) {
    pageContent += '...(内容已截断)';
  }
  
  return pageContent;
}

// 开始翻译
async function startTranslation(targetLang) {
  // 如果已经在翻译中，先停止
  if (aiTranslate.isTranslating) {
    stopTranslation();
    // 等待一小段时间确保之前的翻译已停止
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 重置状态
  aiTranslate.isTranslating = true;
  aiTranslate.translationAborted = false;
  
  // 获取API配置，检查调试模式
  const config = await getApiConfig();
  aiTranslate.debugMode = config.debugMode;
  
  // 记录开始时间（用于调试）
  const startTime = new Date();
  if (aiTranslate.debugMode) {
    console.log(`[AI翻译] 开始翻译，目标语言: ${targetLang}，时间: ${startTime}`);
  }
  
  try {
    // 获取需要翻译的文本节点
    const textNodes = getTranslatableTextNodes();
    
    if (aiTranslate.debugMode) {
      console.log(`[AI翻译] 找到 ${textNodes.length} 个可翻译文本节点`);
    }
    
    // 如果没有可翻译文本节点，提前结束
    if (textNodes.length === 0) {
      sendProgressMessage('translationComplete');
      aiTranslate.isTranslating = false;
      return;
    }
    
    // 如果启用了网页内容总结功能，先获取网页内容总结
    let pageSummary = null;
    if (config.enablePageSummary) {
      try {
        sendProgressMessage('summarizingPage');
        const pageContent = getPageContent();
        
        if (aiTranslate.debugMode) {
          console.log(`[AI翻译] 获取到网页内容，长度: ${pageContent.length}`);
        }
        
        // 发送网页内容到后台进行总结
        const summaryResponse = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'summarizePageContent',
            content: pageContent
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            
            if (response && response.success) {
              resolve(response.summary);
            } else {
              reject(new Error(response?.error || '网页内容总结失败'));
            }
          });
        });
        
        pageSummary = summaryResponse;
        
        if (aiTranslate.debugMode) {
          console.log(`[AI翻译] 网页内容总结成功: ${pageSummary}`);
        }
      } catch (error) {
        console.error('[AI翻译] 网页内容总结失败:', error);
        // 总结失败不影响翻译过程，继续进行翻译
      }
    }
    
    // 批量处理文本节点，每批次处理一定数量的节点
    const batchSize = 5;
    const totalNodes = textNodes.length;
    let processedNodes = 0;
    
    for (let i = 0; i < totalNodes; i += batchSize) {
      // 检查是否已中止翻译
      if (aiTranslate.translationAborted) {
        if (aiTranslate.debugMode) {
          console.log('[AI翻译] 翻译已中止');
        }
        break;
      }
      
      // 获取当前批次的文本节点
      const batch = textNodes.slice(i, Math.min(i + batchSize, totalNodes));
      
      // 并行处理当前批次的文本节点
      await Promise.all(batch.map(node => translateTextNode(node, targetLang, pageSummary)));
      
      // 更新进度
      processedNodes += batch.length;
      const progress = Math.round((processedNodes / totalNodes) * 100);
      sendProgressMessage('translationProgress', progress);
      
      // 如果不是最后一批，等待一小段时间再处理下一批，避免API限制
      if (i + batchSize < totalNodes && !aiTranslate.translationAborted) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // 完成翻译
    if (!aiTranslate.translationAborted) {
      sendProgressMessage('translationComplete');
      
      if (aiTranslate.debugMode) {
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000;
        console.log(`[AI翻译] 翻译完成，耗时: ${duration}秒`);
      }
    }
  } catch (error) {
    console.error('[AI翻译] 翻译过程中出错:', error);
    sendProgressMessage('translationError', error.message);
  } finally {
    aiTranslate.isTranslating = false;
  }
}

// 停止翻译
function stopTranslation() {
  aiTranslate.translationAborted = true;
  aiTranslate.isTranslating = false;
  
  if (aiTranslate.debugMode) {
    console.log('[AI翻译] 手动停止翻译');
  }
}

// 获取可翻译的文本节点
function getTranslatableTextNodes() {
  // 获取所有可见的文本节点
  const textNodes = [];
  const body = document.body;
  
  // 需要排除的元素
  const excludeSelectors = [
    'script', 'style', 'noscript', 'iframe', 'svg', 'path', 'meta',
    'link', 'head', 'title', 'input', 'textarea', 'code', 'pre'
  ];
  
  // 递归遍历DOM树
  function traverse(node) {
    // 跳过不可见元素
    if (node.nodeType === Node.ELEMENT_NODE) {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return;
      }
      
      // 跳过排除的元素
      if (excludeSelectors.includes(node.tagName.toLowerCase())) {
        return;
      }
    }
    
    // 处理文本节点
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      // 只处理非空且包含有意义文本的节点
      if (text && text.length > 1 && !/^\s*$/.test(text) && !/^\d+$/.test(text)) {
        textNodes.push(node);
      }
      return;
    }
    
    // 递归处理子节点
    for (const child of node.childNodes) {
      traverse(child);
    }
  }
  
  traverse(body);
  return textNodes;
}

// 翻译单个文本节点
function translateTextNode(textNode, targetLang, pageSummary = null) {
  return new Promise((resolve, reject) => {
    try {
      // 获取节点的文本内容
      const originalText = textNode.textContent.trim();
      
      // 如果文本为空或太短，跳过
      if (!originalText || originalText.length < 2) {
        resolve();
        return;
      }
      
      // 存储原始文本
      if (!aiTranslate.originalTexts.has(textNode)) {
        aiTranslate.originalTexts.set(textNode, originalText);
      }
      
      // 调用background.js中的翻译函数
      chrome.runtime.sendMessage({
        action: 'translateText',
        text: originalText,
        targetLang: targetLang,
        pageSummary: pageSummary
      }, (response) => {
        // 检查是否有错误
        if (chrome.runtime.lastError) {
          console.error('[AI翻译] 发送消息错误:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        // 检查是否已中止翻译
        if (aiTranslate.translationAborted) {
          resolve();
          return;
        }
        
        // 检查翻译是否成功
        if (response && response.success) {
          // 替换文本节点内容，保留原始HTML结构
          textNode.textContent = response.translatedText;
          
          // 添加已翻译标记到父元素
          const parentElement = textNode.parentElement;
          if (parentElement) {
            parentElement.dataset.aiTranslated = 'true';
            parentElement.dataset.originalLang = document.documentElement.lang || 'auto';
            parentElement.dataset.targetLang = targetLang;
          }
          
          if (aiTranslate.debugMode) {
            console.log(`[AI翻译] 翻译成功: ${originalText.substring(0, 30)}... => ${response.translatedText.substring(0, 30)}...`);
          }
        } else {
          console.error('[AI翻译] 翻译失败:', response?.error || '未知错误:', response);
        }
        
        resolve();
      });
    } catch (error) {
      console.error('[AI翻译] 翻译文本节点时出错:', error);
      reject(error);
    }
  });
}

// 恢复原始文本
function restoreOriginalText() {
  aiTranslate.originalTexts.forEach((originalText, node) => {
    // 检查节点是否仍然存在于DOM中
    if (node && node.parentElement) {
      // 如果是文本节点
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = originalText;
        
        // 移除父元素上的翻译标记
        const parentElement = node.parentElement;
        if (parentElement && parentElement.dataset.aiTranslated === 'true') {
          delete parentElement.dataset.aiTranslated;
          delete parentElement.dataset.originalLang;
          delete parentElement.dataset.targetLang;
        }
      } 
      // 如果是元素节点（兼容旧版本）
      else if (node.nodeType === Node.ELEMENT_NODE && node.dataset.aiTranslated === 'true') {
        node.innerText = originalText;
        delete node.dataset.aiTranslated;
        delete node.dataset.originalLang;
        delete node.dataset.targetLang;
      }
    }
  });
  
  // 清空存储
  aiTranslate.originalTexts.clear();
  
  if (aiTranslate.debugMode) {
    console.log('[AI翻译] 已恢复原始文本');
  }
}

// 发送进度消息到popup
function sendProgressMessage(action, progress = null, error = null) {
  const message = { action };
  
  if (progress !== null) {
    message.progress = progress;
  }
  
  if (error !== null) {
    message.error = error;
  }
  
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[AI翻译] 发送进度消息错误:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.error('[AI翻译] 发送进度消息异常:', error);
  }
}

// 获取API配置
function getApiConfig() {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ action: 'getApiConfig' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[AI翻译] 获取API配置错误:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (response && response.success) {
          resolve(response.config);
        } else {
          console.warn('[AI翻译] 获取API配置失败:', response);
          resolve({});
        }
      });
    } catch (error) {
      console.error('[AI翻译] 获取API配置异常:', error);
      reject(error);
    }
  });
}
