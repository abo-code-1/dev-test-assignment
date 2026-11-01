// @rev kc-31

// Мобильные коды Казахстана: 70x, 747, 75x, 76x, 77x. Городские 71x, 72x и прочие не подходят.
const MOBILE = /^(?:\+7|8|7)(7(?:0\d|47|[567]\d)\d{7})$/;

// Любая запись номера -> '+77012345678', либо null, если это не казахстанский мобильный
export function normalizePhone(raw: string): string | null {
  const match = raw.replace(/[\s()-]/g, '').match(MOBILE);
  return match ? `+7${match[1]}` : null;
}
