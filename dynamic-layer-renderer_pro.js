// ======================
// 全域變數設定
// ======================
let currentDynamicLayer = null;
const API_BASE_URL = 'http://localhost:3001';

// ======================
// 讀取村里風險資料
// ======================
async function fetchVillageRiskData() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/all-villages-data`);
    if (!response.ok) throw new Error(`API失敗: ${response.status}`);
    const data = await response.json();
    return data;
  } catch (err) {
    console.error('獲取風險資料失敗', err);
    return [];
  }
}

// ======================
// 計算顏色工具函數
// ======================
function calculateColor(value, colorRamp) {
  const ratio = (value - colorRamp.min) / (colorRamp.max - colorRamp.min);
  const index = Math.min(Math.floor(ratio * (colorRamp.colors.length - 1)), colorRamp.colors.length - 2);
  const c1 = colorRamp.colors[index];
  const c2 = colorRamp.colors[index + 1];
  const t = (ratio * (colorRamp.colors.length - 1)) - index;
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
    (c1[3] + (c2[3] - c1[3]) * t)
  ];
}

// ======================
// 建立一般風險圖層
// ======================
async function createDynamicRiskLayer(riskData, mapView) {
  if (!riskData.length) throw new Error('風險資料為空');

  const colorRamp = {
    min: 0,
    max: 5,
    colors: [
      [255, 255, 255, 0.8],
      [255, 235, 214, 0.8],
      [255, 191, 128, 0.8],
      [255, 127, 80, 0.8],
      [180, 0, 0, 0.9]
    ]
  };

  function createDynamicRiskLayer(riskData, mapView) {
    return new Promise((resolve, reject) => {
      require(["esri/Graphic", "esri/layers/GraphicsLayer"], function(Graphic, GraphicsLayer) {
        try {
          const colorRamp = {
            min: 0,
            max: 5,
            colors: [
              [255, 255, 255, 0.8],
              [255, 235, 214, 0.8],
              [255, 191, 128, 0.8],
              [255, 127, 80, 0.8],
              [180, 0, 0, 0.9]
            ]
          };
    
          const graphics = riskData.map(v => new Graphic({
            geometry: getVillageGeometryById(v.id), // ✨改成從左側找 geometry
            attributes: v,
            symbol: {
              type: 'simple-fill',
              color: calculateColor(v.risk, colorRamp),
              outline: { color: [0, 0, 0, 0.4], width: 1 }
            },
            popupTemplate: {
              title: '{name}',
              content: '風險指數: {risk}'
            }
          }));
    
          const dynamicLayer = new GraphicsLayer({
            id: 'dynamicRiskLayer',
            title: '旱災風險地圖',
            graphics
          });
    
          mapView.map.add(dynamicLayer);
          currentDynamicLayer = dynamicLayer;
          resolve();
        } catch (error) {
          console.error('建立動態風險圖層失敗', error);
          reject(error);
        }
      });
    });
  }
  

  const graphics = riskData.map(v => new Graphic({
    geometry: getVillageGeometryById(v.id), // ✨改成從左側找 geometry
    attributes: v,
    symbol: {
      type: 'simple-fill',
      color: calculateColor(v.risk, colorRamp),
      outline: { color: [0, 0, 0, 0.4], width: 1 }
    },
    popupTemplate: {
      title: '{name}',
      content: '風險指數: {risk}'
    }
  }));

  const layer = new GraphicsLayer({
    id: 'dynamicRiskLayer',
    title: '旱災風險地圖',
    graphics
  });

  mapView.map.add(layer);
  currentDynamicLayer = layer;
}

// ======================
// 建立差異百分比圖層
// ======================
async function createDifferenceLayer(riskData, mapView) {
  if (!riskData.length) throw new Error('差異資料為空');

  const intervals = [
    { min: -Infinity, max: -30, color: [0, 180, 0, 0.8] },
    { min: -30, max: -15, color: [100, 220, 100, 0.8] },
    { min: -15, max: -5, color: [180, 255, 180, 0.8] },
    { min: -5, max: 5, color: [255, 255, 255, 0.8] },
    { min: 5, max: 15, color: [255, 191, 128, 0.8] },
    { min: 15, max: 30, color: [255, 127, 80, 0.8] },
    { min: 30, max: Infinity, color: [180, 0, 0, 0.9] }
  ];

  const [Graphic, GraphicsLayer] = await Promise.all([
    import("esri/Graphic"),
    import("esri/layers/GraphicsLayer")
  ]).then(modules => modules.map(m => m.default));

  const graphics = riskData.map(v => {
    const diffPercent = v.original_risk ? ((v.risk - v.original_risk) / v.original_risk) * 100 : 0;
    const matched = intervals.find(i => diffPercent >= i.min && diffPercent < i.max) || intervals[3];

    return new Graphic({
      geometry: getVillageGeometryById(v.id),
      attributes: { ...v, diffPercent },
      symbol: {
        type: 'simple-fill',
        color: matched.color,
        outline: { color: [0, 0, 0, 0.4], width: 1 }
      },
      popupTemplate: {
        title: '{name}',
        content: `風險變化: ${diffPercent.toFixed(2)}%`
      }
    });
  });

  const layer = new GraphicsLayer({
    id: 'dynamicRiskLayer',
    title: '風險變化百分比地圖',
    graphics
  });

  mapView.map.add(layer);
  currentDynamicLayer = layer;
}

async function calculateAllVillagesRisk() {
  const body = {};

  // 這些欄位是輸入原始數值的
  const originalFields = [
    'rainfall_0_3', 'evapotranspiration_0_3', 'delay_0_4',
    'water_life_0_4', 'water_industry_0_3', 'water_tourism_0_3',
    'Seawater_Desalination', 'Brackish_Water_Desalination',
    'Groundwater_Volume', 'Reservoir_Lake_Volume', 'original_sum',
    'Pump_Station', 'Water_Outages',
    'resident_population_0_4', 'industry_score_0_3', 'tourism_score_0_3',
    'Total_Budget', 'Disaster_Prevention_Budget'
  ];

  // 這些欄位是輸入標準化1-10分數的
  const scoreFields = [
    'surface_water_0_5', 'groundwater_0_5',
    'water_saving_0_2', 'resilient_community_0_3', 'emergency_water_0_3'
  ];

  // 處理原始數值欄位
  originalFields.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      const value = input.value.trim();
      body[id] = value === '' ? null : parseFloat(value);
    }
  });

  // 處理標準化分數欄位
  scoreFields.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      const value = input.value.trim();
      body[id] = value === '' ? null : parseInt(value, 10);
    }
  });

  console.log('🚀 準備送出的資料:', body);

  try {
    const response = await fetch(`${API_BASE_URL}/api/calculate-all-risks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    console.log('✅ 計算完成:', result);

    await updateAllRiskVisualization(view2);
    Swal.fire({
      icon: 'success',
      title: '全區風險計算完成',
      text: '地圖已自動更新！',
      confirmButtonColor: '#3085d6',
      confirmButtonText: '了解'
    });
  } catch (err) {
    console.error('❌ 計算失敗:', err);
    alert('計算失敗：' + err.message);
  }
}

