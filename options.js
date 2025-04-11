// 默认系统提示词
const DEFAULT_SYSTEM_PROMPT = `你是一个专业的翻译助手，能够准确地将文本翻译成目标语言，同时保持原文的格式和风格。请注意以下特殊情况：

1. HTML标签名称应根据其功能翻译，例如'strong'应翻译为'加粗'，'em'应翻译为'强调'或'斜体'等。

2. 如果原文不是可被翻译的类型（比如URL、无意义的字母和数字的组合、代码片段、emoji等），那么请直接返回原文。

请只返回最终的结果，不必附带额外的解释信息。`;

document.addEventListener('DOMContentLoaded', () => {
  // 获取DOM元素
  const apiConfigForm = document.getElementById('apiConfigForm');
  const apiBaseUrlInput = document.getElementById('apiBaseUrl');
  const apiModelInput = document.getElementById('apiModel');
  const apiKeyInput = document.getElementById('apiKey');
  const maxTokensInput = document.getElementById('maxTokens');
  const temperatureInput = document.getElementById('temperature');
  const preserveFormattingCheckbox = document.getElementById('preserveFormatting');
  const debugModeCheckbox = document.getElementById('debugMode');
  const systemPromptTextarea = document.getElementById('systemPrompt');
  const resetPromptButton = document.getElementById('resetPromptButton');
  const saveButton = document.getElementById('saveButton');
  const testButton = document.getElementById('testButton');
  const resetButton = document.getElementById('resetButton');
  const statusMessage = document.getElementById('statusMessage');

  // 加载保存的设置
  loadSavedSettings();

  // 保存设置
  apiConfigForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings();
  });

  // 测试API连接
  testButton.addEventListener('click', () => {
    testApiConnection();
  });

  // 重置设置
  resetButton.addEventListener('click', () => {
    if (confirm('确定要重置所有设置吗？这将删除所有已保存的API配置。')) {
      resetSettings();
    }
  });
  
  // 重置系统提示词为默认值
  resetPromptButton.addEventListener('click', () => {
    systemPromptTextarea.value = DEFAULT_SYSTEM_PROMPT;
    showStatus('已恢复默认系统提示词', 'info');
  });

  // 加载保存的设置
  function loadSavedSettings() {
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
      if (result.apiBaseUrl) apiBaseUrlInput.value = result.apiBaseUrl;
      if (result.apiModel) apiModelInput.value = result.apiModel;
      if (result.apiKey) apiKeyInput.value = result.apiKey;
      if (result.maxTokens) maxTokensInput.value = result.maxTokens;
      if (result.temperature) temperatureInput.value = result.temperature;
      if (result.preserveFormatting) preserveFormattingCheckbox.checked = result.preserveFormatting;
      if (result.enablePageSummary !== undefined) document.getElementById('enablePageSummary').checked = result.enablePageSummary;
      if (result.debugMode) debugModeCheckbox.checked = result.debugMode;
      
      // 加载系统提示词，如果没有保存过则使用默认值
      systemPromptTextarea.value = result.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    });
  }

  // 保存设置
  function saveSettings() {
    // 验证必填字段
    if (!apiBaseUrlInput.value || !apiModelInput.value || !apiKeyInput.value) {
      showStatus('请填写所有必填字段', 'error');
      return;
    }

    // 验证URL格式
    try {
      new URL(apiBaseUrlInput.value);
    } catch (e) {
      showStatus('请输入有效的API Base URL', 'error');
      return;
    }

    // 保存设置到Chrome存储
    chrome.storage.sync.set({
      apiBaseUrl: apiBaseUrlInput.value,
      apiModel: apiModelInput.value,
      apiKey: apiKeyInput.value,
      maxTokens: maxTokensInput.value ? parseInt(maxTokensInput.value) : null,
      temperature: temperatureInput.value ? parseFloat(temperatureInput.value) : null,
      preserveFormatting: preserveFormattingCheckbox.checked,
      enablePageSummary: document.getElementById('enablePageSummary').checked,
      debugMode: debugModeCheckbox.checked,
      systemPrompt: systemPromptTextarea.value || DEFAULT_SYSTEM_PROMPT
    }, () => {
      showStatus('设置已保存', 'success');
    });
  }

  // 测试API连接
  async function testApiConnection() {
    // 验证必填字段
    if (!apiBaseUrlInput.value || !apiModelInput.value || !apiKeyInput.value) {
      showStatus('请先填写API配置', 'error');
      return;
    }

    showStatus('正在测试API连接...', 'info');

    try {
      // 构建API请求
      const apiUrl = `${apiBaseUrlInput.value}/chat/completions`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeyInput.value}`
        },
        body: JSON.stringify({
          model: apiModelInput.value,
          messages: [
            {
              role: "user",
              content: "Hello, this is a test message. Please respond with 'API connection successful'."
            }
          ],
          max_tokens: 20
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API错误: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (data.choices && data.choices.length > 0) {
        showStatus('API连接成功！', 'success');
      } else {
        showStatus('API响应格式不正确', 'error');
      }
    } catch (error) {
      showStatus(`连接失败: ${error.message}`, 'error');
      console.error('API测试错误:', error);
    }
  }

  // 重置设置
  function resetSettings() {
    chrome.storage.sync.remove([
      'apiBaseUrl',
      'apiModel',
      'apiKey',
      'maxTokens',
      'temperature',
      'preserveFormatting',
      'enablePageSummary',
      'debugMode',
      'targetLanguage',
      'systemPrompt'
    ], () => {
      // 清空表单
      apiBaseUrlInput.value = '';
      apiModelInput.value = '';
      apiKeyInput.value = '';
      maxTokensInput.value = '';
      temperatureInput.value = '';
      preserveFormattingCheckbox.checked = false;
      document.getElementById('enablePageSummary').checked = false;
      debugModeCheckbox.checked = false;
      systemPromptTextarea.value = DEFAULT_SYSTEM_PROMPT;
      
      showStatus('所有设置已重置', 'info');
    });
  }

  // 显示状态消息
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message';
    
    if (type) {
      statusMessage.classList.add(type);
    }
    
    // 如果是成功或错误消息，3秒后自动清除
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = 'status-message';
      }, 3000);
    }
  }
});
