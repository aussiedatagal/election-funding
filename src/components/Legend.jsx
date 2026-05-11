import { PARTY_COLORS, CATEGORY_COLORS } from '../lib/partyConfig';

function Swatch({ color, label }) {
  return (
    <div className="legend-item">
      <span className="legend-swatch" style={{ background: color }} />
      <span className="legend-label">{label}</span>
    </div>
  );
}

export default function Legend() {
  return (
    <div className="legend">
      <div className="legend-group">
        <h4 className="legend-heading">Political Parties (right side)</h4>
        <div className="legend-grid">
          {Object.entries(PARTY_COLORS).map(([name, color]) => (
            <Swatch key={name} color={color} label={name} />
          ))}
        </div>
      </div>
      <div className="legend-group">
        <h4 className="legend-heading">Donor Categories (left side)</h4>
        <div className="legend-grid">
          {Object.entries(CATEGORY_COLORS).map(([name, color]) => (
            <Swatch key={name} color={color} label={name} />
          ))}
        </div>
      </div>
    </div>
  );
}
