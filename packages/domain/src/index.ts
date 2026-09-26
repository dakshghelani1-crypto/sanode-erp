export const EXPIRY_WARNING_DAYS = 90;

export type DispatchChannel = 'COMMERCIAL_SALE' | 'MR_SAMPLE' | 'FREE_GOODS';

export function boxesToStrips(boxes: number, stripsPerBox: number): number {
  if (!Number.isInteger(boxes) || boxes < 0 || !Number.isInteger(stripsPerBox) || stripsPerBox < 1) {
    throw new Error('Boxes and strips per box must be positive whole numbers.');
  }
  return boxes * stripsPerBox;
}

export function isNearExpiry(expiryDate: Date, now = new Date()): boolean {
  const difference = expiryDate.getTime() - now.getTime();
  return difference >= 0 && difference <= EXPIRY_WARNING_DAYS * 86_400_000;
}
