// ============================================
// KIROO AI - Frontend Logic
// ============================================

const input = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const chatArea = document.getElementById('chatArea');
const messagesEl = document.getElementById('messages');
const welcomeEl = document.getElementById('welcome');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const artifactPanel = document.getElementById('artifactPanel');
const artifactFrame = document.getElementById('artifactFrame');
const artifactTitle = document.getElementById('artifactTitle');

let conversationHistory = [];
let isGenerating = false;
let hasMessages = false;
let currentArtifactCode = '';

// Storage artifact berdasarkan ID
const artifactStore = new Map();
let artifactCounter = 0;

// ============ INIT LUCIDE ============
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}
document.addEventListener('DOMContentLoaded', refreshIcons);

// ============ TEXTAREA AUTO-RESIZE ============
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 300) + 'px';
  sendBtn.disabled = input.value.trim() === '' || isGenerating;
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

// ============ SIDEBAR ============
function toggleSidebar() {
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

overlay.addEventListener('click', () => {
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('active');
});

// ============ NEW CHAT ============
function newChat() {
  messagesEl.innerHTML = '';
  messagesEl.style.display = 'none';
  welcomeEl.style.display = 'flex';
  hasMessages = false;
  conversationHistory = [];
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;
  closeArtifact();
  if (window.innerWidth <= 768) {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('active');
  }
}

// ============ SUGGESTION ============
function sendSuggestion(text) {
  input.value = text;
  input.dispatchEvent(new Event('input'));
  sendMessage();
}

// ============ ESCAPE HTML ============
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============ MARKDOWN RENDER ============
function renderMarkdown(text) {
  // 1. Extract code blocks first (placeholder approach untuk hindari nested parse)
  const blocks = [];
  let html = text;

  // Artifact: ```script
  html = html.replace(/```script\s*\n?([\s\S]*?)```/g, (m, code) => {
    const trimmed = code.trim();
    const id = 'artifact-' + (++artifactCounter);
    artifactStore.set(id, trimmed);
    const idx = blocks.length;
    blocks.push(`
      <div class="artifact-block">
        <div class="artifact-block-header">
          <div class="artifact-block-title">
            <i data-lucide="code-xml"></i>
            <span>Script Artifact</span>
          </div>
          <button class="artifact-play-btn" data-artifact-id="${id}">
            <i data-lucide="play"></i>
            <span>Jalankan</span>
          </button>
        </div>
        <pre><code>${escapeHtml(trimmed)}</code></pre>
      </div>
    `);
    return `\u0000BLOCK${idx}\u0000`;
  });

  // Regular code blocks
  html = html.replace(/```(\w*)\s*\n?([\s\S]*?)```/g, (m, lang, code) => {
    const idx = blocks.length;
    blocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `\u0000BLOCK${idx}\u0000`;
  });

  // 2. Escape sisa HTML
  html = escapeHtml(html);

  // 3. Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // 4. Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 5. Italic (avoid bold)
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

  // 6. Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 7. Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // 8. Lists
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)(?:\n<li>[\s\S]*?<\/li>)*/g, (m) => '<ul>' + m + '</ul>');

  // 9. Paragraphs
  html = html.split(/\n\n+/).map(p => {
    p = p.trim();
    if (!p) return '';
    if (/^\s*<(h[1-6]|ul|ol|pre|div|blockquote|li|table)/.test(p)) return p;
    if (/^\u0000BLOCK\d+\u0000$/.test(p)) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');

  // 10. Restore blocks
  html = html.replace(/\u0000BLOCK(\d+)\u0000/g, (m, i) => blocks[parseInt(i)]);

  return html;
}

// ============ STREAMING RENDER (sederhana) ============
function renderStreaming(text) {
  // Konversi newline ke <br>, escape HTML
  return escapeHtml(text).replace(/\n/g, '<br>');
}

// ============ ADD MESSAGE ============
function addMessage(role, text) {
  if (!hasMessages) {
    welcomeEl.style.display = 'none';
    messagesEl.style.display = 'block';
    hasMessages = true;
  }

  const msg = document.createElement('div');
  msg.className = 'message ' + (role === 'user' ? 'user' : 'ai');

  if (role === 'user') {
    msg.innerHTML = `
      <div class="message-avatar">U</div>
      <div class="message-content">
        <div class="message-name">Anda</div>
        <div class="message-text"><p>${escapeHtml(text).replace(/\n/g, '<br>')}</p></div>
      </div>
    `;
  } else {
    msg.innerHTML = `
      <div class="message-avatar">K</div>
      <div class="message-content">
        <div class="message-name">Kiroo AI</div>
        <div class="message-text" data-role="ai-text">
          <div class="typing"><span></span><span></span><span></span></div>
        </div>
      </div>
    `;
  }

  messagesEl.appendChild(msg);
  refreshIcons();
  chatArea.scrollTop = chatArea.scrollHeight;
  return msg;
}

// ============ SEND MESSAGE ============
async function sendMessage() {
  const text = input.value.trim();
  if (!text || isGenerating) return;

  isGenerating = true;
  sendBtn.disabled = true;

  addMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });

  input.value = '';
  input.style.height = 'auto';

  const aiMsg = addMessage('ai');
  const textEl = aiMsg.querySelector('[data-role="ai-text"]');

  let fullText = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory })
    });

    if (!response.ok) {
      let errMsg = 'Terjadi kesalahan pada server.';
      try {
        const j = await response.json();
        if (j.error) errMsg = j.error;
        if (j.detail) errMsg += '\n\n' + j.detail;
      } catch (_) {}
      textEl.innerHTML = `<p style="color:#dc2626;">⚠️ ${escapeHtml(errMsg)}</p>`;
      isGenerating = false;
      sendBtn.disabled = input.value.trim() === '';
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastRender = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            // Throttle render supaya tidak lag
            const now = Date.now();
            if (now - lastRender > 40) {
              textEl.innerHTML = renderStreaming(fullText);
              chatArea.scrollTop = chatArea.scrollHeight;
              lastRender = now;
            }
          }
        } catch (_) {}
      }
    }

    // Final render dengan markdown lengkap
    textEl.innerHTML = renderMarkdown(fullText);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
      <button class="action-btn" data-action="copy" title="Copy">
        <i data-lucide="copy"></i>
      </button>
      <button class="action-btn" data-action="like" title="Suka">
        <i data-lucide="thumbs-up"></i>
      </button>
      <button class="action-btn" data-action="dislike" title="Tidak suka">
        <i data-lucide="thumbs-down"></i>
      </button>
      <button class="action-btn" data-action="regenerate" title="Regenerate">
        <i data-lucide="refresh-cw"></i>
      </button>
    `;
    textEl.parentElement.appendChild(actions);

    conversationHistory.push({ role: 'assistant', content: fullText });
    refreshIcons();
    chatArea.scrollTop = chatArea.scrollHeight;
  } catch (err) {
    console.error(err);
    textEl.innerHTML = `<p style="color:#dc2626;">⚠️ Koneksi gagal: ${escapeHtml(err.message)}</p>`;
  } finally {
    isGenerating = false;
    sendBtn.disabled = input.value.trim() === '';
  }
}

// ============ ARTIFACT HANDLING ============
document.addEventListener('click', (e) => {
  // Play artifact button
  const playBtn = e.target.closest('.artifact-play-btn');
  if (playBtn) {
    const id = playBtn.dataset.artifactId;
    const code = artifactStore.get(id);
    if (code) openArtifact(code);
    return;
  }

  // Message actions
  const actionBtn = e.target.closest('.action-btn');
  if (actionBtn) {
    const action = actionBtn.dataset.action;
    const content = actionBtn.closest('.message-content')
      .querySelector('.message-text').innerText;

    if (action === 'copy') {
      navigator.clipboard.writeText(content).then(() => {
        const orig = actionBtn.innerHTML;
        actionBtn.innerHTML = '<i data-lucide="check"></i>';
        refreshIcons();
        setTimeout(() => {
          actionBtn.innerHTML = orig;
          refreshIcons();
        }, 1400);
      });
    }
  }
});

// ============ OPEN / CLOSE ARTIFACT ============
function openArtifact(code) {
  currentArtifactCode = code;
  artifactPanel.classList.add('open');
  artifactTitle.textContent = 'Artifact';

  // Set konten iframe
  artifactFrame.srcdoc = code;

  // Update layout setelah transisi
  setTimeout(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  }, 320);
}

function closeArtifact() {
  artifactPanel.classList.remove('open');
  setTimeout(() => {
    artifactFrame.srcdoc = '';
    currentArtifactCode = '';
  }, 320);
}

function refreshArtifact() {
  if (!currentArtifactCode) return;
  const code = currentArtifactCode;
  artifactFrame.srcdoc = '';
  setTimeout(() => { artifactFrame.srcdoc = code; }, 50);
}

function openArtifactNewTab() {
  if (!currentArtifactCode) return;
  const blob = new Blob([currentArtifactCode], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Expose global untuk inline onclick di HTML
window.toggleSidebar = toggleSidebar;
window.newChat = newChat;
window.sendSuggestion = sendSuggestion;
window.sendMessage = sendMessage;
window.closeArtifact = closeArtifact;
window.refreshArtifact = refreshArtifact;
window.openArtifactNewTab = openArtifactNewTab;

// Init
input.focus();
refreshIcons();
