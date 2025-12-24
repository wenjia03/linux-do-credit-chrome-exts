// LINUX DO Credit Payment Extension - Background Service Worker
const API_BASE_URL = 'https://credit.linux.do';

// ============================================
// 1. 安装和初始化
// ============================================
chrome.runtime.onInstalled.addListener(() => {
  console.log('LINUX DO Credit Extension installed');
});

// ============================================
// 2. URL 拦截 - 监听支付页面访问
// ============================================
// 防止重复拦截的标志集合
const processingTokens = new Set();

// 使用 webNavigation API 进行更可靠的拦截
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0 && details.url.startsWith('https://credit.linux.do/paying/online')) {
    const url = new URL(details.url);
    const token = url.searchParams.get('token');

    if (token && !processingTokens.has(token)) {
      console.log('WebNavigation intercepted payment URL:', token);
      // 拦截并处理支付
      handlePaymentInterception(details.tabId, token, details.url);
    }
  }
}, {
  url: [{ urlMatches: 'https://credit.linux.do/paying/online.*' }]
});

// 备用方法：同时监听 tabs.onUpdated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.startsWith('https://credit.linux.do/paying/online')) {
    const url = new URL(changeInfo.url);
    const token = url.searchParams.get('token');

    if (token && !processingTokens.has(token)) {
      console.log('Tabs.onUpdated intercepted payment URL:', token);
      // 拦截并处理支付
      handlePaymentInterception(tabId, token, changeInfo.url);
    }
  }
});

async function handlePaymentInterception(tabId, token, originalUrl) {
  // 防止重复处理同一个 token
  if (processingTokens.has(token)) {
    console.log('⏭️ Token already being processed, skipping:', token);
    return;
  }

  // 标记为处理中
  processingTokens.add(token);

  try {
    console.log('🔥 Intercepting payment:', token);

    // 获取支付信息
    console.log('Fetching payment info...');
    const paymentInfo = await fetchPaymentInfo(token);
    console.log('Payment info:', paymentInfo);

    // 保存到storage
    await chrome.storage.local.set({
      pendingPayment: {
        token,
        info: paymentInfo,
        originalUrl,
        tabId,
        timestamp: Date.now()
      }
    });
    console.log('Payment info saved to storage');

    // 安全地关闭原支付页面标签
    try {
      // 先检查标签页是否存在
      const tab = await chrome.tabs.get(tabId);
      if (tab) {
        await chrome.tabs.remove(tabId);
        console.log('✅ Original tab closed');
      }
    } catch (tabError) {
      // 标签页可能已经被关闭或不存在，忽略错误
      console.log('⚠️ Could not close tab (may already be closed):', tabError.message);
    }

    // 打开支付窗口
    await chrome.windows.create({
      url: chrome.runtime.getURL('payment-window.html'),
      type: 'popup',
      width: 400,
      height: 650,
      focused: true
    });

    // 发送通知
    chrome.notifications.create('payment-ready', {
      type: 'basic',
      iconUrl: 'icon/icon128.png',
      title: '支付窗口已打开',
      message: `请在弹窗中完成 LDC ${paymentInfo.amount || '0.00'} 的支付`,
      priority: 2
    });

    console.log('✅ Payment interception complete');

  } catch (error) {
    console.error('❌ Failed to intercept payment:', error);

    // 发送错误通知
    chrome.notifications.create('payment-error', {
      type: 'basic',
      iconUrl: 'icon/icon128.png',
      title: '支付加载失败',
      message: error.message || '无法加载支付信息',
      priority: 2
    });
  } finally {
    // 5秒后移除处理标志，允许重试
    setTimeout(() => {
      processingTokens.delete(token);
    }, 5000);
  }
}

// ============================================
// 3. Cookie 登录状态检测
// ============================================
async function checkLoginStatus() {
  try {
    const sessionCookie = await chrome.cookies.get({
      url: "https://linux.do",
      name: "linux_do_credit_session_id"
    });

    console.log('Session cookie:', sessionCookie);

    // 检查 cookie 是否存在且未过期
    if (!sessionCookie) {
      console.log('No session cookie found');
      await chrome.storage.local.set({ isLoggedIn: false });
      return false;
    }

    if (isExpired(sessionCookie)) {
      console.log('Session cookie expired');
      await chrome.storage.local.set({ isLoggedIn: false });
      return false;
    }

    console.log('Found valid session cookie:', sessionCookie.name);

    // 尝试获取用户信息验证登录状态
    const userInfo = await fetchUserInfo();

    if (userInfo) {
      console.log('User logged in:', userInfo);
      await chrome.storage.local.set({
        isLoggedIn: true,
        userInfo: userInfo,
        lastCheck: Date.now()
      });
      return true;
    }

    console.log('User not logged in - failed to fetch user info');
    await chrome.storage.local.set({ isLoggedIn: false });
    return false;
  } catch (error) {
    console.error('Login check failed:', error);
    await chrome.storage.local.set({ isLoggedIn: false });
    return false;
  }
}

