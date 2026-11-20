export const recommendationStatuses = ['Urgent', 'Reorder Soon', 'Healthy', 'Data Issues'];

export function sameUnit(purchasingUnit, baseUnit) {
  const normalize = (value) => String(value || '').trim().toUpperCase();
  return !!normalize(purchasingUnit) && normalize(purchasingUnit) === normalize(baseUnit);
}

export function unitConversionIssue(purchasingUnit, baseUnit, conversionQty) {
  if (!purchasingUnit || !baseUnit) return 'Choose both a purchasing unit and a base unit.';
  const conversion = Number(conversionQty);
  if (!Number.isFinite(conversion) || conversion <= 0) return 'Enter a positive base-unit conversion.';
  if (sameUnit(purchasingUnit, baseUnit) && conversion !== 1) {
    return 'When purchasing and base units are the same, one purchasing unit equals one base unit.';
  }
  return '';
}

export function recommendationGroup(row, coverage, today) {
  const recommendations = coverage === 'both' ? [row.recommendation7, row.recommendation10]
    : [coverage === '10' ? row.recommendation10 : row.recommendation7];
  if (row.reason || row.unitIssue || recommendations.some((item) => !item)) return 'Data Issues';
  const needsOrder = recommendations.some((item) => item.orderQty > 0);
  if ((row.daysLeft != null && row.daysLeft < 7) ||
      (needsOrder && row.recommendedReorderDate && row.recommendedReorderDate <= today)) return 'Urgent';
  if (needsOrder || (row.daysLeft != null && row.daysLeft <= 14)) return 'Reorder Soon';
  return 'Healthy';
}

export function matchesRecommendationStatus(row, status, coverage, today) {
  return status === 'all' || recommendationGroup(row, coverage, today) === status;
}
