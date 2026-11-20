export function canAccessPurchasing(userId) {
  return userId === 'user-bertha' || userId === 'user-superadmin';
}
