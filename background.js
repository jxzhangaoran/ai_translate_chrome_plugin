// 初始化标志
console.log('AI翻译 background script 已加载');

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request, '来自:', sender);
  
  if (request.action === 'contentScriptLoaded') {
    // 响应content script的测试消息
    console.log('Content script 已加载，通信正常');
    sendResponse({ status: 'background_received' });
    return true;
  }
  
  if (request.action === 'summarizePageContent') {
    console.log('收到网页内容总结请求，内容长度:', request.content.length);
    
    // 验证请求参数
    if (!request.content) {
      console.error('网页内容总结请求参数不完整');
      sendResponse({ 
        success: false, 
        error: '网页内容总结请求参数不完整' 
      });
      return true;
    }
    
    // 使用Promise.race添加超时处理
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('网页内容总结请求超时')), 60000); // 60秒超时
    });
    
    Promise.race([
      summarizePageContent(request.content),
      timeoutPromise
    ])
      .then(summary => {
        console.log('网页内容总结成功，返回结果:', summary);
        sendResponse({ success: true, summary });
      })
      .catch(error => {
        console.error('网页内容总结错误:', error);
        sendResponse({ 
          success: false, 
          error: error.message || '网页内容总结过程中发生未知错误' 
        });
      });
    
    return true; // 保持消息通道开放，以便异步响应
  }
  
  if (request.action === 'translateText') {
    console.log('收到翻译请求:', request.text.substring(0, 30) + '...', '目标语言:', request.targetLang);
    
    // 验证请求参数
    if (!request.text || !request.targetLang) {
      console.error('翻译请求参数不完整');
      sendResponse({ 
        success: false, 
        error: '翻译请求参数不完整' 
      });
      return true;
    }
    
    // 使用Promise.race添加超时处理
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('翻译请求超时')), 30000); // 30秒超时
    });
    
    Promise.race([
      translateText(request.text, request.targetLang, request.pageSummary),
      timeoutPromise
    ])
      .then(translatedText => {
        console.log('翻译成功，返回结果: ' + translatedText);
        sendResponse({ success: true, translatedText });
      })
      .catch(error => {
        console.error('翻译错误:', error);
        sendResponse({ 
          success: false, 
          error: error.message || '翻译过程中发生未知错误' 
        });
      });
    
    return true; // 保持消息通道开放，以便异步响应
  }
  
  if (request.action === 'getApiConfig') {
    console.log('收到获取API配置请求');
    
    try {
      chrome.storage.sync.get(['apiBaseUrl', 'apiModel', 'apiKey', 'maxTokens', 'temperature', 'preserveFormatting', 'enablePageSummary', 'debugMode', 'systemPrompt'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('获取API配置错误:', chrome.runtime.lastError);
          sendResponse({ 
            success: false, 
            error: chrome.runtime.lastError.message 
          });
          return;
        }
        
        // 不要在日志中显示API密钥
        const logResult = { ...result };
        if (logResult.apiKey) {
          logResult.apiKey = '******';
        }
        console.log('返回API配置:', logResult);
        
        sendResponse({ 
          success: true, 
          config: result 
        });
      });
    } catch (error) {
      console.error('获取API配置异常:', error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
    
    return true; // 保持消息通道开放，以便异步响应
  }
  
  // 处理未知消息类型
  console.log('收到未知消息类型:', request.action);
  sendResponse({ success: false, error: '未知消息类型' });
  return true;
});

