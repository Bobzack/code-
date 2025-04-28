/*
 * dynamic-layer-renderer.js
 * 功能：支援主頁面安全調用、跨檔案互動 + 加入更新動畫提示
 * 說明：本檔案集中管理地圖視覺化、通知訊息、參數設定與風險計算等功能
 * 版本：MySQL兼容版 1.0
 */

// ====================
// === 全域變數宣告 ===
// ====================
let currentDynamicLayer = null;
const API_BASE_URL = 'http://localhost:3000'; // 可配置的API基礎URL

// =======================================
// === 樣式與視覺設定（DOM就緒時執行） ===
// =======================================
document.addEventListener("DOMContentLoaded", function () {
  const styleElement = document.createElement("style");
  styleElement.textContent = `
    .success-message {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 20px;
      background-color: #4CAF50;
      color: white;
      border-radius: 5px;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    .error-message {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 20px;
      background-color: #f44336;
      color: white;
      border-radius: 5px;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    .warning-message {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 20px;
      background-color: #ff9800;
      color: white;
      border-radius: 5px;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    .loading-indicator {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 20px 30px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      border-radius: 8px;
      z-index: 2000;
    }
    .map-update-animation {
      animation: flashBorder 1s ease-in-out;
      border-radius: 10px;
    }
    @keyframes flashBorder {
      0%   { box-shadow: 0 0 0px rgba(0, 255, 0, 0); }
      50%  { box-shadow: 0 0 15px rgba(0, 255, 0, 0.8); }
      100% { box-shadow: 0 0 0px rgba(0, 255, 0, 0); }
    }
  `;
  document.head.appendChild(styleElement);
});

// ============================
// === 通知與訊息相關函數區塊 ===
// ============================

/**
 * 顯示載入中訊息
 * @param {string} message 要顯示的訊息內容
 */
function showLoadingMessage(message) {
  // 先移除舊的
  hideLoadingMessage();
  
  const loadingDiv = document.createElement("div");
  loadingDiv.id = "loading-message";
  loadingDiv.className = "loading-indicator";
  loadingDiv.textContent = message || "處理中...";
  document.body.appendChild(loadingDiv);
}

/**
 * 隱藏載入中訊息
 */
function hideLoadingMessage() {
  const loadingDiv = document.getElementById("loading-message");
  if (loadingDiv) loadingDiv.remove();
}

/**
 * 顯示成功訊息
 * @param {string} message 要顯示的訊息內容
 */
function showSuccess(message) {
  const successDiv = document.createElement("div");
  successDiv.className = "success-message";
  successDiv.textContent = message;
  document.body.appendChild(successDiv);
  setTimeout(() => successDiv.remove(), 3000);
}

/**
 * 顯示錯誤訊息
 * @param {string} message 要顯示的訊息內容
 */
function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  setTimeout(() => errorDiv.remove(), 5000);
}

/**
 * 顯示警告訊息
 * @param {string} message 要顯示的訊息內容
 */
function showWarning(message) {
  // 創建一個新的 div 元素
  const warningDiv = document.createElement("div");
  
  // 設定 class (需搭配對應 CSS 設定動畫樣式)
  warningDiv.className = "warning-message animated-notification";
  
  // 設定 inline style (確保元素固定於螢幕右上角)
  warningDiv.style.position = "fixed";
  warningDiv.style.top = "20px";
  warningDiv.style.right = "20px";
  warningDiv.style.padding = "10px 20px";
  warningDiv.style.backgroundColor = "#ff9800";
  warningDiv.style.color = "white";
  warningDiv.style.borderRadius = "5px";
  warningDiv.style.zIndex = "1000";
  warningDiv.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.2)";
  
  // 注入帶有圖示與訊息內容的 HTML 結構
  warningDiv.innerHTML = `
    <div class="notification-icon warning-icon">⚠️</div>
    <div class="notification-content">${message}</div>
  `;
  
  // 將警告訊息加入網頁中
  document.body.appendChild(warningDiv);
  
  // 強制重新計算樣式，觸發 CSS 動畫
  void warningDiv.offsetWidth;
  warningDiv.classList.add("visible");
  
  // 4 秒後開始淡出並移除警告訊息
  setTimeout(() => {
    warningDiv.classList.remove("visible");
    warningDiv.classList.add("fade-out");
    
    // 延遲 300 毫秒等待淡出動畫完成後，再將元素從 DOM 中移除
    setTimeout(() => {
      if (warningDiv.parentNode) {
        warningDiv.remove();
      }
    }, 300);
  }, 4000);
}

// ============================
// === 資料獲取與處理函數區塊 ===
// ============================

