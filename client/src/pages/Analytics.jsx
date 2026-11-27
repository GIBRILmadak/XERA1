import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import { Skeleton } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { DEMO } from '../services/demo';
import { compact } from '../lib/format';

/** Score d'élan (calculateMomentum de js/analytics.js, même formule). */
export function calculateMomentum(success, daysInMonth) {
  const activeDays = success.filter((v) => v > 0).length;
  const total = success.reduce((a, b) => a + b, 0);
  if (daysInMonth <= 0 || activeDays === 0) return { score: 0, activeDays: 0, total: 0, consistency: 0 };
  const frequency = activeDays / daysInMonth;
  const mean = total / daysInMonth;
  const variance = success.reduce((a, b) => a + (b - mean) ** 2, 0) / daysInMonth;
  const consistency = 1 / (1 + variance ** 0.5);
  const intensity = Math.min(1.4, 0.5 + total / activeDays / 4);
  const raw = intensity * frequency ** 1.5 * consistency * 130;
  return { score: Math.min(100, Math.round(raw)), activeDays, total, consistency: Math.round(consistency * 100) };
}

/** Conseils (generateInsights). */
function insights(m, totals) {
  const list = [];
  if (m.score > 70) list.push({ icon: 'local_fire_department', tone: 'success', text: 'Impulsion exceptionnelle. Ta vélocité actuelle dépasse 90 % des bâtisseurs.', tip: 'Augmente la complexité de tes preuves pour passer à l’échelle.' });
  else if (m.score > 40) list.push({ icon: 'trending_up', tone: 'violet', text: 'Progression stable. Maintiens ce rythme pour consolider ta trajectoire.', tip: 'Publie une preuve « en profondeur » pour inspirer les autres.' });
  else list.push({ icon: 'bedtime', tone: 'pause', text: 'Inertie détectée. Une petite action aujourd’hui relancera ton moteur.', tip: 'Publie une preuve rapide (même une simple réflexion) maintenant.' });
  if (totals.failure > totals.success * 0.3) list.push({ icon: 'warning', tone: 'failure', text: 'Taux de friction élevé. Analyse tes points de blocage.', tip: 'Revois tes jalons, ils sont peut-être trop larges.' });
  return list;
}

const monthLabel = (y, m) => new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const pad = (n) => String(n).padStart(2, '0');

function monthsSince(createdAt) {
  const now = new Date();
  const start = createdAt ? new Date(createdAt) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const out = [];
  for (let d = new Date(now.getFullYear(), now.getMonth(), 1); d >= new Date(start.getFullYear(), start.getMonth(), 1) && out.length < 24; d.setMonth(d.getMonth() - 1)) {
    out.push([d.getFullYear(), d.getMonth()]);
  }
  return out;
}

function demoMetrics(days) {
  return Array.from({ length: days }, (_, i) => ({ date: `x-${i + 1}`, success_count: (i * 7) % 5 > 1 ? ((i * 3) % 4) : 0, failure_count: i % 6 === 0 ? 1 : 0, pause_count: i % 9 === 0 ? 1 : 0 }));
}

function Ring({ value }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" className="ring" aria-label={`Score d’élan ${value} sur 100`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * value) / 100} transform="rotate(-90 60 60)" className="ring-arc" />
      <defs>
        <linearGradient id="ringGrad" x1="0" x2="1">
          <stop offset="0" stopColor="#10B981" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <text x="60" y="58" textAnchor="middle" fontSize="28" fontWeight="700" fill="var(--text)" fontFamily="Outfit, sans-serif">{value}</text>
      <text x="60" y="78" textAnchor="middle" fontSize="11" fill="var(--text-3)">/ 100</text>
    </svg>
  );
}

