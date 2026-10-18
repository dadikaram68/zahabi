export function isLowStock(stockQuantity: number, threshold: number) {
  return stockQuantity < threshold;
}

export function getMovementResult(currentQuantity: number, type: "in" | "out", quantity: number) {
  if (!Number.isInteger(currentQuantity) || currentQuantity < 0) {
    throw new Error("الكمية الحالية غير صالحة");
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("كمية الحركة يجب أن تكون رقماً صحيحاً موجباً");
  }
  if (type === "out" && quantity > currentQuantity) {
    throw new Error("الكمية المتاحة لا تكفي لعملية الإخراج");
  }
  return type === "in" ? currentQuantity + quantity : currentQuantity - quantity;
}
