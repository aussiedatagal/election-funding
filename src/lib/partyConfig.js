export const PARTY_COLORS = {
  // Left / Labor
  'Australian Labor Party':          '#E4002B',
  'Victorian Socialists':            '#8B0000',

  // Greens / Progressives
  'Australian Greens':               '#009B3A',
  'Sustainable Australia':           '#66BB6A',
  'Reason Australia':                '#AB47BC',

  // Centre / Crossbench
  'Independents':                    '#00838F',
  'Centre Alliance':                 '#546E7A',
  'Jacqui Lambie Network':           '#7B5EA7',
  'Rex Patrick Team':                '#78909C',
  'Animal Justice Party':            '#6D4C41',
  'Legalise Cannabis Australia':     '#4CAF50',

  // Rural / Regional
  "Katter's Australian Party":       '#8B1A1A',
  'Shooters, Fishers and Farmers':   '#795548',

  // Religious / Social Conservative
  'Christian Democratic Party':      '#5C4033',
  'Australian Christians':           '#6D4C41',
  'Family First':                    '#4E342E',

  // Right / Nationalist
  'One Nation':                      '#F5A623',
  'Western Australia Party':         '#E65100',
  'Liberal-National Coalition':      '#003087',
  'Libertarian / Liberal Democrats': '#8E24AA',
  'The Great Australian Party':      '#BF360C',
  'Australian Values Party':         '#D84315',
  'Australian Citizens Party':       '#37474F',

  // Palmer
  'Clive Palmer / UAP':              '#FF6600',

  // Catch-all
  'Other / Minor Parties':           '#78909C',
};

// Donor categories — hues spaced for legend/graph distinction (not party colours).
export const CATEGORY_COLORS = {
  'Mining & Resources':              '#E65100',  // orange
  'Unions':                          '#D32F2F',  // red
  'Property & Development':          '#1976D2',  // blue
  'Crossbench funds':                '#00BCD4',  // cyan
  'Finance & Investment':            '#7B1FA2',  // purple
  'Party fundraising':               '#9E9E9E',  // neutral grey
  'Individual Donor':                '#FFB300',  // gold
  'Other companies':                 '#607D8B',  // blue-grey
};

export const PARTY_ORDER = [
  'Australian Labor Party',
  'Victorian Socialists',
  'Australian Greens',
  'Independents',
  'Reason Australia',
  'Centre Alliance',
  'Sustainable Australia',
  'Animal Justice Party',
  'Legalise Cannabis Australia',
  'Jacqui Lambie Network',
  'Rex Patrick Team',
  "Katter's Australian Party",
  'Shooters, Fishers and Farmers',
  'Liberal-National Coalition',
  'One Nation',
  'Western Australia Party',
  'Christian Democratic Party',
  'Australian Christians',
  'Family First',
  'Libertarian / Liberal Democrats',
  'The Great Australian Party',
  'Australian Values Party',
  'Australian Citizens Party',
  'Clive Palmer / UAP',
  'Other / Minor Parties',
];

export function partyColor(name) {
  return PARTY_COLORS[name] ?? '#78909C';
}

export function categoryColor(name) {
  return CATEGORY_COLORS[name] ?? '#607D8B';
}
