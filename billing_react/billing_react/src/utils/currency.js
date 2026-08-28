import { useAuthStore } from '../store/authStore'

export const COUNTRIES = [
  { name: 'India',                code: 'IN', currency: 'INR', symbol: '₹'   },
  { name: 'United States',        code: 'US', currency: 'USD', symbol: '$'   },
  { name: 'United Kingdom',       code: 'GB', currency: 'GBP', symbol: '£'   },
  { name: 'European Union',       code: 'EU', currency: 'EUR', symbol: '€'   },
  { name: 'United Arab Emirates', code: 'AE', currency: 'AED', symbol: 'AED' },
  { name: 'Saudi Arabia',         code: 'SA', currency: 'SAR', symbol: 'SAR' },
  { name: 'Pakistan',             code: 'PK', currency: 'PKR', symbol: '₨'   },
  { name: 'Bangladesh',           code: 'BD', currency: 'BDT', symbol: '৳'   },
  { name: 'Nepal',                code: 'NP', currency: 'NPR', symbol: 'रू'  },
  { name: 'Sri Lanka',            code: 'LK', currency: 'LKR', symbol: 'Rs'  },
  { name: 'Malaysia',             code: 'MY', currency: 'MYR', symbol: 'RM'  },
  { name: 'Singapore',            code: 'SG', currency: 'SGD', symbol: 'S$'  },
  { name: 'Australia',            code: 'AU', currency: 'AUD', symbol: 'A$'  },
  { name: 'Canada',               code: 'CA', currency: 'CAD', symbol: 'C$'  },
  { name: 'South Africa',         code: 'ZA', currency: 'ZAR', symbol: 'R'   },
  { name: 'Nigeria',              code: 'NG', currency: 'NGN', symbol: '₦'   },
  { name: 'Kenya',                code: 'KE', currency: 'KES', symbol: 'KSh' },
  { name: 'Ghana',                code: 'GH', currency: 'GHS', symbol: 'GH₵' },
  { name: 'China',                code: 'CN', currency: 'CNY', symbol: '¥'   },
  { name: 'Japan',                code: 'JP', currency: 'JPY', symbol: '¥'   },
  { name: 'Indonesia',            code: 'ID', currency: 'IDR', symbol: 'Rp'  },
  { name: 'Philippines',          code: 'PH', currency: 'PHP', symbol: '₱'   },
  { name: 'Thailand',             code: 'TH', currency: 'THB', symbol: '฿'   },
  { name: 'Qatar',                code: 'QA', currency: 'QAR', symbol: 'QAR' },
  { name: 'Kuwait',               code: 'KW', currency: 'KWD', symbol: 'KWD' },
  { name: 'Bahrain',              code: 'BH', currency: 'BHD', symbol: 'BHD' },
  { name: 'Oman',                 code: 'OM', currency: 'OMR', symbol: 'OMR' },
]

export function getCurrencyInfo(country) {
  return COUNTRIES.find(c => c.name === country) || COUNTRIES[0]
}

export function useCurrency() {
  const country = useAuthStore(s => s.country)
  const info = getCurrencyInfo(country || 'India')
  return {
    sym: info.symbol,
    currency: info.currency,
    fmt: (amount) => `${info.symbol}${Math.round(amount).toLocaleString()}`,
  }
}
