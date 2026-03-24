// ─── BMR (Mifflin-St Jeor) ────────────────────────────────────────────────────

function calcBMR(weight, height, age, sex) {
  if (!weight || !height || !age || !sex) return null;
  const base = 10 * weight + 6.25 * height - 5 * age;
  return parseFloat((sex === 'male' ? base + 5 : base - 161).toFixed(0));
}

// ─── TDEE ─────────────────────────────────────────────────────────────────────

const ACTIVITY_MULTIPLIERS = {
  sedentary:   1.2,
  light:       1.375,
  moderate:    1.55,
  active:      1.725,
  very_active: 1.9
};

function calcTDEE(bmr, activityLevel) {
  if (!bmr) return null;
  return parseFloat((bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || 1.2)).toFixed(0));
}

// ─── Media móvil ──────────────────────────────────────────────────────────────

function movingAverage(values, window = 7) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter(v => v != null);
    if (!slice.length) return null;
    return parseFloat((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2));
  });
}

// ─── Regresión lineal ─────────────────────────────────────────────────────────

function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  const sumX  = points.reduce((s, p) => s + p.x, 0);
  const sumY  = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom; // slope kg/día
}

// ─── Predicción de objetivo ───────────────────────────────────────────────────

function predictGoalDate(logs, targetWeight) {
  const valid = logs.filter(l => l.weight_kg != null).slice(-14);
  if (valid.length < 5) return { error: 'insufficient_data' };

  const points = valid.map((l, i) => ({ x: i, y: l.weight_kg }));
  const slope = linearRegression(points);

  if (slope == null || slope >= -0.01) return { error: 'no_loss_trend' };

  const lastWeight = valid[valid.length - 1].weight_kg;
  const daysToGoal = (targetWeight - lastWeight) / slope;

  if (daysToGoal < 0 || daysToGoal > 730) return { error: 'unreachable' };

  const goalDate = new Date();
  goalDate.setDate(goalDate.getDate() + Math.round(daysToGoal));

  return {
    goalDate:    goalDate.toISOString().split('T')[0],
    kgPerWeek:   parseFloat((slope * 7).toFixed(2)),
    weeksToGoal: Math.round(daysToGoal / 7),
    daysToGoal:  Math.round(daysToGoal)
  };
}

// ─── Evaluación del ritmo ─────────────────────────────────────────────────────

function assessPace(kgPerWeek, currentWeight) {
  if (!kgPerWeek || !currentWeight) return 'insufficient_data';
  const pct = Math.abs(kgPerWeek) / currentWeight;
  if (pct > 0.01)                     return 'aggressive';  // > 1% peso corporal/semana
  if (Math.abs(kgPerWeek) >= 0.4)     return 'good';        // 0.4–0.8 kg/semana
  if (Math.abs(kgPerWeek) < 0.1)      return 'stagnant';
  return 'slow';
}

module.exports = { calcBMR, calcTDEE, ACTIVITY_MULTIPLIERS, movingAverage, linearRegression, predictGoalDate, assessPace };
