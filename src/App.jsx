import { useState, useCallback, useEffect, useMemo } from 'react';
import fundingData from './data/funding.json';
import NetworkGraph from './components/NetworkGraph';
import FilterPanel from './components/FilterPanel';
import DetailPanel from './components/DetailPanel';
import HeroVisual from './components/HeroVisual';
import { getFundingForYears } from './lib/mergeFundingYears';

function totalFlow(data) {
  if (!data?.links) return 0;
  return data.links.reduce((s, l) => s + l.value, 0);
}

export default function App() {
  const [selectedYears, setSelectedYears] = useState(() => [...fundingData.years]);
  const [tooltip, setTooltip] = useState(null);

  const currentData = useMemo(
    () => getFundingForYears(fundingData, selectedYears),
    [selectedYears]
  );

  const handleToggleYear = useCallback((year) => {
    setSelectedYears((prev) => {
      if (prev.includes(year)) {
        if (prev.length <= 1) return prev;
        return prev.filter((y) => y !== year);
      }
      const next = [...prev, year];
      next.sort((a, b) => fundingData.years.indexOf(a) - fundingData.years.indexOf(b));
      return next;
    });
  }, []);

  const handleTooltip = useCallback((t) => setTooltip(t), []);
  const dismissTooltip = useCallback(() => setTooltip(null), []);

  useEffect(() => {
    setTooltip(null);
  }, [selectedYears]);

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
        </div>

        <div className="chart-controls-footer">
          <FilterPanel
            className="filter-panel--footer"
            years={fundingData.years}
            selectedYears={selectedYears}
            onToggleYear={handleToggleYear}
          />
        </div>

        <section className="about-section">
          <h2>About this data</h2>
          <div className="about-copy">
            <p>
              Figures are from the{' '}
              <a
                href="https://transparency.aec.gov.au/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Australian Electoral Commission Transparency Register
              </a>
              {' '}(financial years 2019–20 to 2024–25). This site is not affiliated with the AEC.
            </p>
            <p>
              Only declared political donations above the annual disclosure threshold are
              shown (about $16,300 in 2024–25; the threshold changes each year). Smaller
              gifts are not reported individually. Public funding, loans, and other
              non-donation receipts are excluded.
            </p>
          </div>
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

    </div>
  );
}
