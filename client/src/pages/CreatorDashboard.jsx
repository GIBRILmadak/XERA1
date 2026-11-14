import Navbar from '../components/Navbar';

/**
 * Creator Dashboard — monetization page
 * Content rendered by legacy creator-dashboard.js + monetization.js.
 */
export default function CreatorDashboard() {
  return (
    <>
      <Navbar />
      <main className="dashboard-main">
        {/* Header */}
        <div className="dashboard-header">
          <h1>Monétisation Créateur</h1>
          <p className="dashboard-desc">Gérez vos revenus, retraits et statistiques de monétisation.</p>
          <div id="dashboardIdentity"></div>
          <div className="stat-cards-row">
            <div className="stat-card" id="stat-net-credite">
              <span className="stat-label">Net crédité</span>
              <span className="stat-value" id="stat-net-value">—</span>
            </div>
            <div className="stat-card" id="stat-solde">
              <span className="stat-label">Solde disponible</span>
              <span className="stat-value" id="stat-solde-value">—</span>
            </div>
          </div>
        </div>

        {/* Monetization status */}
        <section id="monetization-status" className="dashboard-section">
          <div className="status-card" id="status-card-content"></div>
        </section>

        {/* Wallet */}
        <section id="wallet-section" className="dashboard-section">
          <h2>Portefeuille</h2>
          <div className="wallet-cards" id="wallet-cards"></div>

          {/* Payout settings form */}
          <form id="payoutSettingsForm" className="payout-form">
            <h3>Paramètres de paiement</h3>
            <div className="form-group">
              <label htmlFor="payout-provider">Opérateur</label>
              <select id="payout-provider" className="form-input">
                <option value="">Sélectionnez un opérateur</option>
                <option value="airtel">Airtel Money</option>
                <option value="orange">Orange Money</option>
                <option value="mpesa">M-Pesa</option>
                <option value="afrimoney">Afrimoney</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="payout-name">Titulaire du compte</label>
              <input type="text" id="payout-name" className="form-input" placeholder="Nom complet" />
            </div>
            <div className="form-group">
              <label htmlFor="payout-number">Numéro Mobile Money</label>
              <input type="tel" id="payout-number" className="form-input" placeholder="+243..." />
            </div>
            <div className="form-group">
              <label htmlFor="payout-country">Code pays</label>
              <input type="text" id="payout-country" className="form-input" placeholder="CD" maxLength={3} />
            </div>
            <div className="form-group">
              <label htmlFor="payout-notes">Notes</label>
              <textarea id="payout-notes" className="form-input" rows={3} placeholder="Informations supplémentaires..."></textarea>
            </div>
            <button type="submit" className="btn-submit" id="save-payout-btn">Sauvegarder</button>
          </form>

          {/* Withdrawal request form */}
          <form id="withdrawalRequestForm" className="withdrawal-form">
            <h3>Demande de retrait</h3>
            <div className="form-group">
              <label htmlFor="withdrawal-amount">Montant (USD)</label>
              <input type="number" id="withdrawal-amount" className="form-input" placeholder="0.00" min="1" step="0.01" />
            </div>
            <div className="form-group">
              <label htmlFor="withdrawal-available">Solde disponible</label>
              <input type="text" id="withdrawal-available" className="form-input" readOnly />
            </div>
            <button type="submit" className="btn-submit" id="submit-withdrawal-btn">Demander le retrait</button>
          </form>
        </section>

        {/* Revenue overview */}
        <section id="revenue-overview" className="dashboard-section">
          <h2>Revenus</h2>
          <div className="period-filters" id="period-filters">
            <button className="filter-btn active" data-period="all">Tout</button>
            <button className="filter-btn" data-period="30d">30 jours</button>
            <button className="filter-btn" data-period="7d">7 jours</button>
            <button className="filter-btn" data-period="today">Aujourd'hui</button>
          </div>
          <div className="revenue-cards" id="revenue-cards"></div>
        </section>

        {/* Video stats */}
        <section id="video-stats" className="dashboard-section" style={{ display: 'none' }}>
          <h2>Statistiques vidéo</h2>
          <div className="video-stats-grid" id="video-stats-grid"></div>
          <div className="rpm-badge">RPM: $0.40 / 1 000 vues</div>
        </section>

        {/* Transactions table */}
        <section id="transactions-section" className="dashboard-section">
          <h2>Transactions</h2>
          <div className="table-filters" id="transaction-filters">
            <button className="filter-btn active" data-type="all">Tout</button>
            <button className="filter-btn" data-type="support">Soutiens</button>
            <button className="filter-btn" data-type="video">Revenus vidéo</button>
          </div>
          <div className="table-wrapper">
            <table className="data-table" id="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Montant brut</th>
                  <th>Commission (20%)</th>
                  <th>Net reçu</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody id="transactions-tbody"></tbody>
            </table>
          </div>
        </section>

        {/* Payouts table */}
        <section id="payouts-section" className="dashboard-section">
          <h2>Paiements</h2>
          <div className="table-wrapper">
            <table className="data-table" id="payouts-table">
              <thead>
                <tr>
                  <th>Période</th>
                  <th>Vues</th>
                  <th>Taux RPM</th>
                  <th>Montant brut</th>
                  <th>Net reçu</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody id="payouts-tbody"></tbody>
            </table>
          </div>
        </section>

        {/* Withdrawals table */}
        <section id="withdrawals-section" className="dashboard-section">
          <h2>Retraits</h2>
          <div className="table-wrapper">
            <table className="data-table" id="withdrawals-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Montant</th>
                  <th>Canal</th>
                  <th>Compte</th>
                  <th>Statut</th>
                  <th>Référence</th>
                </tr>
              </thead>
              <tbody id="withdrawals-tbody"></tbody>
            </table>
          </div>
        </section>

        {/* Upgrade modal */}
        <div id="upgradeModal" className="modal" style={{ display: 'none' }}></div>
        {/* Support modal */}
        <div id="supportModal" className="modal" style={{ display: 'none' }}></div>
      </main>
    </>
  );
}
