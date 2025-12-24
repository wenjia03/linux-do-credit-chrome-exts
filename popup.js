// LINUX DO Credit Popup Script
class LDOCreditPopup {
  constructor() {
    this.userInfo = null;
    this.transactionsData = null;
    this.init();
  }

  async init() {
    console.log('Popup initializing...');

    // 检查登录状态
    await this.checkLoginStatus();

    // 设置事件监听
    this.setupEventListeners();

    console.log('Popup initialized');
  }

  setupEventListeners() {
    // Tab 切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // 打开网站登录
    const openWebsiteBtn = document.getElementById('openWebsiteBtn');
    if (openWebsiteBtn) {
      openWebsiteBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          action: 'openTab',
          data: { url: 'https://credit.linux.do' }
        });
      });
    }

    // 重新检测登录
    const recheckBtn = document.getElementById('recheckBtn');
    if (recheckBtn) {
      recheckBtn.addEventListener('click', () => {
        this.checkLoginStatus();
      });
    }

    // 打开控制面板
    const openDashboardBtn = document.getElementById('openDashboardBtn');
    if (openDashboardBtn) {
      openDashboardBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          action: 'openTab',
          data: { url: 'https://credit.linux.do' }
        });
      });
    }

    // 刷新交易记录
    const refreshTransactionsBtn = document.getElementById('refreshTransactionsBtn');
    if (refreshTransactionsBtn) {
      refreshTransactionsBtn.addEventListener('click', () => {
        this.loadTransactions();
      });
    }

    // 记住密码开关
    const rememberPasswordToggle = document.getElementById('rememberPasswordToggle');
    if (rememberPasswordToggle) {
      rememberPasswordToggle.addEventListener('change', (e) => {
        this.handleRememberPasswordToggle(e.target.checked);
      });
    }

    // 显示/隐藏密码
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    if (togglePasswordBtn) {
      togglePasswordBtn.addEventListener('click', () => {
        this.togglePasswordVisibility();
      });
    }

    // 保存密码
    const savePasswordBtn = document.getElementById('savePasswordBtn');
    if (savePasswordBtn) {
      savePasswordBtn.addEventListener('click', () => {
        this.savePassword();
      });
    }

    // 清除密码
    const clearPasswordBtn = document.getElementById('clearPasswordBtn');
    if (clearPasswordBtn) {
      clearPasswordBtn.addEventListener('click', () => {
        this.clearPassword();
      });
    }

    // 关闭模态框
    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', () => {
        this.closeTransactionDetail();
      });
    }

    // 点击模态框背景关闭
    const modal = document.getElementById('transactionDetailModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeTransactionDetail();
        }
      });
    }
  }

  async checkLoginStatus() {
    try {
      console.log('Checking login status...');
      const response = await chrome.runtime.sendMessage({ action: 'checkLogin' });
      console.log('Login status response:', response);

      if (response) {
        // 已登录
        this.showMainContent();
        await this.loadUserInfo();
        await this.loadTransactions();
        await this.checkStoredPassword();
      } else {
        // 未登录
        this.showNotLoggedIn();
      }
    } catch (error) {
      console.error('Failed to check login status:', error);
      this.showNotLoggedIn();
    }
  }

  showNotLoggedIn() {
    console.log('Showing not logged in screen');
    document.getElementById('notLoggedIn').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('userInfo').style.display = 'none';
  }

  showMainContent() {
    console.log('Showing main content');
    document.getElementById('notLoggedIn').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
  }

  async loadUserInfo() {
    try {
      const userInfo = await chrome.runtime.sendMessage({ action: 'getUserInfo' });

      console.log('User info received:', userInfo);

      if (userInfo) {
        this.userInfo = userInfo;

        // 更新用户名
        const usernameEl = document.getElementById('username');
        if (usernameEl && userInfo.username) {
          usernameEl.textContent = userInfo.username;
        }

        // 更新信任等级
        const trustLevelEl = document.getElementById('trustLevel');
        if (trustLevelEl && userInfo.trust_level !== undefined) {
          trustLevelEl.textContent = `TL${userInfo.trust_level}`;
        }

        // 更新余额 - 检查多个可能的字段
        const balanceEl = document.getElementById('balanceAmount');
        if (balanceEl) {
          const balance = userInfo.available_balance || 0
          console.log('Balance value:', balance);
          balanceEl.textContent = `LDC ${typeof balance === 'number' ? balance.toFixed(2) : balance}`;
        }
      }
    } catch (error) {
      console.error('Failed to load user info:', error);
    }
  }

  async loadTransactions() {
    try {
      const data = await chrome.runtime.sendMessage({ action: 'getTransactions' });

      console.log('Transactions data:', data);

      const listEl = document.getElementById('transactionsList');

      if (!data || !data.orders || data.orders.length === 0) {
        listEl.innerHTML = '<div class="empty-state">暂无交易记录</div>';
        return;
      }

      // 保存完整数据
      this.transactionsData = data.orders;

      // 获取当前用户ID用于判断收款/付款
      const currentUserId = this.userInfo?.id;

      listEl.innerHTML = data.orders.slice(0, 10).map((order, index) => {
        // 判断是收款还是付款
        let isReceive = false;
        if (currentUserId) {
          isReceive = order.payee_user_id === currentUserId;
        } else {
          // 如果无法获取用户ID，根据类型判断
          isReceive = order.type === 'receive' || order.type === 'community';
        }

        return `
          <div class="transaction-item" data-index="${index}">
            <div class="transaction-header">
              <span class="transaction-type">${this.getTransactionTypeName(order.type)}</span>
              <span class="transaction-amount ${isReceive ? 'positive' : 'negative'}">
                ${isReceive ? '+' : '-'}LDC ${order.amount || '0.00'}
              </span>
            </div>
            <div class="transaction-details">
              <div class="transaction-time">${this.formatDate(new Date(order.created_at).getTime())}</div>
              ${order.order_name ? `<div class="transaction-desc">${order.order_name}</div>` : ''}
              ${order.status ? `<div class="transaction-status">${this.getStatusName(order.status)}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');

      // 为每个交易项添加点击事件
      document.querySelectorAll('.transaction-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const index = parseInt(e.currentTarget.dataset.index);
          this.showTransactionDetail(this.transactionsData[index]);
        });
      });
    } catch (error) {
      console.error('Failed to load transactions:', error);
      const listEl = document.getElementById('transactionsList');
      listEl.innerHTML = '<div class="empty-state">加载交易记录失败</div>';
    }
  }

  showTransactionDetail(order) {
    const modal = document.getElementById('transactionDetailModal');
    const content = document.getElementById('transactionDetailContent');

    // 判断是收款还是付款
    const currentUserId = this.userInfo?.id;
    let isReceive = false;
    if (currentUserId) {
      isReceive = order.payee_user_id === currentUserId;
    } else {
      isReceive = order.type === 'receive' || order.type === 'community';
    }

    // 格式化交易时间
    const formatFullTime = (timeStr) => {
      const date = new Date(timeStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };

    content.innerHTML = `
      <div class="detail-section">
        <div class="detail-section-title">基本信息</div>
        <div class="detail-row">
          <span class="detail-label">订单号</span>
          <span class="detail-value">${order.order_no || '--'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">订单名称</span>
          <span class="detail-value">${order.order_name || '--'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">金额</span>
          <span class="detail-value ${isReceive ? 'positive' : 'negative'}">
            ${isReceive ? '+' : '-'}LDC ${order.amount || '0.00'}
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-label">状态</span>
          <span class="detail-value">
            <span class="detail-status ${order.status}">${this.getStatusName(order.status)}</span>
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-label">类型</span>
          <span class="detail-value">${this.getTransactionTypeName(order.type)}</span>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">交易双方</div>
        <div class="detail-row">
          <span class="detail-label">付款方</span>
          <span class="detail-value">${order.payer_username || '系统'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">收款方</span>
          <span class="detail-value">${order.payee_username || '--'}</span>
        </div>
      </div>

      ${order.app_name || order.client_id ? `
      <div class="detail-section">
        <div class="detail-section-title">应用信息</div>
        ${order.app_name ? `
        <div class="detail-row">
          <span class="detail-label">应用名称</span>
          <span class="detail-value">${order.app_name}</span>
        </div>
        ` : ''}
        ${order.app_description ? `
        <div class="detail-row">
          <span class="detail-label">应用描述</span>
          <span class="detail-value">${order.app_description}</span>
        </div>
        ` : ''}
        ${order.app_homepage_url ? `
        <div class="detail-row">
          <span class="detail-label">应用主页</span>
          <span class="detail-value">${order.app_homepage_url}</span>
        </div>
        ` : ''}
        ${order.client_id ? `
        <div class="detail-row">
          <span class="detail-label">Client ID</span>
          <span class="detail-value" style="font-size: 11px; font-family: monospace;">${order.client_id}</span>
        </div>
        ` : ''}
      </div>
      ` : ''}

      ${order.remark ? `
      <div class="detail-section">
        <div class="detail-section-title">备注</div>
        <div class="detail-row">
          <span class="detail-value" style="text-align: left;">${order.remark}</span>
        </div>
      </div>
      ` : ''}

      <div class="detail-section">
        <div class="detail-section-title">时间信息</div>
        <div class="detail-row">
          <span class="detail-label">创建时间</span>
          <span class="detail-value">${formatFullTime(order.created_at)}</span>
        </div>
        ${order.trade_time && order.trade_time !== order.created_at ? `
        <div class="detail-row">
          <span class="detail-label">交易时间</span>
          <span class="detail-value">${formatFullTime(order.trade_time)}</span>
        </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">更新时间</span>
          <span class="detail-value">${formatFullTime(order.updated_at)}</span>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  }

  closeTransactionDetail() {
    const modal = document.getElementById('transactionDetailModal');
    modal.style.display = 'none';
  }

  async checkStoredPassword() {
    try {
      const { hasStoredPassword } = await chrome.storage.local.get('hasStoredPassword');

      const toggle = document.getElementById('rememberPasswordToggle');
      const passwordSection = document.getElementById('passwordSection');
      const savedSection = document.getElementById('passwordSavedSection');

      if (hasStoredPassword) {
        toggle.checked = true;
        passwordSection.style.display = 'none';
        savedSection.style.display = 'block';
      } else {
        toggle.checked = false;
        passwordSection.style.display = 'none';
        savedSection.style.display = 'none';
      }
    } catch (error) {
      console.error('Failed to check stored password:', error);
    }
  }

  handleRememberPasswordToggle(enabled) {
    const passwordSection = document.getElementById('passwordSection');
    const savedSection = document.getElementById('passwordSavedSection');

    if (enabled) {
      // 检查是否已保存密码
      chrome.storage.local.get('hasStoredPassword').then(({ hasStoredPassword }) => {
        if (hasStoredPassword) {
          savedSection.style.display = 'block';
          passwordSection.style.display = 'none';
        } else {
          passwordSection.style.display = 'block';
          savedSection.style.display = 'none';
        }
      });
    } else {
      // 禁用时清除密码
      this.clearPassword();
      passwordSection.style.display = 'none';
      savedSection.style.display = 'none';
    }
  }

  togglePasswordVisibility() {
    const input = document.getElementById('paymentPassword');
    const btn = document.getElementById('togglePasswordBtn');

    if (input.type === 'password') {
      input.type = 'text';
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.45 18.45 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      `;
    } else {
      input.type = 'password';
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      `;
    }
  }

  async savePassword() {
    const input = document.getElementById('paymentPassword');
    const password = input.value.trim();

    if (!/^\d{6}$/.test(password)) {
      this.showStatus('请输入6位数字密码', 'error');
      return;
    }

    try {
      // 使用 WebAuthn 注册凭据
      const userId = this.userInfo?.id || Date.now();
      const username = this.userInfo?.username || 'user';

      // 创建 WebAuthn 凭据
      const publicKeyCredentialCreationOptions = {
        challenge: new TextEncoder().encode(Math.random().toString()),
        rp: {
          name: "LINUX DO Credit",
          id: window.location.hostname
        },
        user: {
          id: new TextEncoder().encode(userId.toString()),
          name: username,
          displayName: username
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },   // ES256 (ECDSA with SHA-256)
          { alg: -257, type: "public-key" }  // RS256 (RSASSA-PKCS1-v1_5 with SHA-256)
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required"
        },
        timeout: 60000,
        attestation: "none"
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      });

      if (!credential) {
        throw new Error('WebAuthn 注册失败');
      }

      // 使用 credentialId 派生加密密钥，然后加密密码
      const credentialId = new Uint8Array(credential.rawId);
      const encrypted = await this.encryptPasswordWithCredential(password, credentialId);

      // 保存加密的密码和凭据 ID（不保存密钥！）
      const result = await chrome.runtime.sendMessage({
        action: 'savePassword',
        data: {
          password: encrypted,
          credentialId: Array.from(credentialId),
          userId: userId
        }
      });

      if (result && result.success) {
        this.showStatus('密码保存成功（已启用生物识别验证）', 'success');
        input.value = '';

        // 更新UI
        document.getElementById('passwordSection').style.display = 'none';
        document.getElementById('passwordSavedSection').style.display = 'block';
      } else {
        throw new Error(result?.error || '保存失败');
      }
    } catch (error) {
      console.error('Save password error:', error);
      if (error.name === 'NotAllowedError') {
        this.showStatus('WebAuthn 验证被取消', 'error');
      } else if (error.name === 'NotSupportedError') {
        this.showStatus('您的设备不支持生物识别验证', 'error');
      } else {
        this.showStatus('保存密码失败: ' + error.message, 'error');
      }
    }
  }

  async encryptPasswordWithCredential(password, credentialId) {
    // 使用 credentialId 派生 AES 密钥（PBKDF2）
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      credentialId,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // 使用固定的 salt（可以存储，因为 PBKDF2 的安全性不依赖 salt 的保密性）
    const salt = new TextEncoder().encode('LINUX_DO_CREDIT_SALT_V1');

    // 派生 AES-GCM 密钥
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,  // 不可导出！
      ['encrypt', 'decrypt']
    );

    // 加密密码
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return {
      encrypted: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv)
      // 不返回密钥！密钥每次从 credentialId 派生
    };
  }

  async clearPassword() {
    try {
      const result = await chrome.runtime.sendMessage({ action: 'clearPassword' });

      if (result && result.success) {
        const toggle = document.getElementById('rememberPasswordToggle');
        toggle.checked = false;

        document.getElementById('passwordSection').style.display = 'none';
        document.getElementById('passwordSavedSection').style.display = 'none';

        this.showStatus('密码已清除', 'success');
      } else {
        throw new Error('清除失败');
      }
    } catch (error) {
      this.showStatus('清除密码失败: ' + error.message, 'error');
    }
  }

  switchTab(tabName) {
    // 更新 tab 按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // 显示对应内容
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(tabName + 'Tab').classList.add('active');

    // 加载对应数据
    if (tabName === 'transactions') {
      this.loadTransactions();
    }
  }

  getTransactionTypeName(type) {
    const typeMap = {
      'payment': '付款',
      'receive': '收款',
      'transfer': '转账',
      'refund': '退款',
      'community': '社区交易',
      'online': '在线交易'
    };
    return typeMap[type] || type;
  }

  getStatusName(status) {
    const statusMap = {
      'pending': '待支付',
      'success': '成功',
      'failed': '失败',
      'expired': '已过期',
      'disputing': '争议中',
      'refund': '已退款',
      'refused': '已拒绝'
    };
    return statusMap[status] || status;
  }

  formatDate(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // 小于1分钟
    if (diff < 60000) {
      return '刚刚';
    }

    // 小于1小时
    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`;
    }

    // 小于1天
    if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}小时前`;
    }

    // 显示日期
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type} show`;

    setTimeout(() => {
      statusEl.classList.remove('show');
    }, 3000);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new LDOCreditPopup();
});
