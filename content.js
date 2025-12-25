// Content script for Linux DO Credit Chrome Extension

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, amount } = request;

  switch (action) {
    case 'createQuickPayment':
      createQuickPayment(amount);
      break;

    case 'injectPaymentButton':
      injectPaymentButton();
      break;

    case 'detectPaymentForms':
      detectPaymentForms();
      break;
  }
});

// ============================================
// Linux.do 用户页面转账按钮注入
// ============================================
function injectTransferButton() {
  // 检查是否在 Linux.do 用户页面
  if (!window.location.hostname.includes('linux.do')) return;
  if (!window.location.pathname.startsWith('/u/')) return;

  // 从 URL 中提取用户名
  const match = window.location.pathname.match(/^\/u\/([^\/]+)/);
  if (!match) return;

  const username = match[1];

  // 查找目标元素
  const targetSelector = '#main-outlet > div:nth-child(3) > section > section > div > div > section > ul';
  const targetElement = document.querySelector(targetSelector);

  if (!targetElement) {
    console.log('Transfer button target element not found');
    return;
  }

  // 检查是否已经注入
  if (document.getElementById('ldo-transfer-button')) {
    return;
  }

  // 创建转账按钮列表项
  const transferLi = document.createElement('li');
  transferLi.style.cssText = `
    margin-top: 8px;
    padding: 0;
  `;

  const transferButton = document.createElement('button');
  transferButton.id = 'ldo-transfer-button';
  transferButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 6px;">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
    向 ${username} 流转LDC
  `;
  transferButton.style.cssText = `
    width: 100%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 10px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s;
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
  `;

  // 添加悬停效果
  transferButton.addEventListener('mouseenter', () => {
    transferButton.style.transform = 'translateY(-1px)';
    transferButton.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.4)';
  });

  transferButton.addEventListener('mouseleave', () => {
    transferButton.style.transform = 'translateY(0)';
    transferButton.style.boxShadow = '0 2px 4px rgba(102, 126, 234, 0.3)';
  });

  // 点击事件
  transferButton.addEventListener('click', async () => {
    // 获取用户ID
    try {
      const response = await fetch(`https://linux.do/u/${username}.json`);
      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      const data = await response.json();
      const userId = data.user?.id;

      // 保存转账信息并打开转账页面
      chrome.runtime.sendMessage({
        action: 'openTransferPage',
        data: {
          username: username,
          userId: userId
        }
      });
    } catch (error) {
      console.error('Failed to get user ID:', error);
      // 即使获取ID失败，也可以只用用户名打开转账页面
      chrome.runtime.sendMessage({
        action: 'openTransferPage',
        data: {
          username: username,
          userId: null
        }
      });
    }
  });

  transferLi.appendChild(transferButton);
  targetElement.appendChild(transferLi);

  console.log(`Injected transfer button for user: ${username}`);
}

// 初始化时尝试注入
setTimeout(() => {
  injectTransferButton();
}, 1000);

// 监听页面变化（用于 SPA 路由变化）
const urlObserver = new MutationObserver(() => {
  setTimeout(() => {
    injectTransferButton();
  }, 500);
});

urlObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// ============================================
// 原有的支付相关功能
// ============================================

// Create quick payment from selected text
function createQuickPayment(amount) {
  const numericAmount = parseFloat(amount.replace(/[^\d.]/g, ''));

  if (isNaN(numericAmount) || numericAmount <= 0) {
    alert('Please select a valid amount (e.g., 10.00, $25, etc.)');
    return;
  }

  // Send to extension popup
  chrome.runtime.sendMessage({
    action: 'openQuickPayment',
    data: { amount: numericAmount }
  });
}

// Inject payment button into merchant pages
function injectPaymentButton() {
  // Find common payment elements
  const paymentSelectors = [
    '[data-payment]',
    '.checkout-button',
    '.pay-button',
    '.payment-button',
    '[class*="pay"]',
    '[id*="pay"]'
  ];

  let paymentElement = null;
  for (const selector of paymentSelectors) {
    paymentElement = document.querySelector(selector);
    if (paymentElement) break;
  }

  if (paymentElement && !document.getElementById('ldo-credit-button')) {
    const ldoButton = document.createElement('button');
    ldoButton.id = 'ldo-credit-button';
    ldoButton.textContent = 'Pay with LINUX DO Credit';
    ldoButton.style.cssText = `
      background: #0066cc;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      margin: 5px;
    `;

    ldoButton.addEventListener('click', handlePaymentClick);
    paymentElement.parentNode.insertBefore(ldoButton, paymentElement.nextSibling);
  }
}

