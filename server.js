// ✅ 重新整理後的 server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');                                         // 新增：呼叫 LM Studio 用
const LM_API_URL = 'http://10.114.5.51:1234/v1/chat/completions';         // 新增：LM Studio Chat API 端點
const mysql = require('mysql2/promise');

const app = express();
const port = 3000;

// ✅ 原始資料庫 drought_risk_db
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'bob33715791',
  database: 'drought_risk_db',
  waitForConnections: true,
  connectionLimit: 20,
});

// ✅ 結果資料庫 drought_risk_results
const resultPool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'bob33715791',
  database: 'drought_risk_results',
  waitForConnections: true,
  connectionLimit: 10,
});
  
app.use(cors());
app.use(bodyParser.json());

// ✅ 驗證資料庫連線
async function checkDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ 成功連接 drought_risk_db');
    connection.release();

    const resultConn = await resultPool.getConnection();
    console.log('✅ 成功連接 drought_risk_results');
    resultConn.release();
    return true;
  } catch (err) {
    console.error('❌ 資料庫連線失敗:', err.message);
    return false;
  }
}

// ✅ 核心 API：依使用者倍率重算風險並寫入新表
app.post('/api/calculate-all-risks', async (req, res) => {
  // 從請求中解析所有階段的所有參數，每個都設置默認值為 1.0
  const { 
    // 發生階段參數
    rainfall = 1.0, 
    evapotranspiration = 1.0, 
    delay = 1.0,
    
    // 預防階段參數
    surfaceWater = 1.0, 
    groundwater = 1.0,
    
    // 耗用階段參數
    waterDomestic = 1.0, 
    waterIndustry = 1.0, 
    waterTourism = 1.0,
    
    // 供給階段參數
    waterSupply = 1.0, 
    improvement = 1.0, 
    waterSaving = 1.0,
    
    // 脆弱階段參數
    population = 1.0, 
    industryScore = 1.0, 
    tourismScore = 1.0,
    
    // 強化階段參數
    disasterFund = 1.0, 
    resilientCommunity = 1.0, 
    emergencyWater = 1.0
  } = req.body;

  try {
    // 清空結果資料表，避免風險值累積
    await resultPool.query('TRUNCATE TABLE villages');
    
    // 先獲取原始數據
    const [originRows] = await pool.query('SELECT * FROM villages');
    
    // 儲存原始風險值用於比較
    const originalRisks = {};
    for (const row of originRows) {
      const get = (key, factor = 1) => parseFloat(row[key] || 0) * factor;
      
      // 計算原始風險（不套用任何倍率）
      const origOccur = get('rainfall_0_3', 0.3) + get('evapotranspiration_0_3', 0.3) + get('delay_0_4', 0.4);
      const origPrevent = get('surface_water_0_5', 0.5) + get('groundwater_0_5', 0.5);
      const origPhase1 = Math.max(origOccur - origPrevent, 1);

      const origLifeRaw = parseFloat(row.lifeRaw || 0);
      const origTourismRaw = parseFloat(row.tourismRaw || 0);
      const origPopRaw = parseFloat(row.popRaw || 0);
      const origSupplyRaw = parseFloat(row.supplyRaw || 0);

      const origLifeScore = Math.min(Math.max(origLifeRaw / 1_000_000, 0), 1) * 10 * 0.4;
      const origTourismScore = Math.min(Math.max(origTourismRaw / 80_000, 0), 1) * 10 * 0.3;
      const origPopScore = Math.min(Math.max(origPopRaw / 6_000, 0), 1) * 10 * 0.4;
      const origUsedScore = origLifeScore + origTourismScore + origPopScore;

      const origSupplyScore = Math.min(Math.max(origSupplyRaw / 1_000_000, 0), 1) * 10 * 0.6
                           + parseFloat(row.improvement_0_2 || 0) * 0.2
                           + parseFloat(row.water_saving_0_2 || 0) * 0.2;

      const origPhase2 = Math.max(origUsedScore - origSupplyScore, 0.01);

      const origVulnerable = get('resident_population_0_4', 0.4) + get('industry_score_0_3', 0.3) + get('tourism_score_0_3', 0.3);
      const origReinforce = get('disaster_fund_0_4', 0.4) + get('resilient_community_0_3', 0.3) + get('emergency_water_0_3', 0.3);
      const origPhase3 = Math.max(origVulnerable - origReinforce, 1);

      const origRisk = Math.cbrt(origPhase1 * origPhase2 * origPhase3);
      originalRisks[row.id] = parseFloat(origRisk.toFixed(4));
    }
    
    // 使用修改後的參數重新計算風險值
    const insertPromises = [];
    for (const row of originRows) {
      const get = (key, baseFactor = 1, multiplier = 1) => parseFloat(row[key] || 0) * baseFactor * multiplier;

      // 發生階段：套用前端傳來的倍率
      const occur = get('rainfall_0_3', 0.3, rainfall) + 
                   get('evapotranspiration_0_3', 0.3, evapotranspiration) + 
                   get('delay_0_4', 0.4, delay);
      
      // 預防階段：套用前端傳來的倍率
      const prevent = get('surface_water_0_5', 0.5, surfaceWater) + 
                     get('groundwater_0_5', 0.5, groundwater);
      
      const phase1 = Math.max(occur - prevent, 1);

      // 耗用階段：套用前端傳來的倍率
      const lifeRaw = parseFloat(row.lifeRaw || 0) * waterDomestic;
      const tourismRaw = parseFloat(row.tourismRaw || 0) * waterTourism;
      const popRaw = parseFloat(row.popRaw || 0) * population;
      const industryRaw = parseFloat(row.industryRaw || 0) * waterIndustry;

      // 將原始值正規化並計算分數
      const lifeScore = Math.min(Math.max(lifeRaw / 1_000_000, 0), 1) * 10 * 0.4;
      const tourismScore = Math.min(Math.max(tourismRaw / 80_000, 0), 1) * 10 * 0.3;
      const industryScore = Math.min(Math.max(industryRaw / 640_000, 0), 1) * 10 * 0.3;
      const popScore = Math.min(Math.max(popRaw / 6_000, 0), 1) * 10 * 0.4;
      
      const usedScore = lifeScore + tourismScore + industryScore;

      // 供給階段：套用前端傳來的倍率
      const supplyRaw = parseFloat(row.supplyRaw || 0) * waterSupply;
      const improvementValue = parseFloat(row.improvement_0_2 || 0) * improvement;
      const waterSavingValue = parseFloat(row.water_saving_0_2 || 0) * waterSaving;
      
      const supplyScore = Math.min(Math.max(supplyRaw / 1_000_000, 0), 1) * 10 * 0.6
                        + improvementValue * 0.2
                        + waterSavingValue * 0.2;

      const phase2 = Math.max(usedScore - supplyScore, 0.01);

      // 脆弱階段：套用前端傳來的倍率
      const vulnerable = get('resident_population_0_4', 0.4, population)
                       + get('industry_score_0_3', 0.3, industryScore)
                       + get('tourism_score_0_3', 0.3, tourismScore);

      // 強化階段：套用前端傳來的倍率
      const reinforce = get('disaster_fund_0_4', 0.4, disasterFund)
                      + get('resilient_community_0_3', 0.3, resilientCommunity)
                      + get('emergency_water_0_3', 0.3, emergencyWater);
      
      const phase3 = Math.max(vulnerable - reinforce, 1);

      // 計算最終風險值
      const risk = Math.cbrt(phase1 * phase2 * phase3);
      const riskValue = parseFloat(risk.toFixed(4));
      
      // 計算與原始風險的差異比例
      const originalRisk = originalRisks[row.id] || 0;
      const diffRatio = (riskValue - originalRisk) / (originalRisk || 1);

      // 構建 SQL 插入值
      const values = [
        row.id, // 村里ID
        row.village, // 村里名稱
        
        // 所有參數值（經倍率調整後）
        get('rainfall_0_3', 1, rainfall),
        get('evapotranspiration_0_3', 1, evapotranspiration),
        get('delay_0_4', 1, delay),
        get('surface_water_0_5', 1, surfaceWater),
        get('groundwater_0_5', 1, groundwater),
        get('water_life_0_4', 1, waterDomestic),
        get('water_industry_0_3', 1, waterIndustry),
        get('water_tourism_0_3', 1, waterTourism),
        get('water_supply_0_6', 1, waterSupply),
        get('improvement_0_2', 1, improvement),
        get('water_saving_0_2', 1, waterSaving),
        get('resident_population_0_4', 1, population),
        get('industry_score_0_3', 1, industryScore),
        get('tourism_score_0_3', 1, tourismScore),
        get('disaster_fund_0_4', 1, disasterFund),
        get('resilient_community_0_3', 1, resilientCommunity),
        get('emergency_water_0_3', 1, emergencyWater),
        
        // 最終計算結果
        riskValue,
        originalRisk,
        diffRatio.toFixed(4)
      ];

      // 構建 SQL 語句
      const sql = `
        INSERT INTO villages (
          id, village, 
          rainfall_0_3, evapotranspiration_0_3, delay_0_4,
          surface_water_0_5, groundwater_0_5, 
          water_life_0_4, water_industry_0_3, water_tourism_0_3,
          water_supply_0_6, improvement_0_2, water_saving_0_2,
          resident_population_0_4, industry_score_0_3, tourism_score_0_3,
          disaster_fund_0_4, resilient_community_0_3, emergency_water_0_3,
          risk, original_risk, diff_ratio
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          village = VALUES(village),
          rainfall_0_3 = VALUES(rainfall_0_3),
          evapotranspiration_0_3 = VALUES(evapotranspiration_0_3),
          delay_0_4 = VALUES(delay_0_4),
          surface_water_0_5 = VALUES(surface_water_0_5),
          groundwater_0_5 = VALUES(groundwater_0_5),
          water_life_0_4 = VALUES(water_life_0_4),
          water_industry_0_3 = VALUES(water_industry_0_3),
          water_tourism_0_3 = VALUES(water_tourism_0_3),
          water_supply_0_6 = VALUES(water_supply_0_6),
          improvement_0_2 = VALUES(improvement_0_2),
          water_saving_0_2 = VALUES(water_saving_0_2),
          resident_population_0_4 = VALUES(resident_population_0_4),
          industry_score_0_3 = VALUES(industry_score_0_3),
          tourism_score_0_3 = VALUES(tourism_score_0_3),
          disaster_fund_0_4 = VALUES(disaster_fund_0_4),
          resilient_community_0_3 = VALUES(resilient_community_0_3),
          emergency_water_0_3 = VALUES(emergency_water_0_3),
          risk = VALUES(risk),
          original_risk = VALUES(original_risk),
          diff_ratio = VALUES(diff_ratio)
      `;

      insertPromises.push(resultPool.query(sql, values));
    }

    // 執行所有插入操作
    await Promise.all(insertPromises);

    // 返回操作結果
    res.json({
      message: '✅ 已根據所有參數倍率重新計算風險值',
      updatedCount: insertPromises.length,
      appliedFactors: {
        rainfall, evapotranspiration, delay,
        surfaceWater, groundwater,
        waterDomestic, waterIndustry, waterTourism,
        waterSupply, improvement, waterSaving,
        population, industryScore, tourismScore,
        disasterFund, resilientCommunity, emergencyWater
      }
    });
  } catch (err) {
    console.error('❌ 計算錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤', details: err.message });
  }
});


