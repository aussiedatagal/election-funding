import { useState, useCallback, useEffect } from 'react';
import fundingData from './data/funding.json';
import SankeyChart from './components/SankeyChart';
import NetworkGraph from './components/NetworkGraph';
import FilterPanel from './components/FilterPanel';
import Tooltip from './components/Tooltip';
import DetailPanel from './components/DetailPanel';
import HeroVisual from './components/HeroVisual';

function totalFlow(sankey) {
  if (!sankey?.links) return 0;
  return sankey.links.reduce((s, l) => s + l.value, 0);
}

export default function App() {
  const [selectedYear, setSelectedYear] = useState('combined');
  const [tooltip, setTooltip] = useState(null);
  const [activeChart, setActiveChart] = useState('network');

  const currentData = selectedYear === 'combined'
    ? fundingData.combined
    : fundingData.byYear[selectedYear];

  const handleTooltip = useCallback((t) => setTooltip(t), []);
  const dismissTooltip = useCallback(() => setTooltip(null), []);

  useEffect(() => {
    setTooltip(null);
  }, [activeChart, selectedYear]);

  useEffect(() => {
    if (!tooltip?.pinned) return;
    const onKey = (e) => {
      if (e.key === 'Escape') dismissTooltip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tooltip?.pinned, dismissTooltip]);

  const total = totalFlow(currentData);

  return (
    <div className="app">

      <HeroVisual total={total} />

      <main className="main-content main-content--flush-top">

        <div className="chart-shell chart-shell--bleed">
          {activeChart === 'network' ? (
            <div className="network-block">
              <NetworkGraph
                data={currentData}
                onTooltip={handleTooltip}
                tooltipPinned={Boolean(tooltip?.pinned)}
                pinnedLegendCategory={tooltip?.legendCategory ?? null}
              />
              {tooltip?.panel && (
                <DetailPanel detail={tooltip} onDismiss={dismissTooltip} />
              )}
            </div>
          ) : (
            <SankeyChart data={currentData} onTooltip={handleTooltip} />
          )}
        </div>

        <div className="chart-controls-footer">
          <div className="chart-toggle chart-toggle--footer">
            <button
              type="button"
              className={`chart-tab${activeChart === 'network' ? ' active' : ''}`}
              onClick={() => setActiveChart('network')}
            >
              Network graph
            </button>
            <button
              type="button"
              className={`chart-tab${activeChart === 'sankey' ? ' active' : ''}`}
              onClick={() => setActiveChart('sankey')}
            >
              Sankey flow
            </button>
          </div>
          <FilterPanel
            className="filter-panel--footer"
            years={fundingData.years}
            selectedYear={selectedYear}
            onYearChange={setSelectedYear}
          />
        </div>

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
                (bulk download, &quot;Detailed Receipts&quot; from Political Party Returns).
                Data covers financial years 2019–20 to 2024–25.
              </p>
            </div>
            <div>
              <h3>What&apos;s included</h3>
              <p>
                Only <em>Donation Received</em> entries declared in Political Party
                Returns. The AEC disclosure threshold in 2024–25 is ~$16,300;
                donations below that are not reported individually and are not shown.
              </p>
            </div>
            <div>
              <h3>What&apos;s excluded</h3>
              <p>
                Public funding (AEC and state electoral commission payments), tax
                refunds, bank interest, loans, and intra-party transfers between
                state and national branches. All of these are &quot;Other Receipt&quot; not
                &quot;Donation Received&quot; and are filtered out.
              </p>
            </div>
            <div>
              <h3>Why this matters</h3>
              <p>
                Politicians represent the interests of those who fund them. Check
                whose money aligns with your interests before you vote. If a party&apos;s
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

      <Tooltip tooltip={tooltip?.panel ? null : tooltip} onDismiss={dismissTooltip} />

    </div>
  );
}
