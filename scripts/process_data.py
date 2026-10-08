#!/usr/bin/env python3
"""
Process AEC Annual Returns disclosure data into Sankey-ready JSON.

Source: https://transparency.aec.gov.au/Download/AllAnnualData
File: Detailed Receipts.csv
"""

import csv
import html
import json
import re
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "raw" / "annual_data"
OUT_DIR = Path(__file__).parent.parent / "src" / "data"

# --- Party family normalisation ----------------------------------------

PARTY_FAMILIES = {
    "Australian Labor Party": [
        "Australian Labor Party (ALP)",
        "Australian Labor Party (N.S.W. Branch)",
        "Australian Labor Party (State of Queensland)",
        "Australian Labor Party (Victorian Branch)",
        "Australian Labor Party (Western Australian Branch)",
        "Australian Labor Party (South Australian Branch)",
        "Australian Labor Party (Tasmanian Branch)",
        "Australian Labor Party (ACT Branch)",
        "Australian Labor Party (Northern Territory) Branch",
        "Country Labor Party",
    ],
    "Liberal-National Coalition": [
        "Liberal Party of Australia",
        "Liberal Party of Australia (Victorian Division)",
        "Liberal Party of Australia, NSW Division",
        "Liberal Party of Australia (S.A. Division)",
        "Liberal Party (W.A. Division) Inc",
        "Liberal Party of Australia - ACT Division",
        "Liberal Party of Australia - Tasmanian Division",
        "Liberal Party of Australia - Queensland Division",
        "National Party of Australia",
        "National Party of Australia - N.S.W.",
        "National Party of Australia - Victoria",
        "National Party of Australia (S.A.) Inc.",
        "National Party of Australia (WA) Inc",
        "National Party of Australia (Queensland)",
        "Liberal National Party of Queensland",
        "Country Liberal Party (NT)",
    ],
    "Australian Greens": [
        "Australian Greens",
        "Australian Greens Victoria",
        "The Australian Greens - Victoria",
        "Australian Greens Victoria",
        "The Greens NSW",
        "The Greens (WA) Inc",
        "Queensland Greens",
        "Australian Greens (South Australia)",
        "Australian Greens - SA",
        "Australian Greens, Tasmanian Branch",
        "Australian Greens, Australian Capital Territory Branch",
        "The ACT Greens - ACT",
        "Australian Greens (NT Branch)",
        "Australian Greens, Northern Territory Branch",
        "Australian Greens Queensland Branch",
        "Australian Greens, Victorian Branch",
    ],
    "Clive Palmer / UAP": [
        "United Australia Party",
        "Australian Federation Party",
        "Palmer United Party",
    ],
    "One Nation": [
        "Pauline Hanson's One Nation",
        "Pauline Hanson's One Nation - QLD",
        "Pauline Hanson's One Nation - WA",
        "Pauline's United Australia Party",
        "One Nation Queensland Division",
        "One Nation SA",
        "One Nation Victoria",
        "One Nation Western Australia",
    ],
    "Independents": [
        "David Pocock",
        "Local Network",
        "Kim for Canberra",
        "Independents CAN",
    ],
    "Jacqui Lambie Network": [
        "Jacqui Lambie Network",
    ],
    "Katter's Australian Party": [
        "Katter's Australian Party (KAP)",
    ],
    "Legalise Cannabis Australia": [
        "Legalise Cannabis Australia",
    ],
    "Animal Justice Party": [
        "Animal Justice Party",
    ],
    "Libertarian / Liberal Democrats": [
        "Liberal Democratic Party",
        "Liberal Democratic Party (NSW Branch)",
        "Liberal Democratic Party (QLD Branch)",
        "Liberal Democratic Party (SA Branch)",
        "Liberal Democratic Party (Victoria Branch)",
        "Liberal Democratic Party (WA Branch)",
        "Libertarian Party",
    ],
    "Shooters, Fishers and Farmers": [
        "Shooters, Fishers and Farmers Party",
    ],
    "Western Australia Party": [
        "WESTERN AUSTRALIA PARTY",
    ],
    "The Great Australian Party": [
        "The Great Australian Party",
        "Great Australian Party",
    ],
    "Australian Values Party": [
        "Australian Values Party",
        "Australian Values Party (AVP)",
    ],
    "Family First": [
        "Family First Party Australia",
        "Family First Party",
        "Family First Party - NSW",
        "Family First Party - QLD",
        "Family First Party - SA",
        "Family First Party - VIC",
    ],
    "Centre Alliance": [
        "Centre Alliance",
    ],
    "Christian Democratic Party": [
        "Christian Democratic Party (Fred Nile Group)",
        "Christian Democratic Party (Fred Nile Group) WA Branch",
    ],
    "Reason Australia": [
        "Reason Australia",
    ],
    "Victorian Socialists": [
        "Victorian Socialists",
    ],
    "Australian Citizens Party": [
        "Australian Citizens Party",
        "Citizens Electoral Council of Australia",
    ],
    "Rex Patrick Team": [
        "Rex Patrick Team",
    ],
    "Sustainable Australia": [
        "Affordable Housing Now - Sustainable Australia Party",
        "Sustainable Australia Party",
    ],
    "Australian Christians": [
        "Australian Christians",
    ],
}