/**
 * 從API獲取村里風險資料
 * @returns {Promise<Array>} 村里風險資料陣列
 */
function fetchVillageRiskData() {
  return fetch(`${API_BASE_URL}/api/all-villages-data`)
    .then(response => {
      if (!response.ok) throw new Error(`API 請求失敗: ${response.status} ${response.statusText}`);
      return response.json();
    })
    .then(data => {
      console.log(`獲取了 ${data.length} 筆村里風險數據`);
      // MySQL 返回的數據可能有 BIT/BOOLEAN 類型轉換問題，確保數據格式一致
      const processedData = data.map(village => ({
        ...village,
        risk: typeof village.risk === 'string'
        ? parseFloat(village.risk)
        : village.risk,
        // 確保 otherData 是一個對象，MySQL JSON數據需要解析
        otherData: typeof village.otherData === 'string' 
                 ? JSON.parse(village.otherData || '{}') 
                 : (village.otherData || {})
      }));
      return processedData;
    })
    .catch(err => {
      console.error('獲取村里風險數據失敗:', err);
      showError(`無法獲取風險數據: ${err.message}`);
      return [];
    });
}

/**
 * 根據風險值計算對應顏色
 * @param {number} value 風險值
 * @param {Object} colorRamp 顏色漸層配置
 * @returns {Array} RGBA顏色陣列
 */
function calculateColor(value, colorRamp) {
  const normalizedValue = Math.max(colorRamp.min, Math.min(colorRamp.max, value));
  const position = (normalizedValue - colorRamp.min) / (colorRamp.max - colorRamp.min);
  const segmentCount = colorRamp.colors.length - 1;
  const segment = Math.min(Math.floor(position * segmentCount), segmentCount - 1);
  const segmentPosition = (position * segmentCount) - segment;

  const color1 = colorRamp.colors[segment];
  const color2 = colorRamp.colors[segment + 1];
  return [
    Math.round(color1[0] + (color2[0] - color1[0]) * segmentPosition),
    Math.round(color1[1] + (color2[1] - color1[1]) * segmentPosition),
    Math.round(color1[2] + (color2[2] - color1[2]) * segmentPosition),
    color1[3] + (color2[3] - color1[3]) * segmentPosition
  ];
}

// ============================
// === 地圖視覺化相關函數區塊 ===
// ============================

/**
 * 觸發地圖更新動畫效果
 */
function triggerUpdateAnimation() {
  // 更彈性的地圖容器選擇
  const mapContainer = document.getElementById("rightMap") || 
                       document.getElementById("mapContainer2") || 
                       document.querySelector(".map-box:nth-child(2)");
  if (!mapContainer) return;
  mapContainer.classList.add("map-update-animation");
  setTimeout(() => {
    mapContainer.classList.remove("map-update-animation");
  }, 1000);
}

/**
 * 為地圖添加圖例
 * @param {Object} mapView 地圖視圖對象
 * @param {Object} colorRamp 顏色漸層配置
 */

/**
 * 創建動態風險圖層
 * @param {Array} riskData 風險數據陣列
 * @param {Object} mapView 地圖視圖對象
 * @returns {Promise<Object>} 創建的圖層對象
 */
