// Fabric GSM values transcribed from every product-category sheet in the
// supplied DIGI workbook (货盘表.xlsx). These are a fallback for live supplier
// styles that are not present in the managed `styles` catalog yet.
export const DIGI_FABRIC_WEIGHT_GSM = Object.freeze({
  DG001: 180,
  DG004: 210,
  DG013: 230,
  C1717: 207,
  DG015: 180,
  DG017: 180,
  DG100: 180,
  DG110: 180,
  DG150: 180,
  DG101: 180,
  DG120: 180,
  VS001: 180,
  VS002: 180,
  VS004: 180,
  VS003: 210,
  DG012: 180,
  DG014: 190,
  DG301: 190,
  DG302: 190,
  '5000B': 180,
  DG503: 190,
  DG504: 280,
  DG201: 290,
  DG202: 260,
  DG203: 240,
  DG204: 190,
  DG210: 280,
  DG205: 180,
  DG206: 240,
  DF009: 270,
  DG501: 240,
  DG502: 180,
  '18500': 270,
  '18000': 270,
  DG505: 180,
  DF008: 260,
  DF010: 400,
  DG601: 180,
  DG701: 170,
});

// Some live supplier names include the GSM even before that style has been
// added to the managed catalog (for example, "德国250G连帽卫衣").
export function fabricWeightGsmForStyle(styleCode, ...names) {
  const workbookWeight = DIGI_FABRIC_WEIGHT_GSM[String(styleCode || '').trim().toUpperCase()];
  if (workbookWeight != null) return workbookWeight;

  for (const name of names) {
    const match = String(name || '').match(/(?:^|[^\d.])(\d{2,3}(?:\.\d+)?)\s*(?:gsm|g)(?=$|[^a-z])/i);
    if (match) return Number(match[1]);
  }
  return null;
}
