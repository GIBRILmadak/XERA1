const calculateMomentum = (series, daysInMonth) => {
    const successData = series.success || [];
    const activeDays = successData.filter(v => v > 0).length;
    const totalVolume = successData.reduce((a, b) => a + b, 0);

    if (daysInMonth <= 0) return { score: 0 };
    if (activeDays === 0) return { score: 0, activeDays: 0, totalVolume: 0, consistency: 0, frequency: 0, intensity: 0 };

    const frequency = activeDays / daysInMonth;
    const mean = totalVolume / daysInMonth;
    const variance = successData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / daysInMonth;

    // Consistance : On récompense la faible variance
    const consistency = 1 / (1 + Math.pow(variance, 0.5));

    // Intensité : Récompense ceux qui font plus qu'un simple log par jour
    // Un builder qui fait 2-3 traces par jour est dans la zone optimale
    const avgDaily = totalVolume / activeDays;
    const intensity = Math.min(1.4, 0.5 + (avgDaily / 4));

    // Score Final : On multiplie les facteurs
    // frequency est au carré car c'est le facteur le plus important chez XERA1
    const rawScore = (intensity * Math.pow(frequency, 1.5) * consistency) * 130;

    return {
        score: Math.min(100, Math.round(rawScore)),
        activeDays,
        totalVolume,
        consistency: Math.round(consistency * 100),
        frequency: Math.round(frequency * 100),
        intensity: intensity.toFixed(2)
    };
};

const days = 30;

const cases = [
    {
        name: "L'Élite (3 traces/jour, 100% du temps)",
        series: { success: Array(days).fill(3) }
    },
    {
        name: "Le Régulier (1 trace/jour, 100% du temps)",
        series: { success: Array(days).fill(1) }
    },
    {
        name: "Le Sprinter (30 traces le J1, puis rien)",
        series: { success: [30, ...Array(days - 1).fill(0)] }
    },
    {
        name: "L'Intermittent (5 traces tous les 3 jours)",
        series: { success: Array(days).fill(0).map((_, i) => (i % 3 === 0 ? 5 : 0)) }
    },
    {
        name: "Le Débutant (1 trace, une seule fois)",
        series: { success: [1, ...Array(days - 1).fill(0)] }
    }
];

console.log("=== TEST DE PRÉCISION DU MOMENTUM XERA1 (V3) ===\n");
cases.forEach(c => {
    const res = calculateMomentum(c.series, days);
    console.log(`CASE: ${c.name}`);
    console.log(`- Score: ${res.score}/100`);
    console.log(`- Volume Total: ${res.totalVolume}`);
    console.log(`- Fréquence: ${res.frequency}%`);
    console.log(`- Consistance: ${res.consistency}%`);
    console.log(`- Intensité: ${res.intensity}`);
    console.log("------------------------------------------");
});
