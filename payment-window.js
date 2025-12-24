// Payment Window JavaScript
class PaymentWindow {
  constructor() {
    this.paymentData = null;
    this.isProcessing = false;
    this.hasStoredPassword = false;
    this.init();
  }

  async init() {
    await this.loadPaymentData();
    await this.checkStoredPassword();
    this.setupEventListeners();
  }

  async loadPaymentData() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getPendingPayment' });

      if (response && response.info) {
        this.paymentData = response;
        this.displayPaymentInfo(response.info);
      } else {
        this.showError('无法加载支付信息');
      }
    } catch (error) {
      console.error('Failed to load payment data:', error);
      this.showError('加载支付信息失败');
    }
  }

  displayPaymentInfo(info) {
    // 更新金额
    const amountEl = document.getElementById('paymentAmount');
    if (amountEl) {
      amountEl.textContent = (info.amount || info.money || '0.00').toString();
    }

    // 更新商品名称
    const productNameEl = document.getElementById('productName');
    if (productNameEl) {
      productNameEl.textContent = info.product_name || info.name || '商品/服务';
    }

    // 如果有备注，自动填充
    if (info.remark) {
      const remarkEl = document.getElementById('remark');
      if (remarkEl) {
        remarkEl.value = info.remark;
      }
    }
  }

  setupEventListeners() {
    // 关闭按钮
    document.getElementById('closeBtn')?.addEventListener('click', () => {
      this.closePayment();
    });

    // 切换密码可见性
    document.getElementById('togglePassword')?.addEventListener('click', () => {
      this.togglePasswordVisibility();
    });

    // 支付按钮
    document.getElementById('payButton')?.addEventListener('click', () => {
      this.processPayment();
    });

    // 取消按钮
    document.getElementById('cancelButton')?.addEventListener('click', () => {
      this.closePayment();
    });

    // Enter 键支付
    document.getElementById('payKey')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.processPayment();
      }
    });

    // 重试按钮
    document.getElementById('retryBtn')?.addEventListener('click', () => {
      this.showPaymentForm();
    });

    // 关闭错误
    document.getElementById('closeErrorBtn')?.addEventListener('click', () => {
      this.closePayment();
    });

    // 完成按钮
    document.getElementById('closeSuccessBtn')?.addEventListener('click', () => {
      this.closePayment();
    });

    // 立即跳转
    document.getElementById('redirectNowBtn')?.addEventListener('click', () => {
      this.handleRedirect();
    });

    // 跳过跳转
    document.getElementById('skipRedirectBtn')?.addEventListener('click', () => {
      this.skipRedirect();
    });
  }

  async checkStoredPassword() {
    try {
      const { hasStoredPassword } = await chrome.storage.local.get('hasStoredPassword');

      this.hasStoredPassword = !!hasStoredPassword;

      if (hasStoredPassword) {
        // 隐藏密码输入表单，只显示支付按钮
        const passwordGroup = document.querySelector('.form-group:has(#payKey)');
        const remarkGroup = document.querySelector('.form-group:has(#remark)');

        if (passwordGroup) {
          passwordGroup.style.display = 'none';
        }

        // 更新支付按钮文本
        const payButton = document.getElementById('payButton');
        if (payButton) {
          const buttonText = payButton.querySelector('.button-text');
          if (buttonText) {
            buttonText.textContent = '验证并支付';
          }
        }

        console.log('Password is stored, simplified UI displayed');
      }
    } catch (error) {
      console.error('Failed to check stored password:', error);
      this.hasStoredPassword = false;
    }
  }

  togglePasswordVisibility() {
    const input = document.getElementById('payKey');
    const btn = document.getElementById('togglePassword');

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

  async processPayment() {
    if (this.isProcessing) return;

    let payKey;
    const remark = document.getElementById('remark')?.value.trim() || '';

    // 如果保存了密码，先通过 WebAuthn 验证并获取密码
    if (this.hasStoredPassword) {
      this.isProcessing = true;
      this.setButtonLoading(true, '请验证身份...');

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

        // 验证成功，使用 credentialId 派生密钥并解密密码
        const credentialId = new Uint8Array(storedData.credentialId);
        payKey = await this.decryptPasswordWithCredential(
          storedData.passwordEncrypted,
          credentialId
        );

        console.log('WebAuthn verification successful');
      } catch (error) {
        console.error('WebAuthn verification error:', error);
        this.isProcessing = false;
        this.setButtonLoading(false);

        if (error.name === 'NotAllowedError') {
          this.showError('身份验证被取消');
        } else if (error.name === 'NotSupportedError') {
          this.showError('您的设备不支持生物识别验证');
        } else {
          this.showError(error.message || '身份验证失败');
        }
        return;
      }
    } else {
      // 手动输入密码
      payKey = document.getElementById('payKey')?.value.trim();

      // 验证密码
      if (!/^\d{6}$/.test(payKey)) {
        this.showError('请输入6位数字支付密码');
        return;
      }

      this.isProcessing = true;
      this.setButtonLoading(true);
    }

    // 执行支付
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'processPayment',
        data: {
          token: this.paymentData.token,
          payKey: payKey,
          remark: remark
        }
      });

      if (response.success) {
        this.showSuccess(response.data);
      } else {
        throw new Error(response.error || '支付失败');
      }
    } catch (error) {
      this.showError(error.message);
    } finally {
      this.isProcessing = false;
      this.setButtonLoading(false);
    }
  }

  async decryptPasswordWithCredential(encryptedData, credentialId) {
    // 使用 credentialId 派生 AES 密钥（与加密时相同的流程）
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      credentialId,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const salt = new TextEncoder().encode('LINUX_DO_CREDIT_SALT_V1');

    // 派生相同的 AES-GCM 密钥
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,  // 不可导出
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

  setButtonLoading(loading, text = null) {
    const payButton = document.getElementById('payButton');
    const buttonText = payButton.querySelector('.button-text');
    const spinner = document.getElementById('loadingSpinner');

    if (loading) {
      payButton.disabled = true;
      if (text) {
        buttonText.textContent = text;
      }
      buttonText.style.display = 'none';
      spinner.style.display = 'inline-block';
    } else {
      payButton.disabled = false;
      if (this.hasStoredPassword) {
        buttonText.textContent = '验证并支付';
      } else {
        buttonText.textContent = '确认支付';
      }
      buttonText.style.display = 'inline';
      spinner.style.display = 'none';
    }
  }

  showSuccess(data) {
    // 隐藏支付表单
    document.getElementById('paymentForm').style.display = 'none';
    document.getElementById('errorScreen').style.display = 'none';

    // 显示成功屏幕
    const successScreen = document.getElementById('successScreen');
    successScreen.style.display = 'flex';

    // 设置消息
    const messageEl = document.getElementById('successMessage');
    messageEl.textContent = `交易号: ${data.trade_no || '--'}`;

    // 检查重定向
    const redirectUrl = data.redirect_url || data.return_url;

    if (redirectUrl && !this.shouldIgnoreRedirect(redirectUrl)) {
      // 显示重定向选项
      this.redirectUrl = redirectUrl;
      document.getElementById('redirectSection').style.display = 'block';
      document.getElementById('closeSuccessBtn').style.display = 'none';

      // 3秒后自动跳转
      this.redirectTimer = setTimeout(() => {
        this.handleRedirect();
      }, 3000);
    } else {
      // 不需要重定向，显示完成按钮
      document.getElementById('redirectSection').style.display = 'none';
      document.getElementById('closeSuccessBtn').style.display = 'block';

      // 清除待支付状态
      chrome.runtime.sendMessage({ action: 'clearPendingPayment' });
    }

    // 播放成功动画
    setTimeout(() => {
      const checkmark = document.querySelector('.checkmark');
      checkmark.classList.add('animate');
    }, 100);
  }

  showError(message) {
    // 隐藏其他屏幕
    document.getElementById('paymentForm').style.display = 'none';
    document.getElementById('successScreen').style.display = 'none';

    // 显示错误屏幕
    const errorScreen = document.getElementById('errorScreen');
    errorScreen.style.display = 'flex';

    // 设置错误消息
    const messageEl = document.getElementById('errorMessage');
    messageEl.textContent = message;

    // 播放错误动画
    setTimeout(() => {
      const errorMark = document.querySelector('.error-mark');
      errorMark.classList.add('animate');
    }, 100);
  }

  showPaymentForm() {
    document.getElementById('paymentForm').style.display = 'block';
    document.getElementById('successScreen').style.display = 'none';
    document.getElementById('errorScreen').style.display = 'none';

    // 清空密码
    document.getElementById('payKey').value = '';
  }

  shouldIgnoreRedirect(url) {
    try {
      const urlObj = new URL(url);
      // 忽略 credit.linux.do/paying/* 的重定向
      return urlObj.hostname === 'credit.linux.do' && urlObj.pathname.startsWith('/paying');
    } catch {
      return false;
    }
  }

  handleRedirect() {
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer);
    }

    if (this.redirectUrl) {
      // 在新标签页打开
      chrome.runtime.sendMessage({
        action: 'openTab',
        data: { url: this.redirectUrl }
      });
    }

    // 清除待支付状态
    chrome.runtime.sendMessage({ action: 'clearPendingPayment' });

    // 关闭窗口
    this.closePayment();
  }

  skipRedirect() {
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer);
    }

    // 清除待支付状态
    chrome.runtime.sendMessage({ action: 'clearPendingPayment' });

    // 显示完成按钮
    document.getElementById('redirectSection').style.display = 'none';
    document.getElementById('closeSuccessBtn').style.display = 'block';
  }

  closePayment() {
    // 清除待支付状态
    chrome.runtime.sendMessage({ action: 'clearPendingPayment' });

    // 关闭窗口
    window.close();
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new PaymentWindow();
});