# Build reverse lookup
_PARTY_TO_FAMILY: dict[str, str] = {}
for family, parties in PARTY_FAMILIES.items():
    for p in parties:
        _PARTY_TO_FAMILY[p.lower()] = family


def normalise_party(name: str) -> str:
    """Return the party family, or the original name if not in a known family."""
    return _PARTY_TO_FAMILY.get(name.strip().lower(), name.strip())


# --- Donor category classification ------------------------------------

DONOR_CATEGORY_KEYWORDS: list[tuple[str, list[str]]] = [
    ("Mining & Resources", [
        "mineralogy", "hancock prospecting", "adani", "bravus mining",
        "resources", "mining", "bhp", "rio tinto", "fortescue",
        "coal", "petroleum", "energy", "twiggy",
    ]),
    ("Unions", [
        "union", "workers", "etu", "cfmeu", "amu", "amwu", "plumbing and pipe",
        "nurses", "teachers", "firefighters", "police", "maritime",
        "transport workers", "shop distributive", "sda", "usu",
        "construction forestry", "electrical trades",
    ]),
    ("Property & Development", [
        "meriton", "pratt", "property", "construction", "real estate",
        "developer", "building", "realty",
    ]),
    ("Crossbench funds", [
        "climate 200", "regional voices fund", "vida impact fund",
        "keep them honest",
    ]),
    ("Finance & Investment", [
        "pty ltd", "investments", "capital", "holdings", "finance",
        "management", "nominees", "trust", "fund", "asset",
        "cormack", "oryxium", "stonehill", "sugolena",
    ]),
    ("Party fundraising", [
        "labor holdings", "labor services", "cormack foundation",
        "progressive business", "kooyong", "liberal", "national party",
        "labor party", "greens", "alp", "branch alp",
    ]),
]

DONOR_KNOWN: dict[str, str] = {
    "mineralogy pty ltd": "Mining & Resources",
    "mineralogy": "Mining & Resources",
    "hancock prospecting pty ltd": "Mining & Resources",
    "hancock prospecting": "Mining & Resources",
    "hancock prospecting group": "Mining & Resources",
    "adani mining pty ltd (t/a bravus mining and resources)": "Mining & Resources",
    "adani mining": "Mining & Resources",
    "mining and energy union": "Unions",
    "mining & energy union": "Unions",
    "united workers union": "Unions",
    "etu national office": "Unions",
    "cfmeu construction & general national office": "Unions",
    "shop, distributive & allied employees' association": "Unions",
    "shop distributive & allied employees association nat branch": "Unions",
    "cepu electrical division": "Unions",
    "cepu - electrical division qld & nt": "Unions",
    "communications, electrical and plumbing union - electrical, energy and services division": "Unions",
    "communications electrical electronic energy information postal plumbing and allied services union of australia electrical division queensland & northern territory divisional branch": "Unions",
    "health services union nsw": "Unions",
    "hsu - health services union- nsw": "Unions",
    "nsw local government clerical administrative energy airlines & utilities union": "Unions",
    "plumbing and pipe trades employees union": "Unions",
    "labor holdings pty ltd": "Party fundraising",
    "cormack foundation pty ltd": "Party fundraising",
    "cormack foundation pty limited": "Party fundraising",
    "cormack foundation": "Party fundraising",
    "kooyong 200 club": "Party fundraising",
    "labor services & holdings pty ltd atf labor services & holdings trust": "Party fundraising",
    "labor services & holding pty ltd atf the labor services and holding trust": "Party fundraising",
    "labor legacies pty ltd": "Party fundraising",
    "the australian labor party national secretariat": "Party fundraising",
    "sa porgressive business": "Party fundraising",
    "sa progressive business": "Party fundraising",
    "pratt holdings": "Property & Development",
    "pratt holdings pty ltd": "Property & Development",
    "pratt holdings pty limited": "Property & Development",
    "meriton property services": "Property & Development",
    "climate 200": "Crossbench funds",
    "climate 200 pty limited": "Crossbench funds",
    "lb conservation pty ltd": "Other companies",
    "lb conservation pty ltd atf lb conservation trust": "Other companies",
    "regional voices fund pty ltd": "Crossbench funds",
    "vida impact fund pty ltd": "Crossbench funds",
    "keep them honest pty ltd": "Crossbench funds",
    "duncan turpie": "Individual Donor",
    "oryxium investments limited": "Finance & Investment",
    "oryxium investments limited": "Finance & Investment",
    "stonehill nominees": "Finance & Investment",
    "vapold pty ltd": "Property & Development",
    "lgt crestone wealth management limited": "Finance & Investment",
    "sugolena holdings pty ltd": "Finance & Investment",
    "australian capital equity pty ltd": "Finance & Investment",
    "australian capital equity": "Finance & Investment",
    "fox group holdings pty ltd": "Finance & Investment",
    "fox group holdings": "Finance & Investment",
    "jefferson investments pty ltd": "Finance & Investment",
    "vapold pty ltd": "Property & Development",
    "doordash technologies australia pty ltd": "Other companies",
    "lgt crestone wealth management limited": "Finance & Investment",
    "heston russell": "Individual Donor",
    "angus aitken": "Individual Donor",
    "aitken, angus": "Individual Donor",
    "william henderson": "Individual Donor",
    "westreet investments": "Finance & Investment",
    "pam wall": "Individual Donor",
    "siddle, michael": "Individual Donor",
    "michael siddle": "Individual Donor",
    "mr ian wall am": "Individual Donor",
    "mrs pamela wall oam": "Individual Donor",
    "ian & pamela wall": "Individual Donor",
    "bill nitchke": "Individual Donor",
    "norman pater": "Individual Donor",
    "david walsh estate / douglas hoskins legal": "Individual Donor",
    "estate of the late david walsh": "Individual Donor",
    "transcendent australia": "Property & Development",
    "transcendent australia pty ltd": "Property & Development",
    "australian romance": "Other companies",
    "australian romance pty ltd": "Other companies",
    "msz australian romance": "Other companies",
}

