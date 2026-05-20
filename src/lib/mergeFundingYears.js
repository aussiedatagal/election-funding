/**
 * Merge per-year funding graph data (nodes + links) by entity name.
 * Node IDs differ between years; names are stable keys for aggregation.
 */
export function mergeYearDatasets(datasets) {
  if (!datasets?.length) {
    return { nodes: [], links: [] };
  }
  if (datasets.length === 1) {
    return datasets[0];
  }

  const nodeByName = new Map();

  for (const { nodes } of datasets) {
    for (const node of nodes) {
      if (!nodeByName.has(node.name)) {
        nodeByName.set(node.name, { ...node });
      }
    }
  }

  const nodes = [...nodeByName.values()].map((node, id) => ({ ...node, id }));
  const nameToId = new Map(nodes.map((n) => [n.name, n.id]));

  const linkTotals = new Map();

  for (const { nodes: yearNodes, links } of datasets) {
    const idToName = new Map(yearNodes.map((n) => [n.id, n.name]));
    for (const link of links) {
      const srcName = idToName.get(link.source);
      const tgtName = idToName.get(link.target);
      if (!srcName || !tgtName) continue;
      const key = `${srcName}\0${tgtName}`;
      linkTotals.set(key, (linkTotals.get(key) || 0) + link.value);
    }
  }

  const links = [...linkTotals.entries()].map(([key, value]) => {
    const [srcName, tgtName] = key.split('\0');
    return {
      source: nameToId.get(srcName),
      target: nameToId.get(tgtName),
      value,
    };
  });

  return { nodes, links };
}

/**
 * Resolve chart data for a set of selected financial years.
 */
export function getFundingForYears(fundingData, selectedYears) {
  const { years, byYear, combined } = fundingData;
  if (!selectedYears?.length) {
    return { nodes: [], links: [] };
  }
  if (selectedYears.length === years.length) {
    return combined;
  }
  if (selectedYears.length === 1) {
    return byYear[selectedYears[0]];
  }
  const datasets = selectedYears.map((y) => byYear[y]);
  return mergeYearDatasets(datasets);
}