function createDynamicRiskLayer(riskData, mapView) {
  console.log("開始建立動態風險圖層，資料筆數:", riskData ? riskData.length : 0);

  if (!riskData || riskData.length === 0) {
    console.error('風險數據為空');
    showError('無法獲取風險數據，請檢查數據來源');
    return Promise.reject(new Error('空的風險數據'));
  }

  // 找出基礎圖層：尋找類型為 "feature" 且 geometryType 為 "polygon" 的圖層
  const baseLayer = mapView.map.allLayers.find(layer => {
    console.log("檢查圖層:", layer);
    return layer.type === "feature" && 
           layer.geometryType === "polygon" && 
           (layer.title === "基礎旱災風險圖層" || layer.title === "澎湖縣村里風險圖");
  });

  if (!baseLayer) {
    console.error("找不到基礎村里圖層，嘗試重新初始化右側地圖");
    if (typeof window.initializeRightMap === "function") {
      window.initializeRightMap(); // ✅ 呼叫 HTML 中的全域初始化函數
    } else {
      console.warn("initializeRightMap 不存在，無法重新初始化地圖");
    }
  }

  // 🚨 數據驗證：判斷風險數據是否存在且非空
  if (!riskData || riskData.length === 0) {
    console.error('風險數據為空');
    showError('無法獲取風險數據，請檢查數據來源');
    return Promise.reject(new Error('空的風險數據'));
  }

  // 🔍 增強 ID 匹配策略：建立一個 Map 來儲存各種可能的 ID 鍵值對應同一筆資料
  const villageDataMap = new Map();
  riskData.forEach(village => {
    if (village.id) villageDataMap.set(String(village.id), village);
    if (village.esriId) villageDataMap.set(String(village.esriId), village);
    if (village.name) villageDataMap.set(village.name.trim().toLowerCase(), village);
    if (village.village) villageDataMap.set(village.village.trim().toLowerCase(), village);
  });

  // 等待底層完全載入（如果尚未載入），再查詢圖層幾何資料
  return baseLayer.when().then(() => {
    return baseLayer.queryFeatures({
      where: "1=1",
      returnGeometry: true,
      // 僅查詢必要欄位，以便未來擴充或排除問題
      outFields: ["*"]
    });
  }).then(function(result) {
    console.log(`查詢到 ${result.features.length} 個村里幾何資料`);

    // 🔬 數據質量驗證：檢查風險數據中缺少 id 或 risk 格式不正確的項目
    const invalidData = riskData.filter(village => 
      !village.id || typeof village.risk !== 'number' || isNaN(village.risk)
    );
    if (invalidData.length > 0) {
      console.warn(`發現 ${invalidData.length} 筆無效風險數據`, invalidData);
      showError(`存在 ${invalidData.length} 筆無效風險數據，部分地區可能無法顯示`);
    }

    // 依照所有風險資料計算最小與最大風險值
    let minRisk = 1.0, maxRisk = 0.0;
    riskData.forEach(village => {
      const risk = village.risk || 0;
      minRisk = Math.min(minRisk, risk);
      maxRisk = Math.max(maxRisk, risk);
    });
    // 若風險範圍過窄，人工調整上下限
    if (maxRisk - minRisk < 0.1) {
      minRisk = Math.max(0, minRisk - 0.1);
      maxRisk = Math.min(1, maxRisk + 0.1);
    }

    // 定義顏色變化配置：根據風險值不同，使用不同顏色展示
    const colorRamp = {
      min: minRisk,
      max: maxRisk,
      colors: [
        [255, 255, 255, 0.8],   // 極低風險 - 白色
        [255, 235, 214, 0.8],   // 低風險 - 淺橙色
        [255, 191, 128, 0.8],   // 中風險 - 中橙色
        [255, 127, 80, 0.8],    // 中高風險 - 深橙色
        [180, 0, 0, 0.9]        // 高風險 - 深紅色
      ]
    };

    // 建立圖形集合，用於儲存每個匹配到資料的 graphic
    const graphics = [];
    result.features.forEach(feature => {
      // 從 feature 屬性中嘗試取得不同可能的 ID 進行匹配
      const possibleIds = [
        feature.attributes.FID,
        feature.attributes["村里"],
        feature.attributes["Village"],
        feature.attributes["村里名稱"]
      ];
      
      const matchedVillage = possibleIds.reduce((found, id) => {
        if (!id) return found;
        return found || villageDataMap.get(String(id).trim().toLowerCase());
      }, null);
      

      if (matchedVillage) {
        const riskIndex = matchedVillage.risk || 0;
        const color = calculateColor(riskIndex, colorRamp); // 計算對應風險的顏色

        // 建立 esri.Graphic，並指定幾何資料、屬性、符號與 popup 資訊
        require(["esri/Graphic"], function(Graphic) {
          const graphic = new Graphic({
            geometry: feature.geometry,
            attributes: {
              id: matchedVillage.id,
              name: matchedVillage.name || "未命名村里",
              riskIndex: riskIndex
            },
            symbol: {
              type: "simple-fill",
              color: {
                r: color[0],
                g: color[1],
                b: color[2],
                a: color[3]
              },
              outline: {
                color: [0, 0, 0, 0.4],
                width: 1
              }
            },
            popupTemplate: {
              title: "{name}",
              content: [
                {
                  type: "fields",
                  fieldInfos: [
                    { fieldName: "name", label: "村里名稱" },
                    {
                      fieldName: "riskIndex",
                      label: "風險指數",
                      format: { digitSeparator: true, places: 4 }
                    }
                  ]
                }
              ]
            }
          });
              
          graphics.push(graphic);
        });        
      }
    });

    console.log(`建立了 ${graphics.length} 個動態圖形`);
    
    // 使用 require 引入 GraphicsLayer 並建立圖層
    return new Promise((resolve, reject) => {
      require(["esri/layers/GraphicsLayer"], function(GraphicsLayer) {
        const graphicsLayer = new GraphicsLayer({
          id: "dynamicRiskLayer",
          title: "旱災風險評估結果",
          graphics: graphics
        });

        // 加入圖例與其他視覺化輔助
        currentDynamicLayer = graphicsLayer;
        mapView.map.add(graphicsLayer);
        triggerUpdateAnimation();
        
        resolve(graphicsLayer);
      });
    });
  })
  .catch(function (error) {
    console.error("建立動態風險圖層時出錯:", error);
    showError("無法建立風險視覺化圖層: " + (error.message || error));
    throw error;
  });
}