# Party-internal transfer donors (state branches donating to national party)
INTERNAL_TRANSFER_DONORS = {
    "vic branch alp", "qld branch alp", "nsw branch alp", "sa branch alp",
    "wa branch alp", "tas branch alp", "nt branch alp",
    "australian greens",  # national donating to state branches
    "liberal national party of queensland",  # lnp sending to federal liberal/national
    "the australian labor party national secretariat",
    "alp national secretariat",
    "labor holdings pty ltd",
    "labor services & holdings pty ltd atf labor services & holdings trust",
    "labor services & holding pty ltd atf the labor services and holding trust",
    "labor legacies pty ltd",
    "pauline hanson's one nation - victoria",
    "pauline hanson's one nation victoria",
    "conservative political action network ltd",
}


def categorise_donor(name: str) -> str:
    low = name.strip().lower()

    # Check known lookup first
    if low in DONOR_KNOWN:
        return DONOR_KNOWN[low]

    # Keyword match
    for category, keywords in DONOR_CATEGORY_KEYWORDS:
        for kw in keywords:
            if kw in low:
                return category

    # Heuristic: if it contains a person-like name (no Pty Ltd etc.), call it Individual
    corporate_indicators = ["pty", "ltd", "pty ltd", "pty. ltd", "inc", "corp",
                            "foundation", "group", "association", "union",
                            "trust", "fund", "investments", "capital", "holdings"]
    if not any(ind in low for ind in corporate_indicators):
        # Likely an individual
        return "Individual Donor"

    return "Other companies"


# --- Donor name normalisation ----------------------------------------