function isExpired(cookie) {
  if (!cookie.expirationDate) return false;
  return cookie.expirationDate * 1000 < Date.now();
}

// ============================================
// 4. API 调用函数
// ============================================
async function fetchPaymentInfo(token) {
  const response = await fetch(`${API_BASE_URL}/api/v1/merchant/payment-links/${token}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch payment info: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

async function fetchUserInfo() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/oauth/user-info`, {
      credentials: 'include'
    });

    if (!response.ok) return null;

    const result = await response.json();
    return result.data;
  } catch {
    return null;
  }
}

async function fetchTransactions(page = 1, pageSize = 20) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/order/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        page,
        page_size: pageSize
      })
    });

    if (!response.ok) return null;

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    return null;
  }
}

async function processPayment(paymentData) {
  const { token, payKey, remark } = paymentData;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/merchant/payment-links/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        token,
        pay_key: payKey,
        remark: remark || ''
      })
    });

    const result = await response.json();

    // 判断支付成功：error_msg 为空字符串表示成功
    if (result.error_msg === "" || !result.error_msg) {
      // 保存交易记录
      if (result.data) {
        await saveTransaction(result.data);
      }

      return {
        success: true,
        data: result.data || {}
      };
    } else {
      // error_msg 有内容，表示支付失败
      const errorMsg = result.error_msg;
      const errorCode = result.code;

      // 根据错误码提供更友好的错误提示
      let friendlyMsg = errorMsg;
      if (errorCode === 10007) {
        friendlyMsg = '支付密码错误，请重新输入';
      } else if (errorCode === 10005) {
        friendlyMsg = '余额不足，请先充值';
      } else if (errorCode === 10008) {
        friendlyMsg = '订单已过期';
      } else if (errorCode === 10009) {
        friendlyMsg = '已超出每日限额';
      }

      throw new Error(friendlyMsg);
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || '网络错误，请稍后重试'
    };
  }
}

// ============================================
// 5. WebAuthn 密码管理
// ============================================
async function savePaymentPassword(encryptedPassword, credentialId, userId) {
  try {
    await chrome.storage.local.set({
      hasStoredPassword: true,
      passwordEncrypted: encryptedPassword,
      credentialId: credentialId,
      userId: userId
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to save password:', error);
    return { success: false, error: error.message };
  }
}

async function getStoredPasswordData() {
  try {
    const data = await chrome.storage.local.get([
      'hasStoredPassword',
      'passwordEncrypted',
      'credentialId',
      'userId'
    ]);

    if (!data.hasStoredPassword || !data.passwordEncrypted || !data.credentialId) {
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to get stored password data:', error);
    return null;
  }
}

async function clearStoredPassword() {
  await chrome.storage.local.remove(['hasStoredPassword', 'passwordEncrypted', 'credentialId', 'userId']);
  return { success: true };
}

// ============================================
// 6. 交易记录管理
// ============================================
async function saveTransaction(transactionData) {
  const { transactions = [] } = await chrome.storage.local.get('transactions');

  transactions.unshift({
    ...transactionData,
    timestamp: Date.now()
  });

  // 只保留最近100条
  if (transactions.length > 100) {
    transactions.splice(100);
  }

  await chrome.storage.local.set({ transactions });
}

async function getTransactions() {
  const { transactions = [] } = await chrome.storage.local.get('transactions');
  return transactions;
}

// ============================================
// 7. 消息处理
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, data } = request;

  console.log('Received message:', action);

  switch (action) {
    case 'checkLogin':
      checkLoginStatus().then(sendResponse);
      return true;

    case 'getUserInfo':
      fetchUserInfo().then(sendResponse);
      return true;

    case 'getPendingPayment':
      chrome.storage.local.get('pendingPayment').then(result => {
        console.log('Pending payment:', result.pendingPayment);
        sendResponse(result.pendingPayment);
      });
      return true;

    case 'processPayment':
      processPayment(data).then(sendResponse);
      return true;

    case 'savePassword':
      savePaymentPassword(data.password, data.credentialId, data.userId).then(sendResponse);
      return true;

    case 'getStoredPasswordData':
      getStoredPasswordData().then(sendResponse);
      return true;

    case 'clearPassword':
      clearStoredPassword().then(sendResponse);
      return true;

    case 'getTransactions':
      fetchTransactions().then(sendResponse);
      return true;

    case 'clearPendingPayment':
      chrome.storage.local.remove('pendingPayment').then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'openTab':
      chrome.tabs.create({ url: data.url }).then(() => {
        sendResponse({ success: true });
      });
      return true;
  }

  return true;
});

// ============================================
// 8. 定期检查登录状态
// ============================================
// 添加安全检查，确保 API 可用
if (chrome.alarms) {
  try {
    chrome.alarms.create('checkLogin', { periodInMinutes: 5 });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'checkLogin') {
        checkLoginStatus();
      }
    });
    console.log('Alarms set up successfully');
  } catch (e) {
    console.warn('Failed to set up alarms:', e);
  }
} else {
  console.warn('chrome.alarms API not available');
}

// 初始检查
console.log('Background script loaded');
checkLoginStatus();