/**
 * 更新所有風險視覺化
 */
function updateAllRiskVisualization() {
  console.log("更新右側地圖風險視覺化");
  
  // 顯示加載中訊息
  showLoadingMessage("正在獲取風險數據...");
  
  // 🔒 更彈性的地圖視圖查找
  const mapView = 
    window.view2 || 
    window.rightMapView || 
    (window.mapViews && window.mapViews.right) || 
    null;
  
  if (!mapView) {
    hideLoadingMessage();
    console.error('無法找到地圖視圖');
    showError('地圖初始化失敗，請重新載入頁面');
    return;
  }

  fetchVillageRiskData()
    .then(villagesData => {
      if (!villagesData || villagesData.length === 0) {
        hideLoadingMessage();
        showWarning("無風險數據可顯示");
        return null;
      }
      
      showLoadingMessage("正在生成風險圖層...");
      const dynamicLayerId = "dynamicRiskLayer";
      const existingLayer = mapView.map.findLayerById(dynamicLayerId);
      if (existingLayer) mapView.map.remove(existingLayer);
      return createDynamicRiskLayer(villagesData, mapView);
    })
    .then(layer => {
      hideLoadingMessage();
      if (layer) {
        showSuccess("風險圖層更新完成！");
        if (mapView.popup && typeof mapView.popup.close === 'function') {
          mapView.popup.close();
        }
      }
    })
    .catch(err => {
      hideLoadingMessage();
      console.error("更新風險視覺化失敗:", err);
      showError("無法更新風險視覺化: " + err.message);
    });
}

// =============================
// === 參數控制與風險計算區塊 ===
// =============================

/**
 * 重置所有參數到預設值
 */
function resetParameters() {
  const sliders = [
    { id: 'water-domestic', defaultValue: 1 },
    { id: 'water-tourism', defaultValue: 1 },
    { id: 'resident-population', defaultValue: 1 },
    { id: 'water-supply', defaultValue: 1 }
  ];

  sliders.forEach(({ id, defaultValue }) => {
    const slider = document.getElementById(id);
    const valueDisplay = document.getElementById(`${id}-value`);
    
    if (slider) {
      slider.value = defaultValue;
      if (valueDisplay) {
        valueDisplay.textContent = `${defaultValue * 100}%`;
      }
    }
  });

  // 清空下方計算結果區域
  const resultContainer = document.getElementById('calculation-result');
  if (resultContainer) {
    resultContainer.innerHTML = '';
    resultContainer.style.display = 'none';
  }
  showSuccess("所有參數已重置！");
}

/**
 * 檢查並恢復待處理的計算參數
 */
window.checkPendingCalculation = function() {
  // 檢查是否有待處理的計算
  const pendingCalc = sessionStorage.getItem('pendingCalculation');
  if (pendingCalc) {
    try {
      const params = JSON.parse(pendingCalc);
      console.log("發現待處理的計算請求，正在恢復參數", params);
      
      // 設置參數滑桿值
      if (params.waterDomestic) {
        document.getElementById('water-domestic').value = params.waterDomestic;
      }
      if (params.waterTourism) {
        document.getElementById('water-tourism').value = params.waterTourism;
      }
      if (params.population) {
        document.getElementById('resident-population').value = params.population;
      }
      if (params.waterSupply) {
        document.getElementById('water-supply').value = params.waterSupply;
      }
      
      // 顯示提示訊息
      showWarning("已恢復之前的計算參數，請再次點擊計算按鈕");
      
      // 清除待處理的計算參數
      sessionStorage.removeItem('pendingCalculation');
    } catch (e) {
      console.error("恢復計算參數時出錯", e);
      sessionStorage.removeItem('pendingCalculation');
    }
  }
  
  // 檢查是否從登入頁面重定向回來
  const redirected = sessionStorage.getItem('redirectAfterLogin');
  if (redirected) {
    console.log("檢測到從登入頁面重定向回來");
    sessionStorage.removeItem('redirectAfterLogin');
    showSuccess("登入成功，您現在可以繼續之前的操作");
  }
};

/**
 * 計算全區村里風險值
 * @param {Event} e 事件對象
 * @returns {boolean} false防止表單提交
 */
