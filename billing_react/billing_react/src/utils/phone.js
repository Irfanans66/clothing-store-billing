// Indian mobile numbers: 10 digits starting 6–9. Accepts +91 / 91 / 0 prefixes and spaces.
export function normalizeIndianMobile(v) {
  let d = String(v || '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

// Number for https://wa.me/<number> — adds the 91 country code to Indian mobiles
export function whatsappNumber(v) {
  const m = normalizeIndianMobile(v)
  return m ? `91${m}` : String(v || '').replace(/\D/g, '')
}

// antd Form rule for a required Indian mobile number
export const indianMobileRule = {
  validator: (_, v) => (!v || normalizeIndianMobile(v)
    ? Promise.resolve()
    : Promise.reject(new Error('Enter a 10-digit mobile number (starts with 6–9)'))),
}
