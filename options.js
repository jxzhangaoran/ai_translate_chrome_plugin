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

  // 加载保存的设置
  function loadSavedSettings() {
    chrome.storage.sync.get([
      'apiBaseUrl',
      'apiModel',
      'apiKey',
      'maxTokens',
      'temperature',
      'preserveFormatting',
      'debugMode'
    ], (result) => {
      if (result.apiBaseUrl) apiBaseUrlInput.value = result.apiBaseUrl;
      if (result.apiModel) apiModelInput.value = result.apiModel;
      if (result.apiKey) apiKeyInput.value = result.apiKey;
      if (result.maxTokens) maxTokensInput.value = result.maxTokens;
      if (result.temperature) temperatureInput.value = result.temperature;
      if (result.preserveFormatting) preserveFormattingCheckbox.checked = result.preserveFormatting;
      if (result.debugMode) debugModeCheckbox.checked = result.debugMode;
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
      debugMode: debugModeCheckbox.checked
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
      'debugMode',
      'targetLanguage'
    ], () => {
      // 清空表单
      apiBaseUrlInput.value = '';
      apiModelInput.value = '';
      apiKeyInput.value = '';
      maxTokensInput.value = '';
      temperatureInput.value = '';
      preserveFormattingCheckbox.checked = false;
      debugModeCheckbox.checked = false;
      
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