window.calculateAllVillagesRisk = function(e) {
  // 阻止表單提交和頁面刷新
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  const btn = document.getElementById('calculate-all-btn');
  const resultBox = document.getElementById('calculation-result');
  
  // 顯示加載動畫
  resultBox.style.display = 'block';
  resultBox.innerHTML = `
    <div class="calculation-loading">
      <div class="spinner" style="border:5px solid #f3f3f3; border-top:5px solid #3498db; border-radius:50%; width:40px; height:40px; margin:0 auto 20px; animation:spin 1.5s linear infinite;"></div>
      <p>正在計算全區旱災風險...</p>
      <p style="font-size:0.9em; color:#666;">這可能需要幾秒鐘時間</p>
    </div>
    <style>
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      .calculation-loading { text-align: center; padding: 20px; background-color: #f8f9fa; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    </style>
  `;
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 計算中...';
  btn.style.cursor = 'not-allowed';

  // 保存當前的URL以便在需要時重定向
  const currentUrl = window.location.href;
  
  // 添加驗證狀態檢查
  const checkAuth = () => {
    // 如果有登入表單可見，說明需要重新登入
    const loginForm = document.querySelector('form[action*="login"]') || 
                     document.getElementById('login-form') ||
                     document.querySelector('.login-container');
    
    if (loginForm) {
      console.log("檢測到登入表單，用戶需要重新登入");
      // 儲存當前計算參數到sessionStorage
      const params = {
        waterDomestic: parseFloat(document.getElementById('water-domestic').value),
        waterTourism: parseFloat(document.getElementById('water-tourism').value),
        population: parseFloat(document.getElementById('resident-population').value),
        waterSupply: parseFloat(document.getElementById('water-supply').value)
      };
      sessionStorage.setItem('pendingCalculation', JSON.stringify(params));
      
      // 顯示友好提示
      resultBox.innerHTML = `
        <div style="padding: 15px; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 5px; margin-bottom:<div style="padding: 15px; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 5px; margin-bottom: 15px;">
          <h3 style="margin-top: 0; color: #856404;">需要重新登入</h3>
          <p>您的會話已過期，請重新登入後再試。</p>
          <button id="stay-on-page-btn" class="btn btn-warning" style="margin-right: 10px; padding: 5px 10px; background-color: #ffc107; border: none; border-radius: 3px; cursor: pointer;">留在此頁面</button>
          <button id="proceed-to-login-btn" class="btn btn-primary" style="padding: 5px 10px; background-color: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">前往登入</button>
        </div>
      `;
      
      // 綁定按鈕事件
      document.getElementById('stay-on-page-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        resultBox.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> 計算全區風險';
      });
      
      document.getElementById('proceed-to-login-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        const loginUrl = document.querySelector('form[action*="login"]')?.action || 
                         '/login' ||
                         window.location.pathname;
        window.location.href = loginUrl + '?redirect=' + encodeURIComponent(currentUrl);
      });
      
      return false;
    }
    return true;
  };
  
  // 先檢查認證狀態
  if (!checkAuth()) {
    return;
  }

  const body = {
    waterDomestic: parseFloat(document.getElementById('water-domestic').value),
    waterTourism: parseFloat(document.getElementById('water-tourism').value),
    population: parseFloat(document.getElementById('resident-population').value),
    waterSupply: parseFloat(document.getElementById('water-supply').value)
  };
  
  console.log("送出參數:", body);
  
  const maxRetries = 3;
  let retryCount = 0;
  
  const attemptRequest = () => {
    fetch(`${API_BASE_URL}/api/calculate-all-risks`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'  // 增加防CSRF頭部
      },
      body: JSON.stringify(body),
      credentials: 'include'  // 確保包含身分驗證Cookie
    })
    .then(res => {
      if (res.status === 401 || res.status === 403) {
        // 身分驗證失敗的處理
        console.error('身分驗證失敗，需要重新登入');
        throw new Error('身分驗證已過期，請重新登入');
      }
      if (!res.ok) throw new Error(`伺服器錯誤：${res.status}`);
      return res.json();
    })
    .then(data => {
      console.log('✅ API 回傳:', data);
      resultBox.innerHTML = `
        <div style="padding: 20px; background-color: #e9f7ef; border: 1px solid #d4edda; border-radius: 5px;">
          ✅ 已重新計算 <strong>${data.count || 0}</strong> 筆村里風險值，地圖已更新。
        </div>`;
      
      // 更新視覺化
      if (typeof updateAllRiskVisualization === 'function') {
        updateAllRiskVisualization();
        // 當更新完成後顯示成功訊息
        showSuccess("風險指數已更新，地圖視覺化已重新計算");
      } else {
        console.error('找不到 updateAllRiskVisualization 函數');
        showWarning("風險指數已更新，但無法更新地圖視覺化");
      }
      
      // 清除任何暫存的計算請求
      sessionStorage.removeItem('pendingCalculation');
    })
    .catch(err => {
      console.error('❌ API 錯誤:', err);
      
      // 檢查是否為認證錯誤
      if (err.message.includes('身分驗證') || err.message.includes('登入')) {
        resultBox.innerHTML = `
          <div style="padding: 15px; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 5px; color: #856404;">
            <h3 style="margin-top: 0;">需要重新登入</h3>
            <p>${err.message}</p>
            <button id="retry-auth-btn" class="btn btn-warning" style="margin-right: 10px; padding: 5px 10px; background-color: #ffc107; border: none; border-radius: 3px; cursor: pointer;">重試</button>
            <button id="login-redirect-btn" class="btn btn-primary" style="padding: 5px 10px; background-color: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">登入頁面</button>
          </div>
        `;
        
        // 綁定按鈕事件
        document.getElementById('retry-auth-btn')?.addEventListener('click', (e) => {
          e.preventDefault();
          calculateAllVillagesRisk();
        });
        
        document.getElementById('login-redirect-btn')?.addEventListener('click', (e) => {
          e.preventDefault();
          sessionStorage.setItem('redirectAfterLogin', currentUrl);
          window.location.href = '/login';
        });
      } else {
        // 實現重試邏輯
        if (retryCount < maxRetries) {
          retryCount++;
          resultBox.innerHTML += `<p style="text-align:center; color:#856404;">連線失敗，正在重試... (${retryCount}/${maxRetries})</p>`;
          setTimeout(attemptRequest, 1000);
        } else {
          // 一般錯誤處理
          resultBox.innerHTML = `
            <div class="error-message">
              <h3><i class="fas fa-exclamation-circle"></i> 計算風險時出錯</h3>
              <p>${err.message}</p>
              <button id="retry-calc-btn" class="retry-btn">重新嘗試</button>
            </div>
            <style>
              .error-message { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 20px; border-radius: 5px; }
              .retry-btn { background-color: #dc3545; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; }
              .retry-btn:hover { background-color: #c82333; }
            </style>
          `;
          
          // 綁定重試按鈕
          document.getElementById('retry-calc-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            calculateAllVillagesRisk();
          });
        }
      }
    })
    .finally(() => {
      // 如果DOM仍然存在，則重設按鈕狀態
      if (document.body.contains(btn)) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> 計算全區風險';
        btn.style.cursor = 'pointer';
      }
    });
  };
  
  attemptRequest();
  
  return false; // 確保不會提交表單
};

