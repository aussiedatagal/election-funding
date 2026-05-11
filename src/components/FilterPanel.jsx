export default function FilterPanel({ years, selectedYear, onYearChange }) {
  const tabs = [{ key: 'combined', label: 'All Years' }, ...years.map(y => ({ key: y, label: y }))];

  return (
    <div className="filter-panel">
      <div className="filter-label">Financial Year</div>
      <div className="filter-tabs">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            className={`filter-tab${selectedYear === key ? ' active' : ''}`}
            onClick={() => onYearChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
