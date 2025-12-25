// Transfer Page JavaScript
class TransferPage {
  constructor() {
    this.transferData = null;
    this.isProcessing = false;
    this.hasStoredPassword = false;
    this.init();
  }

  async init() {
    await this.loadTransferData();
    await this.checkStoredPassword();
    this.setupEventListeners();
  }

  async loadTransferData() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getPendingTransfer' });

      if (response && response.username) {
        this.transferData = response;
        this.displayTransferInfo(response);
      } else {
        this.showError('无法加载转账信息');
      }
    } catch (error) {
      console.error('Failed to load transfer data:', error);
      this.showError('加载转账信息失败');
    }
  }

  displayTransferInfo(info) {
    // 显示用户名
    const usernameEl = document.getElementById('recipientUsername');
    if (usernameEl) {
      usernameEl.textContent = info.username;
    }

    // 显示用户ID（如果有）
    if (info.userId) {
      const userIdRow = document.getElementById('userIdRow');
      const userIdEl = document.getElementById('recipientUserId');
      if (userIdRow && userIdEl) {
        userIdEl.textContent = info.userId;
        userIdRow.style.display = 'flex';
      }
    }
  }

  setupEventListeners() {
    // 关闭按钮
    document.getElementById('closeBtn')?.addEventListener('click', () => {
      this.closeTransfer();
    });

    // 切换密码可见性
    document.getElementById('togglePassword')?.addEventListener('click', () => {
      this.togglePasswordVisibility();
    });

    // 转账按钮
    document.getElementById('transferButton')?.addEventListener('click', () => {
      this.processTransfer();
    });

    // 取消按钮
    document.getElementById('cancelButton')?.addEventListener('click', () => {
      this.closeTransfer();
    });

    // Enter 键转账
    document.getElementById('payKey')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.processTransfer();
      }
    });

    // 重试按钮
    document.getElementById('retryBtn')?.addEventListener('click', () => {
      this.showTransferForm();
    });

    // 关闭错误
    document.getElementById('closeErrorBtn')?.addEventListener('click', () => {
      this.closeTransfer();
    });

    // 完成按钮
    document.getElementById('closeSuccessBtn')?.addEventListener('click', () => {
      this.closeTransfer();
    });
  }

  async checkStoredPassword() {
    try {
      const { hasStoredPassword } = await chrome.storage.local.get('hasStoredPassword');

      this.hasStoredPassword = !!hasStoredPassword;

      if (hasStoredPassword) {
        // 隐藏密码输入，显示使用已保存密码的提示
        document.getElementById('transferPasswordSection').style.display = 'none';
        document.getElementById('transferAuthSection').style.display = 'block';
      } else {
        document.getElementById('transferPasswordSection').style.display = 'block';
        document.getElementById('transferAuthSection').style.display = 'none';
      }
    } catch (error) {
      console.error('Failed to check stored password:', error);
      this.hasStoredPassword = false;
    }
  }

  togglePasswordVisibility() {
    const input = document.getElementById('payKey');
    const btn = document.getElementById('togglePassword');

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
    if (this.isProcessing) return;

    // 获取表单数据
    const amount = parseFloat(document.getElementById('transferAmount')?.value);
    const remark = document.getElementById('transferRemark')?.value.trim() || '';

    // 验证输入
    if (!amount || amount <= 0) {
      this.showError('请输入有效的转账金额');
      return;
    }

    let payKey;

    // 如果保存了密码，使用 WebAuthn 验证并获取密码
    if (this.hasStoredPassword) {
      this.isProcessing = true;
      this.setButtonLoading(true, '验证身份中...');

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

      if (!/^\d{6}$/.test(payKey)) {
        this.showError('请输入6位数字支付密码');
        return;
      }

      this.isProcessing = true;
      this.setButtonLoading(true, '转账中...');
    }

    // 执行转账
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'processTransfer',
        data: {
          recipientUsername: this.transferData.username,
          recipientUserId: this.transferData.userId,
          amount: amount,
          payKey: payKey,
          remark: remark
        }
      });

      if (response && response.success) {
        this.showSuccess(response.data);
      } else {
        throw new Error(response?.error || '转账失败');
      }
    } catch (error) {
      this.showError(error.message || '转账失败');
    } finally {
      this.isProcessing = false;
      this.setButtonLoading(false);
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

  setButtonLoading(loading, text = null) {
    const transferButton = document.getElementById('transferButton');
    const buttonText = transferButton.querySelector('.button-text');
    const spinner = document.getElementById('loadingSpinner');

    if (loading) {
      transferButton.disabled = true;
      if (text) {
        buttonText.textContent = text;
      }
      buttonText.style.display = 'none';
      spinner.style.display = 'inline-block';
    } else {
      transferButton.disabled = false;
      buttonText.textContent = '确认转账';
      buttonText.style.display = 'inline';
      spinner.style.display = 'none';
    }
  }

  showSuccess(data) {
    // 隐藏转账表单
    document.getElementById('transferForm').style.display = 'none';
    document.getElementById('errorScreen').style.display = 'none';

    // 显示成功屏幕
    const successScreen = document.getElementById('successScreen');
    successScreen.style.display = 'flex';

    // 设置消息
    const messageEl = document.getElementById('successMessage');
    messageEl.textContent = `已成功向 ${this.transferData.username} 转账 LDC ${data.amount || ''}`;

    // 清除待转账状态
    chrome.runtime.sendMessage({ action: 'clearPendingTransfer' });

    // 播放成功动画
    setTimeout(() => {
      const checkmark = document.querySelector('.checkmark');
      checkmark.classList.add('animate');
    }, 100);
  }

  showError(message) {
    // 隐藏其他屏幕
    document.getElementById('transferForm').style.display = 'none';
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

  showTransferForm() {
    document.getElementById('transferForm').style.display = 'block';
    document.getElementById('successScreen').style.display = 'none';
    document.getElementById('errorScreen').style.display = 'none';

    // 清空密码
    if (!this.hasStoredPassword) {
      document.getElementById('payKey').value = '';
    }
  }

  closeTransfer() {
    // 清除待转账状态
    chrome.runtime.sendMessage({ action: 'clearPendingTransfer' });

    // 关闭窗口
    window.close();
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new TransferPage();
});