// Handle payment button click
function handlePaymentClick() {
  // Get product name
  const productName = document.querySelector('h1, .product-title, [data-product-name]')?.textContent ||
                     document.title ||
                     'Unknown Product';

  // Get amount
  const amountElements = [
    document.querySelector('[data-price]'),
    document.querySelector('.price'),
    document.querySelector('[class*="price"]'),
    document.querySelector('[id*="price"]')
  ];

  let amount = '';
  for (const element of amountElements) {
    if (element) {
      amount = element.textContent.replace(/[^\d.]/g, '');
      break;
    }
  }

  // Send payment info to extension
  chrome.runtime.sendMessage({
    action: 'createPaymentFromPage',
    data: {
      productName,
      amount,
      url: window.location.href
    }
  });
}

// Auto-detect payment forms
function detectPaymentForms() {
  const forms = document.querySelectorAll('form');
  const paymentForms = [];

  forms.forEach(form => {
    const hasPaymentKeywords = form.innerHTML.match(/pay|payment|checkout|order/i);
    const hasPrice = form.innerHTML.match(/\$|\d+\.\d{2}/);

    if (hasPaymentKeywords && hasPrice) {
      paymentForms.push(form);
      // Add LDO Credit option
      addLDOCreditOption(form);
    }
  });

  return paymentForms;
}

// Add LDO Credit option to existing forms
function addLDOCreditOption(form) {
  const paymentMethods = form.querySelectorAll('[name="payment_method"]');

  if (paymentMethods.length > 0) {
    const lastMethod = paymentMethods[paymentMethods.length - 1];
    const ldoOption = document.createElement('div');
    ldoOption.innerHTML = `
      <label>
        <input type="radio" name="payment_method" value="ldo_credit">
        <span>PAY WITH LINUX DO CREDIT</span>
      </label>
    `;
    lastMethod.parentNode.parentNode.appendChild(ldoOption);

    // Handle form submission
    form.addEventListener('submit', (e) => {
      const selectedMethod = form.querySelector('[name="payment_method"]:checked');
      if (selectedMethod && selectedMethod.value === 'ldo_credit') {
        e.preventDefault();
        handleLDOFormSubmission(form);
      }
    });
  }
}

// Handle LDO Credit form submission
function handleLDOFormSubmission(form) {
  const formData = new FormData(form);
  const data = {};

  for (let [key, value] of formData.entries()) {
    data[key] = value;
  }

  // Extract payment info
  const amount = data.amount ||
               form.querySelector('[name="amount"]')?.value ||
               form.querySelector('.price')?.textContent.replace(/[^\d.]/g, '');

  const productName = data.product_name ||
                    form.querySelector('[name="product_name"]')?.value ||
                    document.title;

  // Send to extension
  chrome.runtime.sendMessage({
    action: 'createPaymentFromForm',
    data: {
      amount,
      productName,
      formData: data
    }
  });
}

// Monitor page changes for AJAX-loaded content
const observer = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      // Re-check for payment elements
      setTimeout(() => {
        detectPaymentForms();
        injectPaymentButton();
      }, 1000);
    }
  });
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Detect payment forms on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    detectPaymentForms();
    injectPaymentButton();
  });
} else {
  detectPaymentForms();
  injectPaymentButton();
}

// Handle messages from popup
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data.type && event.data.type === 'FROM_EXTENSION') {
    switch (event.data.action) {
      case 'PAYMENT_SUCCESS':
        showPaymentSuccess(event.data.data);
        break;

      case 'PAYMENT_FAILED':
        showPaymentFailed(event.data.data);
        break;
    }
  }
});

function showPaymentSuccess(data) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    z-index: 10000;
    font-family: Arial, sans-serif;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
  `;
  notification.textContent = `Payment successful: ${data.amount} ${data.currency}`;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 5000);
}

function showPaymentFailed(data) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #f44336;
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    z-index: 10000;
    font-family: Arial, sans-serif;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
  `;
  notification.textContent = `Payment failed: ${data.error}`;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 5000);
}