DONOR_ALIASES: dict[str, str] = {
    "pratt holdings pty ltd": "Pratt Holdings",
    "pratt holdings pty limited": "Pratt Holdings",
    "pratt holdings": "Pratt Holdings",
    "hancock prospecting pty ltd": "Hancock Prospecting",
    "hancock prospecting group": "Hancock Prospecting",
    "hancock prospecting": "Hancock Prospecting",
    "mineralogy pty ltd": "Mineralogy Pty Ltd (Clive Palmer)",
    "mineralogy": "Mineralogy Pty Ltd (Clive Palmer)",
    "mining and energy union": "Mining & Energy Union",
    "mining & energy union": "Mining & Energy Union",
    "adani mining pty ltd (t/a bravus mining and resources)": "Adani / Bravus Mining",
    "adani mining": "Adani / Bravus Mining",
    "cormack foundation pty ltd": "Cormack Foundation",
    "cormack foundation pty limited": "Cormack Foundation",
    "cormack foundation": "Cormack Foundation",
    "shop, distributive & allied employees' association": "Shop Distributive & Allied Employees Union",
    "shop distributive & allied employees association nat branch": "Shop Distributive & Allied Employees Union",
    "shop distributive & allied employees association": "Shop Distributive & Allied Employees Union",
    "sda": "Shop Distributive & Allied Employees Union",
    "labor services & holdings pty ltd atf labor services & holdings trust": "Labor Services & Holdings",
    "labor services & holding pty ltd atf the labor services and holding trust": "Labor Services & Holdings",
    "oryxium investments limited": "Oryxium Investments",
    "oryxium investments limited": "Oryxium Investments",
    "sa porgressive business": "SA Progressive Business",
    "sa progressive business": "SA Progressive Business",
    "australian capital equity pty ltd": "Australian Capital Equity",
    "australian capital equity": "Australian Capital Equity",
    "fox group holdings pty ltd": "Fox Group Holdings",
    "fox group holdings": "Fox Group Holdings",
    "doordash technologies australia pty ltd": "DoorDash Technologies",
    "cfmeu construction & general national office": "CFMEU",
    "cfmeu": "CFMEU",
    "etu national office": "Electrical Trades Union (ETU)",
    "siddle, michael": "Michael Siddle",
    "vic branch alp": "VIC Branch ALP",
    "qld branch alp": "QLD Branch ALP",
    "stonehill nominees": "Stonehill Nominees",
    "sugolena holdings pty ltd": "Sugolena Holdings",
    "mr ian wall am": "Ian & Pamela Wall",
    "mrs pamela wall oam": "Ian & Pamela Wall",
    "mrs pamela wall oam ": "Ian & Pamela Wall",
    "angus aitken": "Angus Aitken",
    "aitken, angus": "Angus Aitken",
    "william henderson": "William Henderson",
    "westreet investments": "Westreet Investments",
    "heston russell": "Heston Russell",
    "bill nitchke": "Bill Nitchke",
    "norman pater": "Norman Pater",
    "david walsh estate / douglas hoskins legal": "Estate of David Walsh",
    "estate of the late david walsh": "Estate of David Walsh",
    "transcendent australia": "Transcendent Australia",
    "transcendent australia pty ltd": "Transcendent Australia",
    "transcendent australia (please see annotation note page 18)": "Transcendent Australia",
    "australian romance": "Australian Romance",
    "australian romance pty ltd": "Australian Romance",
    "msz australian romance": "Australian Romance",
    "siddle, michael": "Michael Siddle",
    "michael siddle": "Michael Siddle",
    "cepu electrical division": "CEPU Electrical Division",
    "cepu - electrical division qld & nt": "CEPU Electrical Division",
    "communications, electrical and plumbing union - electrical, energy and services division": "CEPU Electrical Division",
    "communications electrical electronic energy information postal plumbing and allied services union of australia electrical division queensland & northern territory divisional branch": "CEPU Electrical Division",
    "health services union nsw": "Health Services Union (NSW)",
    "hsu - health services union- nsw": "Health Services Union (NSW)",
    "nsw local government clerical administrative energy airlines & utilities union": "Local Govt Engineers Union NSW",
    "labor services & holding pty ltd atf the labor services and holding trust": "Labor Services & Holdings",
    "kooyong 200 club": "Kooyong 200 Club",
    "sa porgressive business": "SA Progressive Business",
    "meriton property services": "Meriton Property Services",
    "jefferson investments pty ltd": "Jefferson Investments",
    "jefferson investments": "Jefferson Investments",
    "the estate of alan kelvin harrison": "Estate of Alan Harrison",
    # Election-data variants
    "climate 200 pty limited": "Climate 200",
    "climate 200 pty ltd": "Climate 200",
    "climate 200": "Climate 200",
    "lb conservation pty ltd atf lb conservation trust": "LB Conservation Pty Ltd",
    "lb conservation pty ltd": "LB Conservation Pty Ltd",
    "pater, norman": "Norman Pater",
    "pater investments pty ltd": "Pater Investments",
    "keldoulis investments pty limited": "Keldoulis Investments Pty Limited",
    "keldoulis, robert": "Robert Keldoulis",
    "regional voices fund pty ltd": "Regional Voices Fund",
    "vida impact fund pty ltd": "VIDA Impact Fund",
    "keep them honest pty ltd": "Keep Them Honest Pty Ltd",
    "william taylor nominees pty ltd": "William Taylor Nominees Pty Ltd",
}


def clean_name(name: str) -> str:
    # Some AEC names contain HTML entities (&amp;) and doubled spaces
    return re.sub(r'\s+', ' ', html.unescape(name)).strip()


def normalise_donor(name: str) -> str:
    cleaned = clean_name(name)
    return DONOR_ALIASES.get(cleaned.lower(), cleaned)


# --- Main processing --------------------------------------------------

RECENT_YEARS = {
    "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25",
}

ELECTION_DATA_DIR = DATA_DIR.parent / "election_data"

# Maps AEC election event name → financial year bucket
ELECTION_TO_YEAR = {
    "2025 Federal Election": "2024-25",
    "2022 Federal election": "2021-22",
    "2019 Federal election": "2019-20",
}

# Party names that mean "not affiliated" in election returns. These candidates
# are grouped as Independents. Most of the money goes to Climate 200-backed
# candidates, but not all (e.g. Dai Le, Andrew Gee), so no teal label.
_INDEPENDENT_LABELS = {"independent", "unendorsed", ""}

