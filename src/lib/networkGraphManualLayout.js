/**
 * Hand-placed party anchors — iteratively tuned for readability.
 */
export const MANUAL_PARTY_POSITIONS = {
  // Major parties (top row — wider gap between Labor and Coalition)
  'Australian Labor Party': { x: -520, y: -220 },
  'Liberal-National Coalition': { x: 200, y: -220 },
  'Clive Palmer / UAP': { x: 620, y: -220 },

  // Labor-aligned cluster (left, more vertical spread)
  'Independents': { x: -320, y: -80 },
  'Jacqui Lambie Network': { x: -640, y: 40 },
  'Sustainable Australia': { x: -200, y: 100 },
  'Australian Greens': { x: -480, y: 200 },
  'Rex Patrick Team': { x: -600, y: 240 },
  'Reason Australia': { x: -340, y: 320 },
  'Centre Alliance': { x: -60, y: 300 },

  // Right bloc
  'Libertarian / Liberal Democrats': { x: 500, y: 60 },
  'One Nation': { x: 680, y: 160 },

  // Minor parties — two spaced rows
  'The Great Australian Party': { x: -400, y: 450 },
  'Legalise Cannabis Australia': { x: -220, y: 430 },
  'Australian Citizens Party': { x: -40, y: 440 },
  'Katter\'s Australian Party': { x: 180, y: 450 },
  'Shooters, Fishers and Farmers': { x: 360, y: 430 },
  'Animal Justice Party': { x: 540, y: 450 },
  'Family First': { x: 100, y: 590 },
  'Christian Democratic Party': { x: -180, y: 580 },
  'Australian Christians': { x: 300, y: 580 },
  'Australian Values Party': { x: 480, y: 570 },
  'Western Australia Party': { x: 680, y: 490 },
};

/**
 * Exact positions for multi-party bridge donors and other nodes that
 * arc placement leaves in crossing zones. Applied after relaxation.
 */
export const HAND_DONOR_POSITIONS = {
  // Labor ↔ Coalition — lifted above the party row
  'Pratt Holdings': { x: -80, y: -400 },
  'Australian Capital Equity': { x: -180, y: -405 },
  'Fox Group Holdings': { x: 275, y: -495 },
  'Minerals Council of Australia': { x: 385, y: -430 },

  // Coalition donor arc — hand-spaced semicircle
  'Greenfields Foundation': { x: 25, y: -400 },
  'DoorDash Technologies': { x: 55, y: -375 },
  'GSA Capital Pty Ltd': { x: 85, y: -430 },
  'Hancock Prospecting': { x: 125, y: -450 },
  'Holypeak Pty Ltd': { x: 165, y: -445 },
  'Ian & Pamela Wall': { x: 200, y: -460 },
  'Jefferson Investments': { x: 190, y: -495 },
  'John McEwen House Pty Ltd': { x: 285, y: -440 },
  'Kooyong 200 Club': { x: 320, y: -415 },
  'Meriton Property Services': { x: 345, y: -450 },
  'Michael Siddle': { x: 385, y: -385 },
  'Oryxium Investments': { x: 425, y: -405 },
  'Pam Wall': { x: 450, y: -370 },
  'Sugolena Holdings': { x: 490, y: -350 },
  'The Greenfields Foundation': { x: 455, y: -300 },
  'The Trustee for the National Policy Forum Trust': { x: 450, y: -255 },
  'Transcendent Australia': { x: 440, y: -210 },
  'Cormack Foundation': { x: 400, y: -175 },

  // Labor ↔ minor-party bridges
  'Keep Them Honest Pty Ltd': { x: -400, y: -160 },
  'CFMEU': { x: -540, y: -320 },
  'CEPU Electrical Division': { x: -500, y: 40 },
  'Electrical Trades Union': { x: -470, y: 120 },
  'Climate 200': { x: -380, y: -230 },
  'Climate 200 Pty Ltd': { x: -300, y: -200 },
  'Murray Haseler': { x: -370, y: 40 },
  'Sally Perini': { x: -420, y: 250 },
  'Ian Melrose': { x: -590, y: 100 },
  'Pickard Capital Pty Ltd': { x: -570, y: -70 },

  // Coalition ↔ right / minor
  'Angus Aitken': { x: 520, y: 10 },
  'Adani Mining Pty Ltd': { x: 260, y: 50 },
  'Mineralogy Pty Ltd (Clive Palmer)': { x: 650, y: -100 },
  'William Henderson': { x: 590, y: 160 },

  // Bottom shared donors
  'Alan Hastings Magnusson': { x: -210, y: -120 },
  'Graham V Butler': { x: -180, y: -100 },
  'Keldoulis Investments Pty Limited': { x: -160, y: 270 },
  'Green Australia Wholesale Pty Ltd': { x: -230, y: 275 },
  'Robert Bone': { x: 20, y: 280 },
  'Firearms Dealers Association Qld Inc.': { x: 170, y: 290 },
  'Sporting Shooters Association of Australia (QLD) Inc.': { x: 240, y: 300 },
  'Federation Of Hunting Clubs Inc': { x: 390, y: 280 },
  'Federation of Hunting Clubs Inc': { x: 360, y: 310 },
  'Wren Oils': { x: -250, y: 390 },
};

/** Fine nudges applied after arc placement (name → offset). */
export const HAND_NODE_NUDGES = {
  'Health Services Union (NSW)': { x: -30, y: -20 },
  'Electrical Trades Union (ETU)': { x: -25, y: -15 },
  'Australian Manufacturing Workers  Union': { x: -20, y: -10 },
  'Labor Services &amp;  Holding Pty Ltd ATF the Labor Services and Holding Trust': { x: 15, y: 10 },
  'Local Govt Engineers Union NSW': { x: 20, y: -5 },
  'SDA': { x: 15, y: -25 },
  'SDA NSW - SHOP, DISTRIBUTIVE ALLIED EMPLOYEES\' ASS NSWBranch': { x: -15, y: -20 },
  'Shop Distributive & Allied Employees Union': { x: 10, y: 15 },
  'SHOP DISTRIBUTIVE & ALLIED EMPLOYEES ASSOCIATION': { x: -10, y: 10 },
  'Estate of Alan Harrison': { x: 15, y: 20 },
  'James Taylor': { x: -20, y: -25 },
  'William Taylor Nominees Pty Ltd': { x: -15, y: -25 },
  'Estate of David Walsh': { x: -25, y: -30 },
  'LB Conservation Pty Ltd': { x: -35, y: -35 },
  'Turner Components Pty Ltd': { x: 15, y: -20 },
  'Clive Frederick Palmer': { x: 0, y: -10 },
  'Plumbing and Pipe Trades Employees Union': { x: 10, y: 15 },
  'Bradley Chesworth': { x: -20, y: 0 },
  'Rebecca Pizzey': { x: 15, y: -10 },
  'Centre Alliance': { x: 0, y: 15 },
  'Australian Citizens Party': { x: -20, y: 0 },
  'Animal Justice Party': { x: 0, y: -15 },
};
