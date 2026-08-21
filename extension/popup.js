const fillBtn = document.getElementById('fillBtn');
const clipBtn = document.getElementById('clipBtn');
const optionsBtn = document.getElementById('optionsBtn');
const statusEl = document.getElementById('status');
const profileSummary = document.getElementById('profileSummary');

function showStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status visible ${type}`;
}

function setBusy(button, busy, busyText, normalText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/i.test(tab.url || '')) {
    throw new Error('请在正常的招聘网页中使用此功能');
  }
  return tab;
}

async function openProfilePage() {
  const optionsUrl = chrome.runtime.getURL('options.html');
  try {
    await chrome.tabs.create({ url: optionsUrl });
    window.close();
  } catch (tabError) {
    try {
      await chrome.runtime.openOptionsPage();
      window.close();
    } catch (optionsError) {
      showStatus('无法打开资料页，请在扩展管理页面重新加载本扩展。', 'error');
    }
  }
}

async function refreshProfileSummary() {
  const { autofillProfile = {} } = await chrome.storage.local.get('autofillProfile');
  const populated = Object.entries(autofillProfile).filter(([key, value]) => key !== 'educations' && String(value || '').trim()).length;
  const educationCount = Array.isArray(autofillProfile.educations)
    ? autofillProfile.educations.filter((item) => Object.values(item || {}).some((value) => String(value || '').trim())).length
    : 0;
  if (!populated && !educationCount) {
    profileSummary.textContent = '请先完善个人资料';
    fillBtn.textContent = '先去填写我的资料';
    return;
  }
  profileSummary.textContent = `已保存 ${populated} 项资料${educationCount ? ` · ${educationCount} 段教育` : ''}`;
}

optionsBtn.addEventListener('click', openProfilePage);

fillBtn.addEventListener('click', async () => {
  const { autofillProfile = {} } = await chrome.storage.local.get('autofillProfile');
  const populated = Object.entries(autofillProfile).some(([key, value]) => key !== 'educations' && String(value || '').trim())
    || (Array.isArray(autofillProfile.educations)
      && autofillProfile.educations.some((item) => Object.values(item || {}).some((value) => String(value || '').trim())));
  if (!populated) {
    await openProfilePage();
    return;
  }

  setBusy(fillBtn, true, '正在识别页面…', '智能识别并填写');
  statusEl.className = 'status';
  try {
    const tab = await getActiveTab();
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['autofill.js']
    });
    const count = result?.filled || 0;
    const skipped = result?.skipped || 0;
    if (!count) {
      showStatus('没有识别到可填写字段。可以刷新页面后重试。', 'warning');
    } else {
      showStatus(`已填写 ${count} 项${skipped ? `，跳过 ${skipped} 项已有内容` : ''}。提交前请检查。`, 'success');
    }
  } catch (error) {
    showStatus(`填写失败：${error.message}`, 'error');
  } finally {
    setBusy(fillBtn, false, '', '智能识别并填写');
  }
});

clipBtn.addEventListener('click', async () => {
  setBusy(clipBtn, true, '…', '＋');
  statusEl.className = 'status';
  try {
    const tab = await getActiveTab();
    const [{ result: jdText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString().trim() || document.body.innerText
    });
    if (!jdText || jdText.length < 50) {
      throw new Error('页面文字太少，请选中 JD 文本后重试');
    }
    const response = await fetch('http://localhost:8001/api/leads/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_url: tab.url, jd_content: jdText.slice(0, 10000) })
    });
    if (!response.ok) throw new Error(`OfferFlow 服务返回 ${response.status}`);
    showStatus('职位已收藏到 OfferFlow 线索池。', 'success');
  } catch (error) {
    showStatus(`收藏失败：${error.message}`, 'error');
  } finally {
    setBusy(clipBtn, false, '', '＋');
  }
});

refreshProfileSummary();
