// Lists app text that a language file doesn't translate yet.
//   node scripts/i18n-check.mjs        → summary for every language
//   node scripts/i18n-check.mjs hi     → the missing lines for Hindi
// Keys are the English text inside t('…') / translate('…') calls in src/.
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '../src')
const LOCALES = path.join(SRC, 'i18n/locales')
// Text that reaches t() through a variable (menus, roles, layouts, payment modes…)
const INDIRECT = [
  'Dashboard', 'New Bill', 'Bill History', 'Customers', 'Products', 'Barcode Labels', 'Reports', 'Team', 'Settings',
  'Help & Support', 'Help', 'History', 'Super Admin', 'Admin', 'Manager', 'Cashier', 'Viewer', 'Login', 'Register',
  'GST bills & printed receipts in seconds', 'Inventory with barcode labels', 'UPI payments with QR codes',
  'Sales reports and customer history', 'Works on phone, tablet and desktop', 'Store Name', 'Phone', 'Email', 'Address',
  'Username', 'Password', 'Thermal roll', 'Invoice (80 mm)', '58 mm roll', '80 mm roll', '80 mm bold', 'Sales invoice',
  'Dark header', 'Bill with logo', 'Tax invoice', 'Small thermal printers. Compact, with UPI QR.',
  'Standard thermal receipt. Most common.', 'Larger text and thicker lines, easier to read.',
  'Bordered, “You saved” box, barcode and points table.', 'Black header, per-item discount, amount in words.',
  'Your logo, totals box and footer bar.', 'GST breakdown table (CGST/SGST). Needs a GSTIN.', 'Store', 'UPI', 'Receipt',
  'Pay app', 'Payment app', 'Loyalty', 'Connecting to printer…', 'Printer ready', 'Printing…', 'Printer is off or too far',
  'Cash', 'Card', 'Split', 'Credit', 'Debit Card', 'Credit Card', 'Net Banking', 'Paid', 'Bill no', 'Date', 'Customer',
  'Discount', 'Points redeemed', 'Tax', 'Payment', 'Change given', 'Balance due', '{n} items', '{n} item', 'Pay later', 'Later',
  'Enter a valid 10-digit mobile number', 'Enter a valid phone number',
  'Printer is off or too far. Turn it on, bring it close and tap Retry.',
  // Later screens: periods, categories, label sizes/designs, ticket topics, statuses, export headers, tiers
  'Today', '7 days', '30 days', 'This year', 'Custom', 'vs yesterday', 'vs previous 7 days', 'vs previous 30 days',
  'vs previous period', 'Shirts', 'T-Shirts', 'Jeans', 'Trousers', 'Kurtis', 'Sarees', 'Lehenga', 'Jackets',
  'Sweaters', 'Suits', 'Kids Wear', 'Accessories', 'Other', 'Store name', 'Size', 'Colour', 'Category',
  'Offer price (MRP struck through)', '“Incl. of all taxes”', 'Label roll — 1 across', 'Label roll — 2 across',
  'A4 sheet — 65 labels (38.1 × 21.2 mm)', '50 × 25 mm (standard)', '50 × 30 mm', '38 × 25 mm (small)', '40 × 30 mm',
  '50.8 × 24.9 mm', '60 × 40 mm (large)', '100 × 50 mm (XL)', '25 × 50 mm (portrait)', 'Design 1 — Classic',
  'Design 2 — Size panel', 'Design 3 — Bold price', 'Design 4 — Size first', 'Billing', 'Printing', 'Payments',
  'Account', 'Open', 'In Progress', 'Resolved', 'Yesterday', 'This week', 'This month', 'Last month', 'All',
  'Cancelled', 'Credit (due)', 'Void', 'Returned', 'Partial Return', 'Time', 'Billed by', 'Status', 'Total', 'Due',
  'Cancel reason', 'Store Credit', 'Regular', 'Silver', 'Gold', 'Platinum', '10% off',
  'Tiers upgrade automatically: Silver from ₹10,000 spent, Gold from ₹25,000, Platinum from ₹50,000.',
  // Terms and Privacy titles and dates
  'Privacy Policy', 'Terms of Service', 'June 2026', 'July 2026', 'Last updated: {date}',
]

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) return d.name === 'locales' ? [] : walk(p)
    return /\.(jsx?|mjs)$/.test(d.name) ? [p] : []
  })
}

const keys = new Set(INDIRECT)
const ternary = /\b(?:t|translate)\(\s*[^'"`()\n]*(?:\([^()\n]*\)[^'"`()\n]*)*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g
const re = /\b(?:t|translate)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g
for (const f of walk(SRC)) {
  const src = fs.readFileSync(f, 'utf8')
  const unq = (k) => k.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c))
  for (const m of src.matchAll(re)) keys.add(unq(m[1] ?? m[2]))
  // t(n === 1 ? 'One {n} bill' : '{n} bills', …): both branches are keys
  for (const m of src.matchAll(ternary)) { keys.add(unq(m[1])); keys.add(unq(m[2])) }
}

const only = process.argv[2]
for (const file of fs.readdirSync(LOCALES).sort()) {
  const code = file.replace(/\.js$/, '')
  if (only && code !== only) continue
  const dict = (await import(path.join(LOCALES, file))).default
  const missing = [...keys].filter((k) => !(k in dict))
  const extra = Object.keys(dict).filter((k) => !keys.has(k))
  const badVars = Object.entries(dict).filter(([k, v]) =>
    JSON.stringify((k.match(/\{\w+\}/g) || []).sort()) !== JSON.stringify([...new Set(v.match(/\{\w+\}/g) || [])].sort())
    && JSON.stringify([...new Set(k.match(/\{\w+\}/g) || [])].sort()) !== JSON.stringify([...new Set(v.match(/\{\w+\}/g) || [])].sort()))
  console.log(`${code}: ${keys.size - missing.length}/${keys.size} translated` +
    (extra.length ? `, ${extra.length} unused` : '') + (badVars.length ? `, ${badVars.length} with wrong {placeholders}` : ''))
  if (only) {
    missing.forEach((k) => console.log('  missing:', k))
    extra.forEach((k) => console.log('  unused:', k))
    badVars.forEach(([k]) => console.log('  placeholders differ:', k))
  }
}
console.log(`(${keys.size} lines of app text use t() so far)`)