function DailyChart({ series, days }) {
  const max = Math.max(1, ...series.success.map((s, i) => s + series.failure[i] + series.pause[i]));
  const W = 640;
  const H = 180;
  const bw = W / days;
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="daily-chart" role="img" aria-label="Activité quotidienne du mois">
      {[0.5, 1].map((g) => (
        <line key={g} x1="0" x2={W} y1={H - H * g} y2={H - H * g} stroke="var(--border)" strokeDasharray="3 5" />
      ))}
      {series.success.map((s, i) => {
        const f = series.failure[i];
        const p = series.pause[i];
        const hS = (s / max) * H;
        const hF = (f / max) * H;
        const hP = (p / max) * H;
        const x = i * bw + bw * 0.18;
        const w = bw * 0.64;
        return (
          <g key={i} className="bar" style={{ animationDelay: `${i * 18}ms` }}>
            <title>{`Jour ${i + 1} : ${s} avancée(s), ${f} obstacle(s), ${p} pause(s)`}</title>
            {hS > 0 && <rect x={x} y={H - hS} width={w} height={hS} rx="2" fill="#10B981" />}
            {hF > 0 && <rect x={x} y={H - hS - hF} width={w} height={hF} rx="2" fill="#EF4444" />}
            {hP > 0 && <rect x={x} y={H - hS - hF - hP} width={w} height={hP} rx="2" fill="#6366F1" />}
            {(i === 0 || (i + 1) % 5 === 0) && (
              <text x={i * bw + bw / 2} y={H + 16} textAnchor="middle" fontSize="10" fill="var(--text-3)">
                {i + 1}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const months = useMemo(() => monthsSince(user?.created_at), [user?.created_at]);
  const [sel, setSel] = useState(0);
  const [metrics, setMetrics] = useState(null);
  const [account, setAccount] = useState(null);
  const [y, m] = months[sel] || [new Date().getFullYear(), new Date().getMonth()];
  const days = new Date(y, m + 1, 0).getDate();

  useEffect(() => {
    let alive = true;
    setMetrics(null);
    (async () => {
      if (DEMO) return setMetrics(demoMetrics(days));
      const { data } = await supabase
        .from('daily_metrics')
        .select('date, success_count, failure_count, pause_count')
        .eq('user_id', user.id)
        .gte('date', `${y}-${pad(m + 1)}-01`)
        .lte('date', `${y}-${pad(m + 1)}-${pad(days)}`)
        .order('date', { ascending: true });
      if (alive) setMetrics(data || []);
    })();
    return () => {
      alive = false;
    };
  }, [user.id, y, m, days]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (DEMO) return setAccount({ followers: 1284, contentCount: 46, totalViews: 18200, encouragements: 312, donations: 142.5, donationCount: 21, liveHours: 6.5, activeDays: 38, top: [] });
      const read = async (q) => {
        const r = await q;
        return r.error ? [] : r.data || [];
      };
      const [content, followers, enc, tx, sessions] = await Promise.all([
        read(supabase.from('content').select('id, views, type, title, media_url, created_at').eq('user_id', user.id).eq('is_deleted', false)),
        supabase.from('followers').select('id', { count: 'exact', head: true }).eq('following_id', user.id).then((r) => r.count || 0),
        read(supabase.from('content_encouragements').select('id').eq('user_id', user.id)),
        read(supabase.from('transactions').select('amount_net_creator, type, status').eq('to_user_id', user.id)),
        read(supabase.from('streaming_sessions').select('started_at, ended_at').eq('user_id', user.id)),
      ]);
      const ok = tx.filter((t) => t.status === 'succeeded' && t.type === 'support');
      const views = content.reduce((n, c) => n + Number(c.views || 0), 0);
      if (!alive) return;
      setAccount({
        followers,
        contentCount: content.length,
        totalViews: views,
        averageViews: content.length ? Math.round(views / content.length) : 0,
        encouragements: enc.length,
        donations: ok.reduce((n, t) => n + Number(t.amount_net_creator || 0), 0),
        donationCount: ok.length,
        liveHours: sessions.reduce((n, s) => (s.started_at && s.ended_at ? n + Math.max(0, Date.parse(s.ended_at) - Date.parse(s.started_at)) / 36e5 : n), 0),
        activeDays: new Set(content.map((c) => String(c.created_at || '').slice(0, 10))).size,
        top: [...content].filter((c) => c.media_url).sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, 5),
      });
    })();
    return () => {
      alive = false;
    };
  }, [user.id]);

  const series = useMemo(() => {
    const s = { success: Array(days).fill(0), failure: Array(days).fill(0), pause: Array(days).fill(0) };
    (metrics || []).forEach((row, i) => {
      const d = row.date?.startsWith('x-') ? i : Number(String(row.date).slice(8, 10)) - 1;
      if (d >= 0 && d < days) {
        s.success[d] += Number(row.success_count || 0);
        s.failure[d] += Number(row.failure_count || 0);
        s.pause[d] += Number(row.pause_count || 0);
      }
    });
    return s;
  }, [metrics, days]);
  const totals = { success: series.success.reduce((a, b) => a + b, 0), failure: series.failure.reduce((a, b) => a + b, 0), pause: series.pause.reduce((a, b) => a + b, 0) };
  const momentum = calculateMomentum(series.success, days);

  return (
    <>
      <TopBar back title="Statistiques" />
      <main className="main main--wide">
        <div className="section-title" style={{ marginTop: 8 }}>
          <h2>Analytics mensuelles</h2>
          <select className="select" style={{ width: 'auto', minHeight: 36, padding: '4px 10px', textTransform: 'capitalize' }} value={sel} onChange={(e) => setSel(Number(e.target.value))} aria-label="Mois">
            {months.map(([yy, mm], i) => (
              <option key={`${yy}-${mm}`} value={i}>
                {monthLabel(yy, mm)}
              </option>
            ))}
          </select>
        </div>

        <div className="momentum-row">
          <section className="card card--pad momentum-card">
            <Ring value={momentum.score} />
            <div className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">Score d’élan</span>
              <strong style={{ fontSize: 15 }}>{momentum.activeDays} jours actifs sur {days}</strong>
              <span className="muted" style={{ fontSize: 13 }}>Régularité {momentum.consistency} % · {momentum.total} avancées</span>
            </div>
          </section>
          <div className="stack" style={{ gap: 10 }}>
            {insights(momentum, totals).map((ins) => (
              <div key={ins.text} className={`insight insight--${ins.tone}`}>
                <Icon name={ins.icon} filled />
                <div>
                  <strong>{ins.text}</strong>
                  <span>{ins.tip}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <section className="card card--pad" style={{ marginTop: 14 }}>
          <div className="chart-legend">
            <span><i style={{ background: '#10B981' }} />Avancées {totals.success}</span>
            <span><i style={{ background: '#EF4444' }} />Obstacles {totals.failure}</span>
            <span><i style={{ background: '#6366F1' }} />Pauses {totals.pause}</span>
          </div>
          {metrics === null ? <Skeleton height={190} radius={10} /> : <DailyChart series={series} days={days} />}
        </section>

        <div className="section-title">
          <h2>Analyse du compte</h2>
        </div>
        {account === null ? (
          <Skeleton height={140} radius={12} />
        ) : (
          <>
            <div className="kpi-grid">
              {[
                ['group', 'Abonnés', compact(account.followers)],
                ['photo_library', 'Preuves', account.contentCount],
                ['visibility', 'Vues', compact(account.totalViews)],
                ['local_fire_department', 'Encouragements donnés', account.encouragements],
                ['favorite', 'Soutiens reçus', `${account.donationCount} · ${account.donations.toFixed(2)} $`],
                ['sensors', 'Heures de live', account.liveHours.toFixed(1)],
                ['calendar_month', 'Jours actifs', account.activeDays],
              ].map(([icon, label, value]) => (
                <div key={label} className="kpi">
                  <Icon name={icon} />
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            {account.top.length > 0 && (
              <>
                <div className="section-title">
                  <h2>Preuves les plus vues</h2>
                </div>
                <div className="card list" style={{ padding: 6 }}>
                  {account.top.map((c, i) => (
                    <div key={c.id} className="list-item">
                      <span className="top-rank">{i + 1}</span>
                      <img src={c.media_url} alt="" className="top-thumb" loading="lazy" />
                      <span className="grow">
                        <span className="title" style={{ display: 'block' }}>{c.title || 'Preuve'}</span>
                        <span className="sub">{compact(c.views || 0)} vues</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        <p className="muted" style={{ textAlign: 'center', fontSize: 13, marginTop: 18 }}>
          Les revenus et retraits se trouvent dans l’<Link to="/espace-createur" style={{ textDecoration: 'underline' }}>espace créateur</Link>.
        </p>
      </main>
    </>
  );
}
