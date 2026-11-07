export const PACKAGE_UNIT_PRICE = 35_000;
export function packagePrice(quantity: number) {
  return quantity === 1 ? PACKAGE_UNIT_PRICE : quantity * 30_000;
}
export function freePackages(quantity: number) {
  return Math.floor(quantity / 2);
}