// ==========================================
// === 將所有函數導出到全局，讓其他頁面能呼叫 ===
// ==========================================
window.createDynamicRiskLayer = createDynamicRiskLayer;
window.calculateColor = calculateColor;
window.addLegendToMap = addLegendToMap;
window.showLoadingMessage = showLoadingMessage;
window.hideLoadingMessage = hideLoadingMessage;
window.showSuccess = showSuccess;
window.showError = showError;
window.showWarning = showWarning;
window.triggerUpdateAnimation = triggerUpdateAnimation;
window.updateAllRiskVisualization = updateAllRiskVisualization;
window.resetParameters = resetParameters;
window.calculateAllVillagesRisk = calculateAllVillagesRisk;

/**
 * 創建差異百分比圖層
 * @param {Array} diffData 差異數據
 * @param {Object} mapView 地圖視圖
 * @returns {Promise} 創建的圖層
 */
window.createDifferenceLayer = function(diffData, mapView) {
  console.log("創建差異百分比圖層，資料筆數:", diffData ? diffData.length : 0);
  
  if (!diffData || diffData.length === 0) {
    console.error('差異數據為空');
    if (typeof window.showError === 'function') {
      window.showError('無法獲取差異數據');
    }
    return Promise.reject(new Error('空的差異數據'));
  }
  
  // 找出差異百分比的最大和最小值，用於顏色映射
  let minDiff = 0, maxDiff = 0;
  diffData.forEach(v => {
    const diff = parseFloat(v.diffPercent || 0);
    if (diff > 0) maxDiff = Math.max(maxDiff, diff);
    if (diff < 0) minDiff = Math.min(minDiff, diff);
  });
  
  // 確保有一個合理的範圍
  maxDiff = Math.max(10, maxDiff); // 至少 10% 的正向變化
  minDiff = Math.min(-10, minDiff); // 至少 -10% 的負向變化
  
  console.log(`差異百分比範圍: ${minDiff}% 到 ${maxDiff}%`);
  
  // 定義紅色系列（用於正值，風險增加）
  const positiveColors = [
    [255, 235, 214, 0.8], // 極微增加 (+0-5%)
    [255, 191, 128, 0.8], // 小幅增加 (+5-15%)
    [255, 127, 80, 0.8],  // 中度增加 (+15-30%)
    [180, 0, 0, 0.9]      // 大幅增加 (+30%以上)
  ];
  
  // 定義綠色系列（用於負值，風險減少）
  const negativeColors = [
    [235, 255, 235, 0.8], // 極微減少 (0 到 -5%)
    [180, 255, 180, 0.8], // 小幅減少 (-5 到 -15%)
    [100, 220, 100, 0.8], // 中度減少 (-15 到 -30%)
    [0, 180, 0, 0.9]      // 大幅減少 (-30%以下)
  ];
  
  // 差異百分比區間和對應的顏色
  const diffIntervals = [
    { min: -100, max: -30, color: negativeColors[3] }, // 大幅減少
    { min: -30, max: -15, color: negativeColors[2] },  // 中度減少
    { min: -15, max: -5, color: negativeColors[1] },   // 小幅減少
    { min: -5, max: 0, color: negativeColors[0] },     // 極微減少
    { min: 0, max: 5, color: positiveColors[0] },      // 極微增加
    { min: 5, max: 15, color: positiveColors[1] },     // 小幅增加
    { min: 15, max: 30, color: positiveColors[2] },    // 中度增加
    { min: 30, max: 100, color: positiveColors[3] }    // 大幅增加
  ];
  
  // 根據差異百分比獲取顏色
  function getColorByDiff(diffPercent) {
    for (const interval of diffIntervals) {
      if (diffPercent >= interval.min && diffPercent < interval.max) {
        return interval.color;
      }
    }
    return [128, 128, 128, 0.5]; // 默認灰色
  }
  
  // 查詢基礎圖層以獲取幾何數據
  return new Promise((resolve, reject) => {
    require(["esri/layers/GraphicsLayer"], function(GraphicsLayer) {
      const baseLayer = mapView.map.allLayers.find(layer => 
        layer.type === "feature" && layer.geometryType === "polygon"
      );
      
      if (!baseLayer) {
        console.error("找不到基礎村里圖層");
        reject(new Error("找不到基礎村里圖層"));
        return;
      }
      
      baseLayer.queryFeatures({
        where: "1=1",
        returnGeometry: true,
        outFields: ["*"]
      }).then(result => {
        console.log(`查詢到 ${result.features.length} 個村里幾何資料`);
        
        // 建立圖形集合
        const graphics = [];
        const idField = baseLayer.objectIdField || "OBJECTID";
        
        // 建立村里名稱到差異數據的映射
        const diffMap = new Map();
        diffData.forEach(v => {
          if (v.name) diffMap.set(v.name.trim().toLowerCase(), v);
        });
        
        // 為每個村里創建圖形
        result.features.forEach(feature => {
          const attributes = feature.attributes;
          const villageName = attributes["村里"] || attributes["Village"] || attributes["NAME"];
          
          if (!villageName) return;
          
          const matchedDiff = diffMap.get(villageName.trim().toLowerCase());
          if (matchedDiff) {
            const diffPercent = parseFloat(matchedDiff.diffPercent || 0);
            const color = getColorByDiff(diffPercent);
            
            require(["esri/Graphic"], function(Graphic) {
              console.log(`村里 ${villageName} - 風險變化: ${diffPercent.toFixed(2)}%`); // 除錯輸出
              
              const graphic = new Graphic({
                geometry: feature.geometry,
                attributes: {
                  id: matchedDiff.id || attributes[idField],
                  name: villageName,
                  diffPercent: diffPercent, // 存儲純數值，不添加百分比符號
                  originalRisk: parseFloat(matchedDiff.originalRisk || 0),
                  newRisk: parseFloat(matchedDiff.newRisk || 0)
                },
                symbol: {
                  type: "simple-fill",
                  color: {
                    r: color[0],
                    g: color[1],
                    b: color[2],
                    a: color[3]
                  },
                  outline: {
                    color: [0, 0, 0, 0.4],
                    width: 1
                  }
                },
                popupTemplate: {
                  title: "{name}",
                  content: function(feature) {
                    const attributes = feature.graphic.attributes;
                    const diffPercent = parseFloat(attributes.diffPercent);
                    const formattedDiff = (diffPercent >= 0 ? '+' : '') + diffPercent.toFixed(2) + '%';
                    const diffColor = diffPercent >= 0 ? '#d73027' : '#1a9850'; // 紅色表示增加，綠色表示減少
                    
                    return `
                      <div class="custom-popup">
                        <table class="data-table">
                          <tr>
                            <th>村里名稱</th>
                            <td>${attributes.name}</td>
                          </tr>
                          <tr>
                            <th>風險變化</th>
                            <td style="font-weight:bold; color:${diffColor};">${formattedDiff}</td>
                          </tr>
                          <tr>
                            <th>原始風險</th>
                            <td>${attributes.originalRisk.toFixed(4)}</td>
                          </tr>
                          <tr>
                            <th>更新風險</th>
                            <td>${attributes.newRisk.toFixed(4)}</td>
                          </tr>
                        </table>
                      </div>
                    `;
                  }
                }
              });
              
              graphics.push(graphic);
            });
          }
        });
        
        // 創建圖層並添加到地圖
        setTimeout(() => {
          const graphicsLayer = new GraphicsLayer({
            id: "dynamicRiskLayer",
            title: "風險變化百分比",
            graphics: graphics
          });
          
          // 添加圖例（差異百分比專用）
          addDiffLegendToMap(mapView, diffIntervals);
          
          // 添加圖層到地圖
          mapView.map.add(graphicsLayer);
          resolve(graphicsLayer);
        }, 100);
      }).catch(error => {
        console.error("查詢村里幾何資料失敗:", error);
        reject(error);
      });
    });
  });
};