// ✅ 提供最新風險圖層資料給前端
app.get('/api/all-villages-data', async (req, res) => {
  try {
    const [rows] = await resultPool.query(
      'SELECT id, village AS name, risk, (risk - original_risk) / NULLIF(original_risk, 0) AS diff_ratio FROM villages'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '讀取失敗', details: err.message });
  }
});

// ✅ 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.listen(port, async () => {
  const ok = await checkDatabaseConnection();
  if (!ok) process.exit(1);
  console.log(`🚀 Server running at http://localhost:${port}`);
});

// 🔥 本地大模型分析端點 - 新版本支援詳細分析與建議
app.get('/api/local-ai-analysis', async (req, res) => {
  try {
    // 1. 查詢資料 - 使用單一查詢獲取統計數據和前 10 個村里
    const [queryResults] = await resultPool.query(`
      SELECT
        v.id,
        v.village AS name, 
        v.risk AS droughtIndex,
        v.original_risk AS originalRisk,
        v.diff_ratio AS riskChange,
        v.rainfall_0_3 AS rainfall,
        v.evapotranspiration_0_3 AS evapotranspiration,
        v.delay_0_4 AS droughtDelay,
        v.surface_water_0_5 AS surfaceWater,
        v.groundwater_0_5 AS groundwater,
        v.water_life_0_4 AS lifeWaterUsage,
        v.water_industry_0_3 AS industryWaterUsage,
        v.water_tourism_0_3 AS tourismWaterUsage,
        v.water_supply_0_6 AS waterSupply,
        v.improvement_0_2 AS improvement,
        v.water_saving_0_2 AS waterSaving,
        v.resident_population_0_4 AS population,
        v.industry_score_0_3 AS industryScore,
        v.tourism_score_0_3 AS tourismScore,
        v.disaster_fund_0_4 AS disasterFund,
        v.resilient_community_0_3 AS resilience,
        v.emergency_water_0_3 AS emergencyWater,
        CASE 
          WHEN v.risk >= 4.5 THEN '極高風險'
          WHEN v.risk >= 3.5 THEN '高風險'
          WHEN v.risk >= 2.5 THEN '中風險'
          WHEN v.risk >= 1.5 THEN '低風險'
          ELSE '極低風險'
        END AS riskLevel
      FROM villages v 
      ORDER BY v.risk DESC 
      LIMIT 10
    `);
    // 2. 單獨查詢統計資訊
    const [statsResults] = await resultPool.query(`
      SELECT 
        COUNT(*) AS totalVillages,
        AVG(risk) AS avgRisk,
        MAX(risk) AS maxRisk,
        MIN(risk) AS minRisk
      FROM villages
    `);
    
    // 3. 提取統計資訊
    const stats = {
      totalVillages: statsResults[0].totalVillages,
      avgRisk: statsResults[0].avgRisk.toFixed(4),
      maxRisk: statsResults[0].maxRisk.toFixed(4),
      minRisk: statsResults[0].minRisk.toFixed(4)
    };
    
    // 4. 處理村里數據
    const topVillages = queryResults.slice(0, 5);
    // 重要：定義 allVillages 以防止錯誤
    const allVillages = queryResults;
    
    // 5. 構建 AI 請求提示詞
    const systemPrompt = `你是一位資深水資源與旱災風險管理專家。請根據提供的澎湖縣村里數據，提供以下分析：

    0. 開場說明：首先描述本次分析基於的參數調整（所有六個階段的參數）及其對旱災風險的整體影響。說明這次分析是如何反映特定參數設定下的風險情況，並簡述調整這些參數對整體風險分布的影響。
    
    1. 風險排名：列出風險值最高的5個村里，並對應顯示其風險值和風險等級（極高風險：4.5-5.0、高風險：3.5-4.5、中風險：2.5-3.5、低風險：1.5-2.5、極低風險：0-1.5）。對每個村里，簡要分析風險值變化（相比原始值）的幅度和原因。
    
    2. 詳細分析：針對每個風險最高的村里進行全方位分析，包含以下六個階段的所有指標：
       - 發生階段：降雨量(rainfall)、蒸發量(evapotranspiration)、乾旱延時(droughtDelay)
       - 預防階段：地面水(surfaceWater)、地下水(groundwater)
       - 耗用階段：民生用水(lifeWaterUsage)、工業用水(industryWaterUsage)、觀光用水(tourismWaterUsage)
       - 供給階段：各類供水量(waterSupply)、改善措施(improvement)、節水措施(waterSaving)
       - 脆弱階段：常住人口(population)、產業產值(industryScore)、觀光產值(tourismScore)
       - 強化階段：災防預備金(disasterFund)、韌性社區(resilience)、緊急水源(emergencyWater)
    
       分析時必須明確引用數據提供的具體數值，例如:
       - 常住人口: [具體數值]，表明人口密度[高/中/低]
       - 各階段分數: 說明哪些階段分數較高，是風險的主要來源
       - 風險變化: 與原始風險相比增加了[X]%，主要受[哪些參數]影響
    
    3. 改善建議：每個村里至少提供3項對應不同階段的高度個性化建議，針對該村里的特定風險因素。例如：
       - 發生階段：若降雨量少，可建議增加集水設施
       - 預防階段：若地下水資源缺乏，可建議開發替代水源
       - 耗用階段：若觀光用水過高，可建議調整觀光產業結構
       - 供給階段：若供水量不足，可建議增加基礎設施投資
       - 脆弱階段：若人口密集，可建議分散人口或產業
       - 強化階段：若緊急水源不足，可建議建立應急水庫
    
    注意事項：
    - 必須使用繁體中文回覆
    - 直接使用文字標題，不要使用 #、### 等標記符號
    - 每個村里的分析必須基於其獨特的數據，避免內容重複，高亮村里間的差異
    - 分析必須數據驅動，明確引用每個數值並提供深入解讀
    - 提供的建議必須具體、可行，針對每個村里的獨特風險因素
    - 所有分析和建議必須直接針對旱災風險管理，不要偏離主題`;
    
// 優化後的 userPrompt
const userPrompt = `以下是澎湖縣村里的旱災風險數據：

【前五名高風險村里詳細數據】
${JSON.stringify(topVillages.map(v => ({
  村里名稱: v.name,
  風險指數: parseFloat(v.droughtIndex).toFixed(4),
  風險等級: v.riskLevel,
  原始風險: parseFloat(v.originalRisk).toFixed(4),
  風險變化比例: (parseFloat(v.riskChange) * 100).toFixed(2) + '%',
  
  // 發生階段參數
  降雨量: parseFloat(v.rainfall).toFixed(2),
  蒸發量: parseFloat(v.evapotranspiration).toFixed(2),
  乾旱延時: parseFloat(v.droughtDelay).toFixed(2),
  
  // 預防階段參數
  地面水: parseFloat(v.surfaceWater).toFixed(2),
  地下水: parseFloat(v.groundwater).toFixed(2),
  
  // 耗用階段參數
  民生用水: parseFloat(v.lifeWaterUsage).toFixed(2),
  工業用水: parseFloat(v.industryWaterUsage).toFixed(2),
  觀光用水: parseFloat(v.tourismWaterUsage).toFixed(2),
  
  // 供給階段參數
  供水量: parseFloat(v.waterSupply).toFixed(2),
  改善措施: parseFloat(v.improvement).toFixed(2),
  節水措施: parseFloat(v.waterSaving).toFixed(2),
  
  // 脆弱階段參數
  常住人口: parseFloat(v.population).toFixed(2),
  產業產值: parseFloat(v.industryScore).toFixed(2),
  觀光產值: parseFloat(v.tourismScore).toFixed(2),
  
  // 強化階段參數
  災防預備金: parseFloat(v.disasterFund).toFixed(2),
  韌性社區: parseFloat(v.resilience).toFixed(2),
  緊急水源: parseFloat(v.emergencyWater).toFixed(2)
})), null, 2)}

【所有村里風險統計數據】
總村里數: ${stats.totalVillages}
平均風險指數: ${stats.avgRisk}
最高風險值: ${stats.maxRisk} (${queryResults[0].riskLevel})
最低風險值: ${stats.minRisk}

請根據上述數據，以繁體中文提供完整的旱災風險分析，包含三部分：
1. 風險排名：對前五名高風險村里按風險等級進行排名，並說明風險變化情況
2. 詳細分析：針對每個高風險村里的六個階段參數進行詳細分析
3. 改善建議：為每個村里提供至少3項針對性的風險減緩建議

每個村里的分析和建議必須基於其獨特的數據模式，避免重複內容。要充分利用所有提供的數據欄位，不要遺漏任何關鍵資訊。`;
    
    // 6. 呼叫 LM Studio API - 使用 prompt 欄位（修正版，加入 stop: null）
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const lmResponse = await axios.post('http://192.168.0.227:1234/v1/completions', {
      model: "gemma-3-12b-it-qat",
      prompt: fullPrompt,
      temperature: 0.5,
      max_tokens: 4096,
      stop: null
    });
    
    // 7. 處理 AI 回應 - 添加安全檢查（修正版，改為 choices[0].text）
    let aiAnalysis = "";
    if (lmResponse && lmResponse.data && lmResponse.data.choices && 
        lmResponse.data.choices.length > 0 && lmResponse.data.choices[0].text) {
      aiAnalysis = lmResponse.data.choices[0].text || "";
    } else {
      console.warn("LM Studio 回應格式異常:", JSON.stringify(lmResponse.data));
      aiAnalysis = "AI 分析未能獲取有效內容，請稍後再試。";
    }
    
    // 8. 回傳結果
    res.json({
      dataCount: stats.totalVillages,
      suggestions: aiAnalysis,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error('LM Studio 分析失敗:', err);
    
    // 提供更友好的錯誤訊息
    let errorMessage = err.message;
    let suggestions = '';
    
    // 檢查是否為 404 錯誤 (模型不存在)
    if (err.response && err.response.status === 404) {
      errorMessage = '模型不存在或 API 端點有誤，請確認您的 LM Studio 配置';
      suggestions = `請在 LM Studio 界面中檢查實際使用的模型名稱，並確保已啟動模型。目前配置的模型名稱為 "gemma-3-1b-it"，請確認此模型是否已載入。`;
    } 
    // 檢查是否為連線錯誤
    else if (err.code === 'ECONNREFUSED' || err.code === 'ECONNABORTED') {
      errorMessage = 'LM Studio 服務未啟動或無法連線';
      suggestions = '請確認 LM Studio 應用程式已啟動，並在本機 1234 端口運行。';
    }
    
    res.status(500).json({ 
      error: 'AI 分析失敗', 
      details: errorMessage,
      suggestions: suggestions || '無法連接到 LM Studio 模型，請確認 LM Studio 是否已啟動並加載正確的模型。'
    });
  }
});