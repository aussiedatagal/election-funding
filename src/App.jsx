import { useState, useCallback } from 'react';
import fundingData from './data/funding.json';
import SankeyChart from './components/SankeyChart';
import NetworkGraph from './components/NetworkGraph';
import FilterPanel from './components/FilterPanel';
import Tooltip from './components/Tooltip';
import Legend from './components/Legend';
import { formatFull } from './lib/formatters';

function totalFlow(sankey) {
  if (!sankey?.links) return 0;
  return sankey.links.reduce((s, l) => s + l.value, 0);
}

export default function App() {
  const [selectedYear, setSelectedYear] = useState('combined');
  const [showGroups, setShowGroups] = useState(false);
  const [tooltip, setTooltip] = useState(null);

  const currentData = selectedYear === 'combined'
    ? fundingData.combined
    : fundingData.byYear[selectedYear];

  const handleTooltip = useCallback((t) => setTooltip(t), []);

  const total = totalFlow(currentData);
  const yearLabel = selectedYear === 'combined'
    ? `${fundingData.years[0]}–${fundingData.years.at(-1)}`
    : selectedYear;

  return (
    <div className="app">

      <header className="site-header">
        <div className="header-inner">
          <h1 className="site-title">Follow the Money</h1>
          <p className="site-subtitle">
            Who funds Australian politics? Explore the flow of donations to political
            parties, sourced directly from the AEC Transparency Register.
          </p>
        </div>
      </header>

      <main className="main-content">

        <div className="news-banner">
          <strong>Recent story:</strong> In April 2026, Gina Rinehart gifted a plane
          to One Nation and executives from her Hancock group donated $500,000 each
          to the party. Because the 2025–26 AEC returns won't be published until
          February 2027, <em>these donations are not yet in this dataset</em>. They will
          appear when the next disclosures are released. What the data does show is
          Hancock Prospecting sending&nbsp;
          <strong>$895,000 to Advance Australia</strong> and <strong>$105,000 to the Liberal Party (Vic)</strong> in
          2024–25.
        </div>

        <FilterPanel
          years={fundingData.years}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
        />

        <div className="toggle-row">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={showGroups}
              onChange={e => setShowGroups(e.target.checked)}
            />
            <span>
              Show grouped donors
              <span className="toggle-hint">
                {' '}— smaller donors are grouped by category. Hiding them (default)
                gives cleaner clustering. Hover any named group to see who's inside.
              </span>
            </span>
          </label>
        </div>

        <div className="chart-meta">
          <span className="chart-period">{yearLabel}</span>
          <span className="chart-total">
            Total disclosed donations: <strong>{formatFull(total)}</strong>
          </span>
          <span className="chart-hint">Hover nodes and lines for detail · hover a party to see all its donors</span>
        </div>

        <SankeyChart
          data={currentData}
          showGroups={showGroups}
          onTooltip={handleTooltip}
        />

        <Legend />

        <section className="network-section">
          <h2 className="section-heading">Donor–Party Network</h2>
          <p className="section-subheading">
            <strong>■ Squares</strong> are parties; <strong>● circles</strong> are donors.
            Links represent donations — thicker means more money. Parties that share
            the same major donors cluster together; the groupings emerge purely from the data.
          </p>
          <NetworkGraph
            data={currentData}
            showGroups={showGroups}
            onTooltip={handleTooltip}
          />
        </section>

        <section className="about-section">
          <h2>About this data</h2>
          <div className="about-grid">
            <div>
              <h3>Source</h3>
              <p>
                All figures come from the{' '}
                <a
                  href="https://transparency.aec.gov.au/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  AEC Transparency Register
                </a>{' '}
                (bulk download, "Detailed Receipts" from Political Party Returns).
                Data covers financial years 2019–20 to 2024–25.
              </p>
            </div>
            <div>
              <h3>What's included</h3>
              <p>
                Only <em>Donation Received</em> entries declared in Political Party
                Returns. The AEC's disclosure threshold in 2024–25 is ~$16,300;
                donations below that are not reported individually and are not shown.
              </p>
            </div>
            <div>
              <h3>What's excluded</h3>
              <p>
                Public funding (AEC and state electoral commission payments), tax
                refunds, bank interest, loans, and intra-party transfers between
                state and national branches. All of these are "Other Receipt" not
                "Donation Received" and are filtered out.
              </p>
            </div>
            <div>
              <h3>Why this matters</h3>
              <p>
                Politicians represent the interests of those who fund them. Check
                whose money aligns with your interests before you vote. If a party's
                major donors are mining companies, their policies will reflect that;
                if yours are unions, same story.
              </p>
            </div>
          </div>
          <p className="about-footnote">
            {fundingData.notes}
          </p>
        </section>

      </main>

      <footer className="site-footer">
        <p>
          Data:{' '}
          <a href="https://transparency.aec.gov.au/" target="_blank" rel="noopener noreferrer">
            Australian Electoral Commission Transparency Register
          </a>.
          Not affiliated with the AEC. Built with open data.
        </p>
      </footer>

      <Tooltip tooltip={tooltip} />

    </div>
  );
}