/**
 * 添加差異百分比圖例
 * @param {Object} mapView 地圖視圖
 * @param {Array} diffIntervals 差異區間
 */
function addDiffLegendToMap(mapView, diffIntervals) {
  // 移除現有圖例
  const existingLegend = mapView.ui.find(item => item.id === "diff-legend");
  if (existingLegend) {
    mapView.ui.remove(existingLegend);
  }
  
  // 創建圖例容器
  const legendDiv = document.createElement("div");
  legendDiv.id = "diff-legend";
  legendDiv.className = "esri-widget esri-widget--panel";
  legendDiv.style.padding = "10px";
  legendDiv.style.backgroundColor = "white";
  legendDiv.style.maxWidth = "250px";
  
  // 圖例標題
  legendDiv.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 10px; font-size: 14px;">風險變化百分比</div>
    <div style="margin-bottom: 5px; font-size: 12px;">Change %</div>
  `;
  
  // 風險減少區間（綠色系列）
  const negativeIntervals = diffIntervals.filter(i => i.max <= 0);
  negativeIntervals.reverse().forEach(interval => {
    const color = interval.color;
    const label = `${interval.min}% 到 ${interval.max}%`;
    
    const itemDiv = document.createElement("div");
    itemDiv.style.display = "flex";
    itemDiv.style.alignItems = "center";
    itemDiv.style.marginBottom = "5px";
    
    const colorBox = document.createElement("div");
    colorBox.style.width = "20px";
    colorBox.style.height = "15px";
    colorBox.style.marginRight = "8px";
    colorBox.style.backgroundColor = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
    colorBox.style.border = "1px solid #000";
    
    const labelSpan = document.createElement("span");
    labelSpan.style.fontSize = "12px";
    labelSpan.textContent = label;
    
    itemDiv.appendChild(colorBox);
    itemDiv.appendChild(labelSpan);
    legendDiv.appendChild(itemDiv);
  });
  
  // 風險增加區間（紅色系列）
  const positiveIntervals = diffIntervals.filter(i => i.min >= 0);
  positiveIntervals.forEach(interval => {
    const color = interval.color;
    const label = `${interval.min}% 到 ${interval.max}%`;
    
    const itemDiv = document.createElement("div");
    itemDiv.style.display = "flex";
    itemDiv.style.alignItems = "center";
    itemDiv.style.marginBottom = "5px";
    
    const colorBox = document.createElement("div");
    colorBox.style.width = "20px";
    colorBox.style.height = "15px";
    colorBox.style.marginRight = "8px";
    colorBox.style.backgroundColor = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
    colorBox.style.border = "1px solid #000";
    
    const labelSpan = document.createElement("span");
    labelSpan.style.fontSize = "12px";
    labelSpan.textContent = label;
    
    itemDiv.appendChild(colorBox);
    itemDiv.appendChild(labelSpan);
    legendDiv.appendChild(itemDiv);
  });
  
  // 添加圖例到地圖
  mapView.ui.add(legendDiv, "bottom-right");
}

// 將新函數也導出到全局範圍
window.createDifferenceLayer = window.createDifferenceLayer;
window.addDiffLegendToMap = addDiffLegendToMap;