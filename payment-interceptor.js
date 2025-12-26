// Payment interceptor for LINUX DO Credit

class PaymentInterceptor {
  constructor() {
    this.init();
  }

  init() {
    // Listen to web navigation events
    chrome.webNavigation.onBeforeNavigate.addListener(this.handleNavigation.bind(this), {
      url: [
        { hostEquals: 'credit.linux.do', pathPrefix: '/paying/online' },
        { hostEquals: 'credit.linux.do', pathPrefix: '/paying' }
      ]
    });

    // Listen to web requests
    chrome.webRequest.onBeforeRequest.addListener(
      this.handleRequest.bind(this),
      {
        urls: [
          '*://credit.linux.do/paying/online*',
          '*://credit.linux.do/paying?order_no=*'
        ],
        types: ['main_frame']
      },
      ['blocking']
    );

    // Handle extension messages for payment processing
    chrome.runtime.onMessage.addListener(this.handlePaymentMessage.bind(this));
  }

  handleNavigation(details) {
    if (details.frameId !== 0) return;

    const url = new URL(details.url);

    // 明确区分两种类型的支付链接
    // 类型1: /paying/online?token=xxx (payment-links)
    if (url.pathname === '/paying/online' && url.searchParams.has('token')) {
      const token = url.searchParams.get('token');
      if (token) {
        chrome.tabs.update(details.tabId, { url: 'about:blank' });
        this.processPaymentInSidebar(token, 'token');
      }
    }
    // 类型2: /paying?order_no=xxx (merchant payment)
    else if (url.pathname === '/paying' && url.searchParams.has('order_no')) {
      const orderNo = url.searchParams.get('order_no');
      if (orderNo) {
        chrome.tabs.update(details.tabId, { url: 'about:blank' });
        this.processPaymentInSidebar(orderNo, 'order_no');
      }
    }
  }

  handleRequest(details) {
    const url = new URL(details.url);

    // 明确区分两种类型的支付请求
    // 类型1: /paying/online?token=xxx
    const isTokenPayment = url.pathname === '/paying/online' && url.searchParams.has('token');
    // 类型2: /paying?order_no=xxx
    const isOrderNoPayment = url.pathname === '/paying' && url.searchParams.has('order_no');

    if (isTokenPayment || isOrderNoPayment) {
      return { cancel: true };
    }

    return {};
  }

