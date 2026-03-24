const express = require('express');
const router = express.Router();
const db = require('../../db/database');
const { movingAverage, predictGoalDate, assessPace } = require('../../utils/calculations');

// GET /api/stats/summary
router.get('/summary', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    const logs30 = db.prepare('SELECT * FROM daily_logs WHERE weight_kg IS NOT NULL ORDER BY date ASC').all();
    const last7  = logs30.slice(-7);
    const prev7  = logs30.slice(-14, -7);

    const currentWeight = logs30.length ? logs30[logs30.length - 1].weight_kg : null;
    const avg7 = last7.length ? parseFloat((last7.reduce((s, l) => s + l.weight_kg, 0) / last7.length).toFixed(1)) : null;
    const avgPrev7 = prev7.length ? parseFloat((prev7.reduce((s, l) => s + l.weight_kg, 0) / prev7.length).toFixed(1)) : null;
    const weeklyChange = (avg7 != null && avgPrev7 != null) ? parseFloat((avg7 - avgPrev7).toFixed(2)) : null;

    const kcalLogs = db.prepare('SELECT kcal_total, kcal_activity FROM daily_logs WHERE kcal_total IS NOT NULL ORDER BY date DESC LIMIT 7').all();
    const avgKcal7 = kcalLogs.length ? Math.round(kcalLogs.reduce((s, l) => s + l.kcal_total, 0) / kcalLogs.length) : null;
    const avgActivity7 = kcalLogs.length ? Math.round(kcalLogs.reduce((s, l) => s + (l.kcal_activity || 0), 0) / kcalLogs.length) : null;

    const tdee = settings?.estimated_tdee;
    const avgDeficit7 = (tdee && avgKcal7 != null) ? Math.round(tdee - avgKcal7 + (avgActivity7 || 0)) : null;

    const target = settings?.target_weight_kg;
    const diffToTarget = (currentWeight && target) ? parseFloat((currentWeight - target).toFixed(1)) : null;

    res.json({
      success: true,
      data: {
        current_weight: currentWeight ? parseFloat(currentWeight.toFixed(1)) : null,
        avg_7d:         avg7,
        weekly_change:  weeklyChange,
        avg_kcal_7d:    avgKcal7,
        avg_activity_7d: avgActivity7,
        avg_deficit_7d: avgDeficit7,
        target_weight:  target || null,
        diff_to_target: diffToTarget,
        tdee:           tdee ? Math.round(tdee) : null,
        total_logs:     db.prepare('SELECT COUNT(*) as c FROM daily_logs WHERE weight_kg IS NOT NULL').get().c
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/stats/weight-trend?days=90
router.get('/weight-trend', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const from = new Date();
    from.setDate(from.getDate() - days);
    const fromStr = from.toISOString().split('T')[0];

    const logs = db.prepare('SELECT date, weight_kg FROM daily_logs WHERE date >= ? ORDER BY date ASC').all(fromStr);
    const weights = logs.map(l => l.weight_kg);
    const movAvg = movingAverage(weights, 7);

    res.json({
      success: true,
      data: logs.map((l, i) => ({
        date:       l.date,
        weight:     l.weight_kg != null ? parseFloat(l.weight_kg.toFixed(2)) : null,
        moving_avg: movAvg[i]
      }))
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/stats/calories-trend?days=30
router.get('/calories-trend', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    const fromStr = from.toISOString().split('T')[0];

    const logs = db.prepare('SELECT date, kcal_total, kcal_activity FROM daily_logs WHERE date >= ? ORDER BY date ASC').all(fromStr);
    res.json({
      success: true,
      data: logs.map(l => ({
        date:         l.date,
        kcal_total:   l.kcal_total,
        kcal_activity: l.kcal_activity,
        net:          l.kcal_total != null ? (l.kcal_total - (l.kcal_activity || 0)) : null
      }))
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/stats/prediction
router.get('/prediction', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    const logs = db.prepare('SELECT date, weight_kg FROM daily_logs WHERE weight_kg IS NOT NULL ORDER BY date DESC LIMIT 14').all().reverse();

    if (!settings?.target_weight_kg) {
      return res.json({ success: true, data: { error: 'no_target' } });
    }

    const result = predictGoalDate(logs, settings.target_weight_kg);

    let pace = null;
    if (result.kgPerWeek != null) {
      const lastWeight = logs[logs.length - 1]?.weight_kg;
      pace = assessPace(result.kgPerWeek, lastWeight);
    }

    res.json({ success: true, data: { ...result, pace } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
