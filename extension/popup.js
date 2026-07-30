document.getElementById('clipBtn').addEventListener('click', async () => {
  const btn = document.getElementById('clipBtn');
  const statusDiv = document.getElementById('status');
  
  btn.disabled = true;
  btn.innerText = '正在提取...';
  statusDiv.style.display = 'none';
  statusDiv.className = '';

  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Inject and execute content script
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // First try to get selected text
        const selection = window.getSelection().toString().trim();
        if (selection) return selection;
        
        // If no selection, grab main content heuristics (simple innerText for now)
        return document.body.innerText;
      }
    });

    const jdText = results[0].result;
    
    if (!jdText || jdText.length < 50) {
      throw new Error("提取到的文本太少，请尝试手动选中JD文本后再点击。");
    }

    btn.innerText = '正在发送至 OfferFlow...';

    const response = await fetch('http://localhost:8000/api/leads/clip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_url: tab.url,
        jd_content: jdText.substring(0, 10000) // Limit size
      })
    });

    if (!response.ok) {
      throw new Error(`服务器响应错误: ${response.status}`);
    }

    const data = await response.json();
    
    statusDiv.innerText = '✅ 提取成功！请前往 OfferFlow 工作台查看。';
    statusDiv.className = 'success';
    statusDiv.style.display = 'block';
    btn.innerText = '提取并发送至 OfferFlow';
    
  } catch (error) {
    statusDiv.innerText = `❌ 发生错误: ${error.message}`;
    statusDiv.className = 'error';
    statusDiv.style.display = 'block';
    btn.disabled = false;
    btn.innerText = '提取并发送至 OfferFlow';
  }
});
