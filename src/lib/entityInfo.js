// Descriptions shown in the detail panel for donors and parties.
// Keep these short. They appear in a compact panel below the chart.
// Only say who an entity is, and only when it's well documented and the name
// doesn't already say it. Amounts and recipients come from the AEC data in the
// panel itself, so don't repeat them here, and don't describe motives or ties.

export const DONOR_INFO = {
  'Mineralogy Pty Ltd (Clive Palmer)':
    "Clive Palmer's private company.",

  'Pratt Holdings':
    'Private investment company of the Pratt family, owners of Visy.',

  'Cormack Foundation':
    'Investment company linked to the Victorian Liberal Party.',

  'Climate 200':
    'Fundraising group that backs independent candidates, founded by Simon Holmes à Court.',

  'Hancock Prospecting':
    "Gina Rinehart's mining company.",

  'SA Progressive Business':
    'Labor Party fundraising network for South Australian businesses.',

  'Meriton Property Services':
    "Part of Harry Triguboff's Meriton apartment group.",

  'Kooyong 200 Club':
    'Liberal Party fundraising club in the Melbourne seat of Kooyong.',

  'Adani / Bravus Mining':
    "Australian arm of India's Adani Group, which runs the Carmichael coal mine in Queensland.",

  'DoorDash Technologies':
    'US food delivery company.',

  'Fox Group Holdings':
    "The Fox family's company, owners of the Linfox transport group.",

  'Australian Capital Equity':
    "Kerry Stokes' private investment company.",

  'LGT Crestone Wealth Management Limited':
    'Wealth management firm.',

  'John McEwen House Pty Ltd':
    'Company linked to the National Party.',
};

export const PARTY_INFO = {
  'Australian Labor Party':
    'In government federally since 2022.',

  'Liberal-National Coalition':
    'Alliance of the Liberal Party and the National Party. In government federally from 2013 to 2022.',

  'Clive Palmer / UAP':
    'Parties led or funded by Clive Palmer, including the United Australia Party.',

  'One Nation':
    "Pauline Hanson's One Nation.",

  'Independents':
    'Candidates who ran without a registered party. Includes the community independents backed by Climate 200, and others such as Dai Le and Andrew Gee.',

  'Jacqui Lambie Network':
    'Party led by Tasmanian Senator Jacqui Lambie.',

  "Katter's Australian Party":
    'Queensland party founded by Bob Katter.',

  'Libertarian / Liberal Democrats':
    'The Liberal Democrats, now called the Libertarian Party.',

  'Centre Alliance':
    'Formerly the Nick Xenophon Team.',

  'Rex Patrick Team':
    'Party of former South Australian Senator Rex Patrick.',

  'Reason Australia':
    'Formerly the Australian Sex Party.',

  'Other / Minor Parties':
    'Registered parties that received less than $50,000 in disclosed donations over the period shown. They are grouped so the chart stays readable.',
};

export function getDonorInfo(name) {
  return DONOR_INFO[name] ?? null;
}

export function getPartyInfo(name) {
  return PARTY_INFO[name] ?? null;
}