  async processPaymentInSidebar(identifier, type) {
    try {
      // Get payment information
      const paymentInfo = await this.getPaymentInfo(identifier, type);

      // Store payment info for sidebar
      await chrome.storage.local.set({
        pendingPayment: {
          identifier,
          type,
          info: paymentInfo,
          timestamp: Date.now()
        }
      });

      // Open sidebar
      if (chrome.sidePanel && chrome.sidePanel.open) {
        // Use Side Panel API if available (Chrome 114+)
        await chrome.sidePanel.open({ tabId: await this.getCurrentTabId() });
        await chrome.sidePanel.setOptions({
          path: 'payment-sidebar.html',
          enabled: true
        });
      } else {
        // Fallback to popup window
        this.openPaymentPopup(identifier);
      }
    } catch (error) {
      console.error('Failed to process payment:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '流转处理失败',
        message: '无法加载流转信息: ' + error.message
      });
    }
  }

  async getCFCookies() {
    // Get CloudFlare related cookies for credit.linux.do
    const cookies = await chrome.cookies.getAll({
      domain: '.linux.do'
    });

    // Filter CloudFlare cookies (cf_clearance, __cflb, __cf_bm, etc.)
    const cfCookies = cookies.filter(cookie =>
      cookie.name.startsWith('cf_') ||
      cookie.name.startsWith('__cf') ||
      cookie.name === '_cfuvid'
    );

    // Build cookie string
    return cfCookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  async getPaymentInfo(identifier, type) {
    let url, apiDescription;

    // 严格区分两种类型，使用不同的 API 端点
    if (type === 'token') {
      // 类型1: payment-links API (旧的支付链接方式)
      url = `https://credit.linux.do/api/v1/merchant/payment-links/${identifier}`;
      apiDescription = 'Payment Links API (token)';
    } else if (type === 'order_no') {
      // 类型2: merchant payment order API (新的订单号方式)
      const encodedOrderNo = encodeURIComponent(identifier);
      url = `https://credit.linux.do/api/v1/merchant/payment/order?order_no=${encodedOrderNo}`;
      apiDescription = 'Merchant Payment Order API (order_no)';
    } else {
      throw new Error(`Unknown payment type: ${type}`);
    }

    console.log(`[PaymentInterceptor] 📡 Calling ${apiDescription}:`, url);

    // Get CloudFlare cookies
    const cfCookies = await this.getCFCookies();

    const headers = {
      'Accept': 'application/json'
    };

    if (cfCookies) {
      headers['Cookie'] = cfCookies;
      console.log('[PaymentInterceptor] 🍪 CloudFlare cookies attached');
    }

    const response = await fetch(url, {
      credentials: 'include',
      headers: headers
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    // Handle different response formats
    if (type === 'order_no') {
      // For order_no API, check error_msg field
      if (result.error_msg) {
        throw new Error(result.error_msg);
      }
      console.log('[PaymentInterceptor] ✅ Order info fetched successfully');
      return result.data;
    } else if (type === 'token') {
      // For token API, data is directly in result.data
      console.log('[PaymentInterceptor] ✅ Payment link info fetched successfully');
      return result.data;
    }
  }

  handlePaymentMessage(message, sender, sendResponse) {
    if (message.action === 'processPayment') {
      this.handleUserPayment(message.data).then(sendResponse);
      return true;
    } else if (message.action === 'getPendingPayment') {
      this.getPendingPayment().then(sendResponse);
      return true;
    } else if (message.action === 'completePayment') {
      this.completePayment(message.data).then(sendResponse);
      return true;
    }
  }

  async handleUserPayment(data) {
    const { identifier, type, payKey, rememberPassword } = data;

    try {
      // Store payment password if remember is checked
      if (rememberPassword) {
        await this.storePaymentPassword(payKey);
      }

      // Get CloudFlare cookies
      const cfCookies = await this.getCFCookies();

      const headers = {
        'Content-Type': 'application/json'
      };

      if (cfCookies) {
        headers['Cookie'] = cfCookies;
      }

      let apiUrl, requestBody, apiDescription;

      // 严格区分两种类型，使用不同的 API 端点
      if (type === 'order_no') {
        // 类型2: merchant payment order (新的订单号支付方式)
        apiUrl = 'https://credit.linux.do/api/v1/merchant/payment/pay';
        requestBody = {
          order_no: identifier,
          pay_key: payKey,
          remark: data.remark || ''
        };
        apiDescription = 'Merchant Payment API (order_no)';
      } else if (type === 'token') {
        // 类型1: payment-links (旧的支付链接方式)
        apiUrl = 'https://credit.linux.do/api/v1/merchant/payment-links/pay';
        requestBody = {
          token: identifier,
          pay_key: payKey,
          remark: data.remark || ''
        };
        apiDescription = 'Payment Links API (token)';
      } else {
        throw new Error(`Unknown payment type: ${type}`);
      }

      console.log(`[PaymentInterceptor] 📡 Processing payment via ${apiDescription}:`, apiUrl);

      // Process payment
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        credentials: 'include'
      });

      const result = await response.json();

      if (result.code === 1) {
        return {
          success: true,
          data: result.data,
          redirectUrl: result.data.redirect_url
        };
      } else {
        throw new Error(result.msg);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async completePayment(data) {
    try {
      const { success, redirectUrl } = data;

      if (success && redirectUrl) {
        // Open redirect URL in new tab if it's not credit.linux.do
        const url = new URL(redirectUrl);
        if (!url.hostname.endsWith('credit.linux.do')) {
          chrome.tabs.create({ url: redirectUrl });
        }
      }

      // Clear pending payment
      await chrome.storage.local.remove('pendingPayment');

      return { success: true };
    } catch (error) {
      console.error('Failed to complete payment:', error);
      return { success: false, error: error.message };
    }
  }

  async getPendingPayment() {
    const { pendingPayment } = await chrome.storage.local.get('pendingPayment');
    return pendingPayment;
  }

  async getCurrentTabId() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.id;
  }

  openPaymentPopup(token) {
    chrome.windows.create({
      url: `payment-popup.html?token=${token}`,
      type: 'popup',
      width: 480,
      height: 680,
      left: 100,
      top: 100
    });
  }

  // WebAuthn implementation for secure password storage
  async storePaymentPassword(password) {
    try {
      // Generate a credential using WebAuthn
      const publicKeyCredentialCreationOptions = {
        challenge: new Uint8Array(32),
        rp: {
          name: "LINUX DO Credit",
          id: "credit.linux.do"
        },
        user: {
          id: new TextEncoder().encode(await this.getUserId()),
          name: "payment-password",
          displayName: "Payment Password"
        },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "preferred"
        },
        extensions: {
          payment: {
            password: password
          }
        }
      };

      const credential = await navigator.credentials.create({ publicKey: publicKeyCredentialCreationOptions });

      // Store credential ID
      await chrome.storage.local.set({
        paymentCredential: credential.id
      });

    } catch (error) {
      console.error('Failed to store payment password:', error);
      throw error;
    }
  }

  async retrievePaymentPassword() {
    try {
      const { paymentCredential } = await chrome.storage.local.get('paymentCredential');

      if (!paymentCredential) {
        return null;
      }

      // Get the credential using WebAuthn
      const publicKeyCredentialRequestOptions = {
        challenge: new Uint8Array(32),
        allowCredentials: [{
          id: paymentCredential,
          type: 'public-key',
          transports: ['internal']
        }],
        userVerification: "preferred"
      };

      const assertion = await navigator.credentials.get({ publicKey: publicKeyCredentialRequestOptions });

      // In a real implementation, you would extract the password from the extension
      // For now, we'll return a placeholder
      return assertion.response.authenticatorData;
    } catch (error) {
      console.error('Failed to retrieve payment password:', error);
      return null;
    }
  }

  async getUserId() {
    // Get user ID from storage or API
    const { userInfo } = await chrome.storage.local.get('userInfo');
    return userInfo?.id || 'anonymous';
  }
}

// Initialize the payment interceptor
new PaymentInterceptor();