// ======================
// 更新視覺化
// ======================
async function updateAllRiskVisualization(mapView) {
  if (currentDynamicLayer) {
    mapView.map.remove(currentDynamicLayer);
    currentDynamicLayer = null;
  }
  const riskData = await fetchVillageRiskData();
  await createDynamicRiskLayer(riskData, mapView);
}

// ======================
// 收合功能初始化
// ======================
document.addEventListener('DOMContentLoaded', function() {
  const headers = document.querySelectorAll('.parameter-group h4');
  headers.forEach(header => {
    header.addEventListener('click', function() {
      const group = this.parentElement;
      group.classList.toggle('collapsed');
      const controlsRow = group.querySelector('.risk-controls-row');
      if (controlsRow) {
        controlsRow.style.display = group.classList.contains('collapsed') ? 'none' : 'flex';
      }
    });
  });
});

// 根據id取得原本左側圖層的geometry
function getVillageGeometryById(id) {
  const leftLayer = window.view1.map.findLayerById('baseLayer');
  if (!leftLayer) return null;

  const feature = leftLayer.graphics.find(g => g.attributes.id === id);
  return feature ? feature.geometry : null;
}


// ======================
// 全域導出
// ======================
window.fetchVillageRiskData = fetchVillageRiskData;
window.updateAllRiskVisualization = updateAllRiskVisualization;
window.createDynamicRiskLayer = createDynamicRiskLayer;
window.createDifferenceLayer = createDifferenceLayer;