# Normalise year string format
def normalise_year(y: str) -> str:
    y = y.strip()
    # "2024-25" is fine; "2019-2020" → "2019-20"
    if len(y) == 9 and y[4] == '-':
        return y
    if len(y) == 7 and y[4] == '-':
        return y
    # Legacy format like "2011-12"
    return y


def is_internal_transfer(donor: str, recipient_family: str) -> bool:
    low = clean_name(donor).lower()

    if low in INTERNAL_TRANSFER_DONORS:
        return True

    # State branch patterns
    if re.search(r'\bvic branch\b|\bqld branch\b|\bnsw branch\b', low):
        return True
    if "pauline hanson's one nation" in low and ('victoria' in low or 'vic' in low):
        return True

    # Party bodies donating to their own branches
    _party_prefixes = (
        "liberal party", "national party", "australian labor party",
        "australian greens", "lnp nominees", "liberal national party",
        "country liberal party",
    )
    if any(low.startswith(p) for p in _party_prefixes):
        return True

    return False


def load_election_donations() -> tuple[dict, dict]:
    """
    Load candidate/senate-group election donations and roll them up to party families.

    Returns the same (data, donor_categories) shape as the annual processing so
    the two can be merged directly.  Election year → financial year via ELECTION_TO_YEAR.
    Candidates without a registered party are grouped as 'Independents'.
    """
    summary_path = ELECTION_DATA_DIR / "Senate Groups and Candidate Return Summary.csv"
    donations_path = ELECTION_DATA_DIR / "Senate Groups and Candidate Donations.csv"

    if not donations_path.exists():
        return {}, {}

    # Build (event, candidate_name) → party_family from the return summary
    cand_family: dict[tuple[str, str], str] = {}
    if summary_path.exists():
        with open(summary_path, encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                event = row["Event"]
                if event not in ELECTION_TO_YEAR:
                    continue
                raw_party = row["Party Name"].strip()
                if raw_party.lower() in _INDEPENDENT_LABELS:
                    family = "Independents"
                else:
                    family = normalise_party(raw_party)
                cand_family[(event, row["Name"])] = family

    data: dict[str, dict[tuple[str, str], float]] = defaultdict(lambda: defaultdict(float))
    donor_categories: dict[str, str] = {}

    with open(donations_path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            event = row["Event"]
            if event not in ELECTION_TO_YEAR:
                continue

            try:
                value = float(row["Gift Value"])
            except (ValueError, TypeError):
                continue
            if value <= 0:
                continue

            year = ELECTION_TO_YEAR[event]
            raw_donor = row["Donor Name"].strip()
            donor = normalise_donor(raw_donor)
            party_family = cand_family.get((event, row["Name"]), "Other / Minor Parties")

            # Skip party self-funding (party donating to its own candidates)
            donor_as_party = normalise_party(raw_donor)
            if (donor_as_party == party_family
                    and donor_as_party not in ("Other / Minor Parties", "Independents")):
                continue

            # Skip electoral commission / government payments
            dn_lower = re.sub(r'\s+', ' ', raw_donor.lower()).strip()
            if "electoral commission" in dn_lower or "department of finance" in dn_lower:
                continue

            data[year][(donor, party_family)] += value
            if donor not in donor_categories:
                donor_categories[donor] = categorise_donor(raw_donor)

    return data, donor_categories


def load_receipts() -> list[dict]:
    path = DATA_DIR / "Detailed Receipts.csv"
    rows = []
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def process() -> dict:
    rows = load_receipts()

    # year → (donor_norm, party_family) → total_value
    data: dict[str, dict[tuple[str, str], float]] = defaultdict(lambda: defaultdict(float))
    donor_categories: dict[str, str] = {}

    for row in rows:
        if row["Return Type"] != "Political Party Return":
            continue
        # Only explicit donations — "Other Receipt" includes bank transactions,
        # commercial income and loans which would misrepresent the donor landscape.
        if row["Receipt Type"] != "Donation Received":
            continue

        year = normalise_year(row["Financial Year"])
        if year not in RECENT_YEARS:
            continue

        raw_donor = row["Received From"].strip()
        raw_party = row["Recipient Name"].strip()

        donor = normalise_donor(raw_donor)
        party_family = normalise_party(raw_party)

        # Skip internal transfers (confuses the picture)
        if is_internal_transfer(raw_donor, party_family):
            continue

        # Skip public / government funding
        _dn_lower = raw_donor.strip().lower()
        if "electoral commission" in _dn_lower:
            continue
        if "taxation office" in _dn_lower or "tax office" in _dn_lower:
            continue
        if _dn_lower in ("ato", "ato gst", "ato refund"):
            continue
        if "department of finance" in _dn_lower:
            continue
        if "legislative assembly" in _dn_lower:
            continue
        if "parliament" in _dn_lower and "house" in _dn_lower:
            continue
        if "state revenue office" in _dn_lower:
            continue

        try:
            value = float(row["Value"])
        except (ValueError, TypeError):
            continue

        if value <= 0:
            continue

        data[year][(donor, party_family)] += value
        if donor not in donor_categories:
            donor_categories[donor] = categorise_donor(raw_donor)

    # Merge election campaign donations
    elec_data, elec_cats = load_election_donations()
    for year, year_data in elec_data.items():
        for key, val in year_data.items():
            data[year][key] += val
    for donor, cat in elec_cats.items():
        if donor not in donor_categories:
            donor_categories[donor] = cat

    return data, donor_categories


PARTY_ORDER_LIST = [
    # Left / progressive
    "Australian Labor Party",           # 0
    "Victorian Socialists",             # 1
    "Australian Greens",                # 2
    "Independents",      # 3
    "Reason Australia",                 # 4
    "Centre Alliance",                  # 5
    "Sustainable Australia",            # 6
    "Animal Justice Party",             # 7
    "Legalise Cannabis Australia",      # 8
    "Jacqui Lambie Network",            # 9
    "Rex Patrick Team",                 # 10
    # Crossbench / rural right (these share donors with Coalition)
    "Katter's Australian Party",        # 11
    "Shooters, Fishers and Farmers",    # 12
    # Centre-right anchor
    "Liberal-National Coalition",       # 13
    # Right / conservative (placed AFTER Coalition so they cluster below it)
    "One Nation",                       # 14
    "Western Australia Party",          # 15
    "Christian Democratic Party",       # 16
    "Australian Christians",            # 17
    "Family First",                     # 18
    "Libertarian / Liberal Democrats",  # 19
    # Far right / self-funded
    "The Great Australian Party",       # 20
    "Australian Values Party",          # 21
    "Australian Citizens Party",        # 22
    "Clive Palmer / UAP",               # 23
    "Other / Minor Parties",            # 24
]


def _primary_party(party_distribution: dict[str, float]) -> str:
    """Return the party family that received the most from a given source."""
    if not party_distribution:
        return "Other / Minor Parties"
    return max(party_distribution.items(), key=lambda x: x[1])[0]


def _party_order_index(party: str) -> int:
    try:
        return PARTY_ORDER_LIST.index(party)
    except ValueError:
        return 99


def compute_positions_data_driven(
    year_data: dict[tuple[str, str], float],
    shown_parties: set[str],
    donor_categories: dict[str, str],
    n_iter: int = 200,
) -> tuple[dict[str, float], dict[str, float]]:
    """
    Compute 1D sort positions for parties and donors using only donation data.

    Algorithm:
      1. Anchor ALP=0, Coalition=1.  No other political assumptions.
      2. Iterate (barycentric method):
           donor_pos  = weighted avg of their parties' positions
           party_pos  = weighted avg of their donors' positions
         This pulls parties with shared donors toward each other naturally.
      3. Isolated parties (all donors exclusive to them) fall back to the
         *category lean* of their donors — the lean is itself derived from
         connected donors in the same category, not from any political claim.

    Returns (party_pos, donor_pos) scaled to 0–24.
    """
    party_donors: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    donor_parties: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for (donor, party), val in year_data.items():
        if party in shown_parties:
            party_donors[party][donor] += val
            donor_parties[donor][party] += val

    all_donors = set(donor_parties.keys())
    ALP = "Australian Labor Party"
    COALITION = "Liberal-National Coalition"

    # Initial: anchors at 0/1, everything else at midpoint
    party_pos: dict[str, float] = {p: 0.5 for p in shown_parties}
    party_pos[ALP] = 0.0
    if COALITION in shown_parties:
        party_pos[COALITION] = 1.0
    donor_pos: dict[str, float] = {d: 0.5 for d in all_donors}

    for _ in range(n_iter):
        # Donors → weighted average of their parties' current positions
        new_d: dict[str, float] = {}
        for d in all_donors:
            parties_here = {p: v for p, v in donor_parties[d].items() if p in shown_parties}
            total = sum(parties_here.values())
            new_d[d] = (
                sum(party_pos[p] * v / total for p, v in parties_here.items())
                if total else donor_pos[d]
            )
        donor_pos = new_d

        # Parties → weighted average of their donors' current positions (anchors fixed)
        new_p = dict(party_pos)
        for p in shown_parties:
            if p in (ALP, COALITION):
                continue
            donors = party_donors.get(p, {})
            total = sum(donors.values())
            if total:
                new_p[p] = sum(donor_pos.get(d, 0.5) * v / total for d, v in donors.items())
        new_p[ALP] = 0.0
        if COALITION in new_p:
            new_p[COALITION] = 1.0
        party_pos = new_p

    # --- Isolated party fallback: category lean from CONNECTED donors ---
    # "Connected" = a donor that gives to 2+ shown parties (has real positional signal).
    # Their converged donor_pos informs what a category lean means in this dataset.
    cat_entries: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for d in all_donors:
        shown = {p for p in donor_parties[d] if p in shown_parties}
        if len(shown) > 1:
            cat = donor_categories.get(d, "Other companies")
            total = sum(v for p, v in donor_parties[d].items() if p in shown_parties)
            cat_entries[cat].append((donor_pos[d], total))

    category_lean: dict[str, float] = {}
    for cat, entries in cat_entries.items():
        total_w = sum(w for _, w in entries)
        category_lean[cat] = sum(pos * w / total_w for pos, w in entries) if total_w else 0.5

    for p in shown_parties:
        if p in (ALP, COALITION):
            continue
        donors = party_donors.get(p, {})
        is_isolated = all(
            len({q for q in donor_parties.get(d, {}) if q in shown_parties}) <= 1
            for d in donors
        )
        if is_isolated and donors:
            total = sum(donors.values())
            est = sum(
                category_lean.get(donor_categories.get(d, "Other companies"), 0.5) * v / total
                for d, v in donors.items()
            )
            party_pos[p] = est

    # --- Rank-based normalization (preserves data-driven ORDER, fixes compression) ---
    # Raw converged values determine ORDER only; evenly-spaced ranks give visual breathing room.
    sorted_parties = sorted(party_pos.items(), key=lambda x: x[1])
    n = len(sorted_parties)
    party_pos = {p: i * 24.0 / max(n - 1, 1) for i, (p, _) in enumerate(sorted_parties)}

    # Recompute donor positions as weighted avg of their parties' new rank-based positions.
    new_d: dict[str, float] = {}
    for d in all_donors:
        parties_here = {p: v for p, v in donor_parties[d].items() if p in shown_parties}
        total = sum(parties_here.values())
        new_d[d] = (
            sum(party_pos[p] * v / total for p, v in parties_here.items())
            if total else 12.0
        )
    donor_pos = new_d

    return party_pos, donor_pos


def build_sankey(year_data: dict[tuple[str, str], float],
                 donor_categories: dict[str, str],
                 top_n: int = 40) -> dict:
    """
    Build nodes + links for a single year (or combined) dataset.

    The top `top_n` donors by total value get their own named node.
    Everything else is bucketed into "Other (<Category>)" group nodes that
    carry a `members` list so the UI can display all donors within on hover.
    """
    # --- Aggregate donor totals and per-party breakdown ---
    donor_totals: dict[str, float] = defaultdict(float)
    donor_by_party: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for (donor, party_family), val in year_data.items():
        donor_totals[donor] += val
        donor_by_party[donor][party_family] += val

    # Top-N by total value get their own node; everything else is grouped.
    sorted_donors = sorted(donor_totals.items(), key=lambda x: -x[1])
    shown_donors = {d for d, _ in sorted_donors[:top_n]}

    # --- Determine which parties get their own node ---
    party_totals: dict[str, float] = defaultdict(float)
    for (_donor, party_family), val in year_data.items():
        party_totals[party_family] += val

    # Any party receiving $50K+ in disclosed donations gets its own node.
    min_party_value = 50_000
    shown_parties = {p for p, v in party_totals.items() if v >= min_party_value}

    # Per-party guarantee: each shown party gets at least its top-3 named donors.
    # Without this, parties with only small donors (e.g. One Nation) show as islands.
    party_donor_totals: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for (donor, party_family), val in year_data.items():
        party_donor_totals[party_family][donor] += val

    for party in shown_parties:
        top3 = sorted(party_donor_totals.get(party, {}).items(), key=lambda x: -x[1])[:3]
        shown_donors.update(d for d, _ in top3)

    # --- Build final links and collect group members ---
    final_links: dict[tuple[str, str], float] = defaultdict(float)
    # group_name → donor → {party → value}
    group_members_by_party: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(float))
    )

    for (donor, party_family), val in year_data.items():
        # Donor side
        if donor in shown_donors:
            source = donor
        else:
            cat = donor_categories.get(donor, "Other companies")
            source = f"Other ({cat})"
            group_members_by_party[source][donor][party_family] += val

        # Party side
        target = party_family if party_family in shown_parties else "Other / Minor Parties"

        final_links[(source, target)] += val

    # Build sorted members list for each group (top donors first)
    group_members: dict[str, list] = {}
    for group_name, members_dict in group_members_by_party.items():
        members_list = sorted(
            [
                {
                    "name": donor,
                    "total": round(sum(pv.values())),
                    "primaryParty": _primary_party(pv),
                }
                for donor, pv in members_dict.items()
            ],
            key=lambda x: -x["total"],
        )
        group_members[group_name] = members_list

    # --- Compute primary party for each donor/group source ---
    source_party_totals: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for (source, party_family), val in final_links.items():
        source_party_totals[source][party_family] += val

    # --- Data-driven 1D positions ---
    # Party and donor positions emerge purely from who-pays-whom.
    # Only anchors are ALP=0 and Coalition=1; everything else is data.
    party_pos, donor_pos = compute_positions_data_driven(
        year_data, shown_parties, donor_categories
    )

    # "Other / Minor Parties" catch-all: position from its donors' converged positions
    minor_donors: dict[str, float] = defaultdict(float)
    for (donor, party), val in year_data.items():
        if party not in shown_parties:
            minor_donors[donor] += val
    total_minor = sum(minor_donors.values())
    party_pos["Other / Minor Parties"] = (
        sum(donor_pos.get(d, 12.0) * v / total_minor for d, v in minor_donors.items())
        if total_minor else 24.0
    )

    # Donor-group sort key: weighted average of their members' converged donor positions
    def group_sort_key(group_name: str) -> float:
        members = group_members_by_party.get(group_name, {})
        total_w = sum(sum(pv.values()) for pv in members.values())
        if not total_w:
            return 12.0
        return sum(
            donor_pos.get(d, 12.0) * sum(pv.values()) / total_w
            for d, pv in members.items()
        )

    def source_sort_key(s: str) -> float:
        return group_sort_key(s) if s.startswith("Other (") else donor_pos.get(s, 12.0)

    # --- Order targets and sources by data-driven positions ---
    targets = sorted(
        {t for _, t in final_links},
        key=lambda t: party_pos.get(t, 12.0),
    )
    sources = sorted(
        {s for s, _ in final_links},
        key=source_sort_key,
    )

    all_nodes = sources + targets
    node_index = {n: i for i, n in enumerate(all_nodes)}

    nodes = []
    for name in all_nodes:
        is_party = name in targets
        if is_party:
            node_obj: dict = {
                "id": node_index[name],
                "name": name,
                "type": "party",
                "category": name,
                "primaryParty": name,
                "sortKey": party_pos.get(name, 12.0),
            }
        elif name.startswith("Other ("):
            cat = name[len("Other ("):-1]
            primary = _primary_party(source_party_totals[name])
            node_obj = {
                "id": node_index[name],
                "name": name,
                "type": "donor_group",
                "category": cat,
                "primaryParty": primary,
                "sortKey": group_sort_key(name),
                "members": group_members.get(name, []),
            }
        else:
            primary = _primary_party(donor_by_party[name])
            node_obj = {
                "id": node_index[name],
                "name": name,
                "type": "donor",
                "category": donor_categories.get(name, "Other companies"),
                "primaryParty": primary,
                "sortKey": donor_pos.get(name, 12.0),
            }
        nodes.append(node_obj)

    links = []
    for (source, target), value in sorted(final_links.items(), key=lambda x: -x[1]):
        if value < 1000:
            continue
        links.append({
            "source": node_index[source],
            "target": node_index[target],
            "value": round(value),
        })

    return {"nodes": nodes, "links": links}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading receipts...")
    data, donor_categories = process()

    # Per-year Sankey data
    years = sorted(data.keys())
    print(f"Years found: {years}")

    by_year = {}
    for year in years:
        sankey = build_sankey(data[year], donor_categories, top_n=40)
        by_year[year] = sankey
        total = sum(v for v in data[year].values())
        print(f"  {year}: {len(sankey['nodes'])} nodes, {len(sankey['links'])} links, "
              f"${total:,.0f} total")

    combined_data: dict[tuple[str, str], float] = defaultdict(float)
    for year_d in data.values():
        for key, val in year_d.items():
            combined_data[key] += val
    combined = build_sankey(combined_data, donor_categories, top_n=50)
    total = sum(v for v in combined_data.values())
    print(f"  Combined: {len(combined['nodes'])} nodes, {len(combined['links'])} links, "
          f"${total:,.0f} total")

    out = {
        "years": years,
        "byYear": by_year,
        "combined": combined,
        "donorCategories": donor_categories,
        "dataSource": "Australian Electoral Commission Transparency Register",
        "dataUrl": "https://transparency.aec.gov.au/Download",
        "notes": (
            "Combines two AEC disclosure streams: (1) 'Donation Received' entries from "
            "Political Party Annual Returns (financial years 2019-20 to 2024-25), and "
            "(2) candidate and senate-group election donations from the 2019, 2022 and "
            "2025 federal elections, mapped to the corresponding financial year. "
            "'Other Receipt' items (bank transactions, commercial income, loans) are excluded. "
            "Public funding, tax refunds, and intra-party transfers are excluded. "
            "Candidates without a registered party are grouped as 'Independents'. "
            "Donor names have been normalised where multiple spellings exist in the AEC data. "
            "Annual data current to 2024-25 (published February 2026). "
            "Donations made after June 2025 are not yet in this dataset."
        ),
    }

    out_path = OUT_DIR / "funding.json"
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"\nWrote {out_path} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