// 使用LLM API总结网页内容
async function summarizePageContent(content) {
  // 获取API配置
  const config = await getApiConfig();
  
  // 验证配置
  if (!config.apiBaseUrl || !config.apiModel || !config.apiKey) {
    throw new Error('API配置不完整，请在选项页面中设置API信息');
  }
  
  // 构建API请求URL
  const apiUrl = `${config.apiBaseUrl}/chat/completions`;
  
  // 构建提示词
  const prompt = `请简要总结以下网页内容，不超过200字。总结应该包含网页的主题、类型和主要内容，以便于理解网页的整体上下文：\n\n${content}`;
  
  // 构建请求参数
  const requestBody = {
    model: config.apiModel,
    messages: [
      {
        role: "system",
        content: "你是一个专业的内容分析助手，能够准确地总结网页内容，提取关键信息。请提供简洁明了的总结，不要添加任何不在原文中的信息。"
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.3,
  };
  
  // 如果设置了最大token数，添加到请求中
  if (config.maxTokens) {
    requestBody.max_tokens = config.maxTokens;
  }
  
  // 调试模式下记录请求
  if (config.debugMode) {
    console.log('Summary request:', {
      url: apiUrl,
      body: {
        ...requestBody,
        messages: [
          requestBody.messages[0],
          {
            role: "user",
            content: prompt.substring(0, 100) + "..." // 只记录提示词的前100个字符
          }
        ]
      }
    });
  }
  
  try {
    // 发送API请求
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API错误: ${errorData.error?.message || response.statusText}`);
    }
    
    // 解析响应
    const data = await response.json();
    
    // 调试模式下记录响应
    if (config.debugMode) {
      console.log('Summary response:', data);
    }
    
    // 提取总结结果
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    } else {
      throw new Error('API响应格式不正确');
    }
  } catch (error) {
    console.error('Summary API error:', error);
    throw error;
  }
}

// 使用LLM API翻译文本
async function translateText(text, targetLang, pageSummary) {
  // 获取API配置
  const config = await getApiConfig();
  
  // 验证配置
  if (!config.apiBaseUrl || !config.apiModel || !config.apiKey) {
    throw new Error('API配置不完整，请在选项页面中设置API信息');
  }
  
  // 构建API请求URL
  const apiUrl = `${config.apiBaseUrl}/chat/completions`;
  
  // 构建提示词
  const prompt = createTranslationPrompt(text, targetLang, config.preserveFormatting, pageSummary);
  
  // 构建请求参数
  const requestBody = {
    model: config.apiModel,
    messages: [
      {
        role: "system",
        content: config.systemPrompt || "你是一个专业的翻译助手，能够准确地将文本翻译成目标语言，同时保持原文的格式和风格。如果原文不是可被翻译的类型（比如URL、无意义的字母和数字的组合、代码片段、emoji等），那么请直接返回原文。请只返回最终的翻译结果，不要包含任何解释、原文或网页内容总结。HTML标签名称应根据其功能翻译，例如'strong'应翻译为'加粗'，'em'应翻译为'强调'或'斜体'等。"
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: config.temperature || 0.3,
  };
  
  // 如果设置了最大token数，添加到请求中
  if (config.maxTokens) {
    requestBody.max_tokens = config.maxTokens;
  }
  
  // 调试模式下记录请求
  if (config.debugMode) {
    console.log('Translation request:', {
      url: apiUrl,
      body: requestBody
    });
  }
  
  try {
    // 发送API请求
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API错误: ${errorData.error?.message || response.statusText}`);
    }
    
    // 解析响应
    const data = await response.json();
    
    // 调试模式下记录响应
    if (config.debugMode) {
      console.log('Translation response:', data);
    }
    
    // 提取翻译结果
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    } else {
      throw new Error('API响应格式不正确');
    }
  } catch (error) {
    console.error('Translation API error:', error);
    throw error;
  }
}

// 创建翻译提示词
function createTranslationPrompt(text, targetLang, preserveFormatting, pageSummary) {
  let prompt = `请将以下文本翻译成${getLanguageName(targetLang)}:`;
  
  // 如果有网页内容总结，添加到提示词中
  if (pageSummary) {
    prompt += `\n\n以下是网页内容的总结，仅供参考以便更好地理解上下文，请不要在翻译结果中包含这段总结内容：\n${pageSummary}\n\n需要翻译的文本（请只返回这部分内容的翻译结果）：\n${text}\n\n`;
  } else {
    prompt += `\n\n${text}\n\n`;
  }
  
  if (preserveFormatting) {
    prompt += '请保持原文的格式，包括段落、换行、标点符号等。只翻译文本内容，不要添加或删除任何格式元素。';
  }
  
  prompt += '\n\n重要提示：请只返回翻译后的文本，不要包含任何解释、原文或网页内容总结。';
  
  return prompt;
}

// 获取语言名称
function getLanguageName(langCode) {
  const languages = {
    'zh-CN': '简体中文',
    'en': '英语',
    'ja': '日语',
    'ko': '韩语',
    'fr': '法语',
    'de': '德语',
    'es': '西班牙语',
    'ru': '俄语'
  };
  
  return languages[langCode] || langCode;
}

// 获取API配置
function getApiConfig() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.get([
        'apiBaseUrl',
        'apiModel',
        'apiKey',
        'maxTokens',
        'temperature',
        'preserveFormatting',
        'enablePageSummary',
        'debugMode',
        'systemPrompt'
      ], (result) => {
        if (chrome.runtime.lastError) {
          console.error('获取API配置错误:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result);
      });
    } catch (error) {
      console.error('获取API配置异常:', error);
      reject(error);
    }
  });
}
