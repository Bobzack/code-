// ✅ 最新版 server_pro.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

const app = express();
const port = 3001;

// 資料庫連線設定
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'bob33715791',
  database: 'drought_risk_db_PRO',
  waitForConnections: true,
  connectionLimit: 20,
});

const resultPool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'bob33715791',
  database: 'drought_risk_results_PRO',
  waitForConnections: true,
  connectionLimit: 10,
});

app.use(cors());
app.use(bodyParser.json());

// 標準化分級表
const gradingTable = {
  rainfall_0_3: [1800, 1600, 1400, 1200, 1000, 900, 750, 600, 450, 0],
  evapotranspiration_0_3: [0, 100, 200, 300, 400, 600, 800, 1200, 1600, 2000],
  delay_0_4: [0, 5, 10, 15, 20, 30, 40, 50, 100, 150],
  industry_score_0_3: [0, 50000, 100000, 150000, 200000, 250000, 500000, 750000, 1000000, 2000000],
  tourism_score_0_3: [0, 5000, 10000, 20000, 40000, 60000, 80000, 100000, 200000, 500000]
};

// 根據分級表給分數
function getGrade(value, table) {
  for (let i = 0; i < table.length; i++) {
    if (value <= table[i]) return 10 - i;
  }
  return 1;
}

app.post('/api/calculate-all-risks', async (req, res) => {
  try {
    const userInput = req.body;
    const [rows] = await pool.query('SELECT * FROM villages');
    await resultPool.query('TRUNCATE TABLE villages');

    for (const row of rows) {
      // 發生階段
      const rainfall = userInput.rainfall_0_3 ?? parseFloat(row.rainfall_0_3);
      const evapotranspiration = userInput.evapotranspiration_0_3 ?? parseFloat(row.evapotranspiration_0_3);
      const delay = userInput.delay_0_4 ?? parseFloat(row.delay_0_4);

      const rainfallScore = (rainfall <= 1800) ? (10 - Math.floor(rainfall / 180)) * 0.3 : 1 * 0.3;
      const evapotranspirationScore = (evapotranspiration >= 0) ? (Math.floor(evapotranspiration / 200)) * 0.3 : 1 * 0.3;
      const delayScore = (delay >= 0) ? (Math.floor(delay / 15)) * 0.4 : 1 * 0.4;
      const phase1 = Math.max(rainfallScore + evapotranspirationScore + delayScore, 1);

      // 預防階段
      const surfaceWater = userInput.surface_water_0_5 ?? parseFloat(row.surface_water_0_5);
      const groundwater = userInput.groundwater_0_5 ?? parseFloat(row.groundwater_0_5);
      const phase2 = Math.max(surfaceWater * 0.5 + groundwater * 0.5, 1);

      // 耗用階段 + 供給強化
      const industryScore = userInput.industry_score_0_3 ?? parseFloat(row.industry_score_0_3);
      const tourismScore = userInput.tourism_score_0_3 ?? parseFloat(row.tourism_score_0_3);
      const residentPopulation = userInput.resident_population_0_4 ?? parseFloat(row.resident_population_0_4);

      const disasterFund = userInput.Disaster_Prevention_Budget ?? parseFloat(row.Disaster_Prevention_Budget);
      const resilientCommunity = userInput.resilient_community_0_3 ?? parseFloat(row.resilient_community_0_3);
      const emergencyWater = userInput.emergency_water_0_3 ?? parseFloat(row.emergency_water_0_3);

      const reinforce = (disasterFund + resilientCommunity + emergencyWater) * 0.4;
      const phase3 = Math.max(residentPopulation * 0.4 + industryScore * 0.3 + tourismScore * 0.3 - reinforce, 1);

      // 綜合風險
      const risk = Math.cbrt(phase1 * phase2 * phase3);

      await resultPool.query(`INSERT INTO villages (id, 村里, risk, original_risk) VALUES (?, ?, ?, ?)`, [
        row.id,
        row['村里'],
        risk,
        parseFloat(row.risk)
      ]);
    }

    res.json({ message: '✅ 成功重新計算所有風險值' });
  } catch (err) {
    console.error('❌ 計算錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});


// 差異地圖 API
app.get('/api/all-villages-data', async (req, res) => {
  try {
    const [rows] = await resultPool.query(`
      SELECT 
        id,
        \`村里\` AS name,
        risk,
        original_risk,
        (risk - original_risk) / NULLIF(original_risk, 0) AS diff_ratio
      FROM villages
    `);
    res.json(rows);
  } catch (err) {
    console.error('❌ 差異地圖API錯誤:', err);
    res.status(500).json({ error: '讀取失敗', details: err.message });
  }
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 伺服器啟動
app.listen(port, () => {
  console.log(`🚀 進階版 Server_pro.js 運行中：http://localhost:${port}`);
});
