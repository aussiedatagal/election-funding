export default function FilterPanel({
  years,
  selectedYears,
  onToggleYear,
  className = '',
}) {
  return (
    <div className={`filter-panel ${className}`.trim()}>
      <div className="filter-label">Financial Year</div>
      <div className="filter-tabs" role="group" aria-label="Financial years">
        {years.map((year) => {
          const selected = selectedYears.includes(year);
          return (
            <button
              key={year}
              type="button"
              className={`filter-tab${selected ? ' active' : ''}`}
              onClick={() => onToggleYear(year)}
              aria-pressed={selected}
            >
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
}
