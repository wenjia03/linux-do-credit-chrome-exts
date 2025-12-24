// Payment interceptor for LINUX DO Credit

class PaymentInterceptor {
  constructor() {
    this.init();
  }

  init() {
    // Listen to web navigation events
    chrome.webNavigation.onBeforeNavigate.addListener(this.handleNavigation.bind(this), {
      url: [{ hostEquals: 'credit.linux.do', pathPrefix: '/paying/online' }]
    });

    // Listen to web requests
    chrome.webRequest.onBeforeRequest.addListener(
      this.handleRequest.bind(this),
      {
        urls: ['*://credit.linux.do/paying/online*'],
        types: ['main_frame']
      },
      ['blocking']
    );

    // Handle extension messages for payment processing
    chrome.runtime.onMessage.addListener(this.handlePaymentMessage.bind(this));
  }

  handleNavigation(details) {
    // Extract token from URL
    const url = new URL(details.url);
    const token = url.searchParams.get('token');

    if (token && details.frameId === 0) {
      // Cancel the navigation
      chrome.tabs.update(details.tabId, { url: 'about:blank' });

      // Process the payment in sidebar
      this.processPaymentInSidebar(token);
    }
  }

  handleRequest(details) {
    const url = new URL(details.url);
    const token = url.searchParams.get('token');

    if (token) {
      // Cancel the request
      return { cancel: true };
    }

    return {};
  }

  async processPaymentInSidebar(token) {
    try {
      // Get payment information
      const paymentInfo = await this.getPaymentInfo(token);

      // Store payment info for sidebar
      await chrome.storage.local.set({
        pendingPayment: {
          token,
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
        this.openPaymentPopup(token);
      }
    } catch (error) {
      console.error('Failed to process payment:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '支付处理失败',
        message: '无法加载支付信息: ' + error.message
      });
    }
  }

  async getPaymentInfo(token) {
    const response = await fetch(`https://credit.linux.do/api/v1/payment-links/${token}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
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
    const { token, payKey, rememberPassword } = data;

    try {
      // Store payment password if remember is checked
      if (rememberPassword) {
        await this.storePaymentPassword(payKey);
      }

      // Process payment
      const response = await fetch('https://credit.linux.do/api/v1/merchant/payment-links/pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          pay_key: payKey,
          remark: data.remark || ''
        }),
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