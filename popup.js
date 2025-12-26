// LINUX DO Credit Popup Script
class LDOCreditPopup {
  constructor() {
    this.userInfo = null;
    this.transactionsData = null;
    this.hasStoredPassword = false;
    this.isTransferring = false;
    this.recipientUserId = null;
    this.releaseUrl = null;
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

    // 转账按钮
    const transferBtn = document.getElementById('transferBtn');
    if (transferBtn) {
      transferBtn.addEventListener('click', () => {
        this.openTransferModal();
      });
    }

    // 关闭转账模态框
    const closeTransferModalBtn = document.getElementById('closeTransferModalBtn');
    if (closeTransferModalBtn) {
      closeTransferModalBtn.addEventListener('click', () => {
        this.closeTransferModal();
      });
    }

    // 点击模态框背景关闭转账模态框
    const transferModal = document.getElementById('transferModal');
    if (transferModal) {
      transferModal.addEventListener('click', (e) => {
        if (e.target === transferModal) {
          this.closeTransferModal();
        }
      });
    }

    // 切换转账密码可见性
    const toggleTransferPasswordBtn = document.getElementById('toggleTransferPasswordBtn');
    if (toggleTransferPasswordBtn) {
      toggleTransferPasswordBtn.addEventListener('click', () => {
        this.toggleTransferPasswordVisibility();
      });
    }

    // 确认转账
    const confirmTransferBtn = document.getElementById('confirmTransferBtn');
    if (confirmTransferBtn) {
      confirmTransferBtn.addEventListener('click', () => {
        this.processTransfer();
      });
    }

    // 获取用户ID
    const fetchUserIdBtn = document.getElementById('fetchUserIdBtn');
    if (fetchUserIdBtn) {
      fetchUserIdBtn.addEventListener('click', () => {
        this.fetchRecipientUserId();
      });
    }

    // 刷新用户信息
    const refreshUserInfoBtn = document.getElementById('refreshUserInfoBtn');
    if (refreshUserInfoBtn) {
      refreshUserInfoBtn.addEventListener('click', () => {
        this.loadUserInfo();
      });
    }

    // 检查更新按钮
    const checkUpdateBtn = document.getElementById('checkUpdateBtn');
    if (checkUpdateBtn) {
      checkUpdateBtn.addEventListener('click', () => {
        this.checkForUpdates();
      });
    }

    // 前往下载按钮
    const goToReleaseBtn = document.getElementById('goToReleaseBtn');
    if (goToReleaseBtn) {
      goToReleaseBtn.addEventListener('click', () => {
        if (this.releaseUrl) {
          chrome.runtime.sendMessage({
            action: 'openTab',
            data: { url: this.releaseUrl }
          });
        }
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
        // 先从缓存加载，不自动刷新
        await this.loadUserInfoFromCache();
        await this.loadTransactionsFromCache();
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

  async loadUserInfoFromCache() {
    try {
      // 先尝试从缓存加载
      const { cachedUserInfo } = await chrome.storage.local.get('cachedUserInfo');

      if (cachedUserInfo) {
        this.userInfo = cachedUserInfo;
        this.displayUserInfo(cachedUserInfo);
      } else {
        // 如果没有缓存，则加载
        await this.loadUserInfo();
      }
    } catch (error) {
      console.error('Failed to load user info from cache:', error);
    }
  }

  async loadUserInfo() {
    try {
      const userInfo = await chrome.runtime.sendMessage({ action: 'getUserInfo' });

      console.log('User info received:', userInfo);

      if (userInfo) {
        this.userInfo = userInfo;

        // 保存到缓存
        await chrome.storage.local.set({ cachedUserInfo: userInfo });

        this.displayUserInfo(userInfo);
      }
    } catch (error) {
      console.error('Failed to load user info:', error);
    }
  }

  displayUserInfo(userInfo) {
    // 更新用户名
    const usernameEl = document.getElementById('username');
    if (usernameEl && userInfo.username) {
      usernameEl.textContent = userInfo.username;
    }

    // 更新头像
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl && userInfo.avatar_url) {
      avatarEl.src = userInfo.avatar_url;
      avatarEl.style.display = 'block';
    }

    // 更新信任等级
    const trustLevelEl = document.getElementById('trustLevel');
    if (trustLevelEl && userInfo.trust_level !== undefined) {
      trustLevelEl.textContent = `TL${userInfo.trust_level}`;
    }

    // 更新 UID
    const uidEl = document.getElementById('userUid');
    if (uidEl && userInfo.id) {
      uidEl.textContent = `UID: ${userInfo.id}`;
      uidEl.style.display = 'block';
    }

    // 更新余额
    const balanceEl = document.getElementById('balanceAmount');
    if (balanceEl) {
      const balance = userInfo.available_balance || 0
      console.log('Balance value:', balance);
      balanceEl.textContent = `LDC ${typeof balance === 'number' ? balance.toFixed(2) : balance}`;
    }
  }

  async loadTransactionsFromCache() {
    try {
      // 先尝试从缓存加载
      const { cachedTransactions } = await chrome.storage.local.get('cachedTransactions');

      if (cachedTransactions) {
        this.displayTransactions(cachedTransactions);
      } else {
        // 如果没有缓存，则加载
        await this.loadTransactions();
      }
    } catch (error) {
      console.error('Failed to load transactions from cache:', error);
    }
  }

  async loadTransactions() {
    try {
      const data = await chrome.runtime.sendMessage({ action: 'getTransactions' });

      console.log('Transactions data:', data);

      if (data && data.orders) {
        // 保存到缓存
        await chrome.storage.local.set({ cachedTransactions: data });
      }

      this.displayTransactions(data);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      const listEl = document.getElementById('transactionsList');
      listEl.innerHTML = '<div class="empty-state">加载交易记录失败</div>';
    }
  }

  displayTransactions(data) {
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

      this.hasStoredPassword = !!hasStoredPassword;

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

    if (tabName === 'settings') {
      document.getElementById("currentVersionDisplay").textContent = chrome.runtime.getManifest().version;
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
      'pending': '待流转',
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

  // 转账相关方法
  openTransferModal() {
    const modal = document.getElementById('transferModal');

    // 检查是否有保存的密码
    if (this.hasStoredPassword) {
      document.getElementById('transferPasswordSection').style.display = 'none';
      document.getElementById('transferAuthSection').style.display = 'block';
    } else {
      document.getElementById('transferPasswordSection').style.display = 'block';
      document.getElementById('transferAuthSection').style.display = 'none';
    }

    // 清空表单和状态
    document.getElementById('recipientUsername').value = '';
    document.getElementById('transferAmount').value = '';
    document.getElementById('transferRemark').value = '';
    if (!this.hasStoredPassword) {
      document.getElementById('transferPayKey').value = '';
    }

    // 重置用户ID显示
    this.recipientUserId = null;
    document.getElementById('userIdDisplay').style.display = 'none';
    document.getElementById('userIdValue').textContent = '';

    modal.style.display = 'flex';
  }

  closeTransferModal() {
    const modal = document.getElementById('transferModal');
    modal.style.display = 'none';
  }

  toggleTransferPasswordVisibility() {
    const input = document.getElementById('transferPayKey');
    const btn = document.getElementById('toggleTransferPasswordBtn');

    if (!input) return;

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

  async processTransfer() {
    if (this.isTransferring) return;

    // 获取表单数据
    const recipientUsername = document.getElementById('recipientUsername')?.value.trim();
    const amount = parseFloat(document.getElementById('transferAmount')?.value);
    const remark = document.getElementById('transferRemark')?.value.trim() || '';

    // 验证输入
    if (!recipientUsername) {
      this.showStatus('请输入收款方用户名', 'error');
      return;
    }

    if (!amount || amount <= 0) {
      this.showStatus('请输入有效的转账金额', 'error');
      return;
    }

    let payKey;

    // 如果保存了密码，使用 WebAuthn 验证并获取密码
    if (this.hasStoredPassword) {
      this.isTransferring = true;
      this.setTransferButtonLoading(true, '验证身份中...');

      try {
        // 获取存储的密码数据
        const storedData = await chrome.runtime.sendMessage({ action: 'getStoredPasswordData' });

        if (!storedData) {
          throw new Error('未找到保存的密码');
        }

        // 使用 WebAuthn 验证
        const publicKeyCredentialRequestOptions = {
          challenge: new TextEncoder().encode(Math.random().toString()),
          allowCredentials: [{
            id: new Uint8Array(storedData.credentialId),
            type: 'public-key',
            transports: ['internal']
          }],
          timeout: 60000,
          userVerification: 'required'
        };

        const assertion = await navigator.credentials.get({
          publicKey: publicKeyCredentialRequestOptions
        });

        if (!assertion) {
          throw new Error('WebAuthn 验证失败');
        }

        // 验证成功，解密密码
        const credentialId = new Uint8Array(storedData.credentialId);
        payKey = await this.decryptPasswordWithCredential(
          storedData.passwordEncrypted,
          credentialId
        );

      } catch (error) {
        console.error('WebAuthn verification error:', error);
        this.isTransferring = false;
        this.setTransferButtonLoading(false);

        if (error.name === 'NotAllowedError') {
          this.showStatus('身份验证被取消', 'error');
        } else if (error.name === 'NotSupportedError') {
          this.showStatus('您的设备不支持生物识别验证', 'error');
        } else {
          this.showStatus(error.message || '身份验证失败', 'error');
        }
        return;
      }
    } else {
      // 手动输入密码
      payKey = document.getElementById('transferPayKey')?.value.trim();

      if (!/^\d{6}$/.test(payKey)) {
        this.showStatus('请输入6位数字流转密码', 'error');
        return;
      }

      this.isTransferring = true;
      this.setTransferButtonLoading(true, '转账中...');
    }

    // 执行转账
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'processTransfer',
        data: {
          recipientUsername,
          recipientUserId: this.recipientUserId, // 如果获取了用户ID，则传递
          amount,
          payKey,
          remark
        }
      });

      if (response && response.success) {
        this.showStatus('转账成功', 'success');
        this.closeTransferModal();

        // 刷新余额和交易记录
        await this.loadUserInfo();
        await this.loadTransactions();
      } else {
        throw new Error(response?.error || '转账失败');
      }
    } catch (error) {
      this.showStatus(error.message || '转账失败', 'error');
    } finally {
      this.isTransferring = false;
      this.setTransferButtonLoading(false);
    }
  }

  async decryptPasswordWithCredential(encryptedData, credentialId) {
    // 使用 credentialId 派生 AES 密钥
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      credentialId,
      'PBKDF2',
      false,
      ['deriveKey']
    );

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
      false,
      ['decrypt']
    );

    // 解密密码
    const { encrypted, iv } = encryptedData;

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(encrypted)
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  setTransferButtonLoading(loading, text = null) {
    const btn = document.getElementById('confirmTransferBtn');

    if (loading) {
      btn.disabled = true;
      btn.innerHTML = text || '处理中...';
    } else {
      btn.disabled = false;
      btn.innerHTML = '确认转账';
    }
  }

  async fetchRecipientUserId() {
    const usernameInput = document.getElementById('recipientUsername');
    const username = usernameInput?.value.trim();

    if (!username) {
      this.showStatus('请先输入收款方用户名', 'error');
      return;
    }

    const fetchBtn = document.getElementById('fetchUserIdBtn');
    const originalText = fetchBtn.innerHTML;

    try {
      // 显示加载状态
      fetchBtn.disabled = true;
      fetchBtn.innerHTML = '获取中...';

      // 调用 background.js 获取用户信息
      const response = await chrome.runtime.sendMessage({
        action: 'fetchLinuxDoUserInfo',
        data: { username }
      });

      if (response && response.success && response.data) {
        const userId = response.data.id;
        this.recipientUserId = userId;

        // 显示用户ID
        document.getElementById('userIdValue').textContent = userId;
        document.getElementById('userIdDisplay').style.display = 'block';

        this.showStatus('用户ID获取成功', 'success');
      } else {
        throw new Error(response?.error || '获取用户信息失败');
      }
    } catch (error) {
      console.error('Failed to fetch user ID:', error);
      this.recipientUserId = null;
      document.getElementById('userIdDisplay').style.display = 'none';

      // 显示友好的错误提示
      const errorMsg = error.message || '获取用户ID失败';
      if (errorMsg.includes('404') || errorMsg.includes('not found')) {
        this.showStatus('用户不存在，请检查用户名是否正确', 'error');
      } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        this.showStatus('网络错误，请稍后重试', 'error');
      } else if (errorMsg.includes('cloudflare') || errorMsg.includes('shield')) {
        this.showStatus('Linux.do 接口受保护，获取失败', 'error');
      } else {
        this.showStatus(errorMsg, 'error');
      }
    } finally {
      // 恢复按钮状态
      fetchBtn.disabled = false;
      fetchBtn.innerHTML = originalText;
    }
  }

  async checkForUpdates() {
    const checkBtn = document.getElementById('checkUpdateBtn');
    const originalText = checkBtn.innerHTML;

    try {
      checkBtn.disabled = true;
      checkBtn.innerHTML = '检查中...';

      const response = await chrome.runtime.sendMessage({ action: 'checkForUpdates' });

      if (response && response.success) {
        if (response.needsUpdate) {
          // 有新版本
          this.showUpdateNotice(response);
        } else {
          // 已是最新版本
          this.showStatus('当前已是最新版本', 'success');
        }
      } else {
        throw new Error(response?.error || '检查更新失败');
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      this.showStatus(error.message || '检查更新失败', 'error');
    } finally {
      checkBtn.disabled = false;
      checkBtn.innerHTML = originalText;
    }
  }

  showUpdateNotice(updateInfo) {
    // 显示更新提示
    const updateNotice = document.getElementById('updateNotice');
    const currentVersionEl = document.getElementById('currentVersion');
    const latestVersionEl = document.getElementById('latestVersion');
    const releaseNotesEl = document.getElementById('releaseNotes');

    if (updateNotice) {
      currentVersionEl.textContent = updateInfo.currentVersion;
      latestVersionEl.textContent = updateInfo.latestVersion;

      // 显示更新日志
      if (updateInfo.releaseInfo && updateInfo.releaseInfo.body) {
        releaseNotesEl.textContent = updateInfo.releaseInfo.body;
      } else {
        releaseNotesEl.textContent = '详细更新内容请查看发布页面。';
      }

      // 保存 release URL
      this.releaseUrl = updateInfo.releaseInfo?.htmlUrl || 'https://github.com/wenjia03/linux-do-credit-chrome-exts/releases';

      updateNotice.style.display = 'block';

      // 切换到设置标签页
      this.switchTab('settings');

      this.showStatus('发现新版本!', 'success');
    }
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new LDOCreditPopup();
});
