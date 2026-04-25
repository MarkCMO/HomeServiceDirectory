// trust-score.js - Provider Trust Score Calculator
// Scores providers 0-100 based on verifiable quality signals
// Used on listing cards and detail pages

function calculateTrustScore(provider) {
  let score = 0;

  // Licensing verified (25 pts)
  if (provider.licenseNumber) score += 25;

  // Insurance verified (20 pts)
  if (provider.insuranceInfo) score += 20;

  // Response time / 24x7 availability (15 pts)
  if (provider.is24x7) score += 15;
  else if (provider.serviceTypes && provider.serviceTypes.includes('emergency-24-7')) score += 15;

  // Reviews & rating (20 pts)
  if (provider.rating) {
    score += Math.min(Math.round(provider.rating * 3), 15); // Up to 15 pts for rating
    if (provider.reviewCount >= 5) score += 5; // 5 pts for having 5+ reviews
  }

  // Profile completeness (10 pts)
  let completeness = 0;
  if (provider.description && provider.description.length > 50) completeness += 2;
  if (provider.phone) completeness += 2;
  if (provider.website) completeness += 2;
  if (provider.address) completeness += 1;
  if (provider.categories && provider.categories.length > 0) completeness += 1;
  if (provider.serviceTypes && provider.serviceTypes.length > 0) completeness += 1;
  if (provider.zip) completeness += 1;
  score += Math.min(completeness, 10);

  // Years in business (10 pts)
  if (provider.yearsInBusiness) {
    if (provider.yearsInBusiness >= 20) score += 10;
    else if (provider.yearsInBusiness >= 10) score += 8;
    else if (provider.yearsInBusiness >= 5) score += 6;
    else if (provider.yearsInBusiness >= 2) score += 4;
    else score += 2;
  }

  return Math.min(score, 100);
}

function getTrustLevel(score) {
  if (score >= 75) return { label: 'Excellent', class: 'high', color: '#2ECC71' };
  if (score >= 50) return { label: 'Good', class: 'medium', color: '#F1C40F' };
  return { label: 'Basic', class: 'low', color: '#DC3545' };
}

function renderTrustBadge(provider) {
  var score = calculateTrustScore(provider);
  var level = getTrustLevel(score);
  return '<div class="trust-score">' +
    '<span style="color:' + level.color + ';">' + score + '</span>' +
    '<div class="score-bar"><div class="score-fill ' + level.class + '" style="width:' + score + '%;"></div></div>' +
    '<span style="font-size:0.75rem;color:var(--dark-gray);">' + level.label + '</span>' +
    '</div>';
}

if (typeof module !== 'undefined') module.exports = { calculateTrustScore, getTrustLevel };
