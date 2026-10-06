import type { CategoryType, CompanyProfile, Ledger, Settings } from './types';

/** Categorical color slots. Order is the validated CVD-safe order — never cycle it per chart. */
export const COLOR_SLOTS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c0'] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];

export const COLOR_HEX_LIGHT: Record<string, string> = {
  c1: '#2a78d6',
  c2: '#eb6834',
  c3: '#1baf7a',
  c4: '#eda100',
  c5: '#e87ba4',
  c6: '#008300',
  c7: '#4a3aa7',
  c8: '#e34948',
  c0: '#a3a29c',
};

export const COLOR_NAMES: Record<string, string> = {
  c1: 'Blue',
  c2: 'Orange',
  c3: 'Aqua',
  c4: 'Yellow',
  c5: 'Pink',
  c6: 'Green',
  c7: 'Violet',
  c8: 'Red',
  c0: 'Grey',
};

export function colorVar(slot: string | undefined): string {
  if (!slot || !(slot in COLOR_HEX_LIGHT)) return 'var(--chart-other)';
  return slot === 'c0' ? 'var(--chart-other)' : `var(--chart-${slot.slice(1)})`;
}

export function colorHex(slot: string | undefined): string {
  return COLOR_HEX_LIGHT[slot ?? 'c0'] ?? COLOR_HEX_LIGHT.c0!;
}

interface DefaultCategory {
  key: string;
  name: string;
  type: CategoryType;
  color: string;
  subs: string[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { key: 'travel', name: 'Travel', type: 'expense', color: 'c1', subs: ['Fuel', 'Bus', 'Train', 'Flight', 'Taxi/Auto', 'Parking', 'Toll'] },
  { key: 'food', name: 'Food', type: 'expense', color: 'c2', subs: ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Groceries', 'Restaurant'] },
  { key: 'bills', name: 'Bills', type: 'expense', color: 'c3', subs: ['Electricity', 'Water', 'Internet', 'Mobile Recharge', 'Rent'] },
  { key: 'shopping', name: 'Shopping', type: 'expense', color: 'c4', subs: ['Clothes', 'Electronics', 'Household'] },
  { key: 'health', name: 'Health', type: 'expense', color: 'c5', subs: ['Medicine', 'Doctor', 'Hospital'] },
  { key: 'education', name: 'Education', type: 'expense', color: 'c6', subs: [] },
  { key: 'entertainment', name: 'Entertainment', type: 'expense', color: 'c7', subs: [] },
  { key: 'salary', name: 'Salary', type: 'income', color: 'c3', subs: [] },
  { key: 'business', name: 'Business Income', type: 'income', color: 'c1', subs: [] },
  { key: 'other', name: 'Other', type: 'both', color: 'c0', subs: [] },
];

export const DEFAULT_LEDGERS: Omit<Ledger, 'createdAt'>[] = [
  { id: 'led_cash', name: 'Cash', group: 'cash', openingBalance: 0, openingType: 'Dr' },
  { id: 'led_bank', name: 'Bank Account', group: 'bank', openingBalance: 0, openingType: 'Dr' },
  { id: 'led_capital', name: 'Capital Account', group: 'capital', openingBalance: 0, openingType: 'Cr' },
];

export const DEFAULT_COMPANY: CompanyProfile = {
  name: 'Bananads',
  tagline: '',
  address: '6th Floor, Hilite Business Park',
  city: 'Calicut',
  state: 'Kerala',
  pincode: '673014',
  country: 'India',
  phone: '9744220039',
  email: '',
  website: '',
  gstin: '',
  pan: '',
  bankName: '',
  accountName: '',
  accountNumber: '',
  ifsc: '',
  branch: '',
  upiId: '',
  signatory: '',
  logo: '',
};

export const DEFAULT_SETTINGS: Settings = {
  currency: 'INR',
  yearType: 'fy',
  gstRates: [0, 5, 12, 18, 28, 40],
  defaultGstRate: 18,
  invoicePrefix: 'BA/{FY}/',
  invoiceNotes: 'Thank you for your business!',
  invoiceTerms: 'Payment due within the due date. Please quote the invoice number with your payment.',
  company: DEFAULT_COMPANY,
};

export const CURRENCIES = [
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'AED', label: 'UAE Dirham (AED)' },
  { code: 'SAR', label: 'Saudi Riyal (SAR)' },
  { code: 'QAR', label: 'Qatari Riyal (QAR)' },
  { code: 'SGD', label: 'Singapore Dollar (S$)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
  { code: 'CAD', label: 'Canadian Dollar (CA$)' },
];

/** GST state codes (for place of supply and GSTIN prefixes) */
export const INDIAN_STATES: { name: string; code: string }[] = [
  { name: 'Andaman and Nicobar Islands', code: '35' },
  { name: 'Andhra Pradesh', code: '37' },
  { name: 'Arunachal Pradesh', code: '12' },
  { name: 'Assam', code: '18' },
  { name: 'Bihar', code: '10' },
  { name: 'Chandigarh', code: '04' },
  { name: 'Chhattisgarh', code: '22' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: '26' },
  { name: 'Delhi', code: '07' },
  { name: 'Goa', code: '30' },
  { name: 'Gujarat', code: '24' },
  { name: 'Haryana', code: '06' },
  { name: 'Himachal Pradesh', code: '02' },
  { name: 'Jammu and Kashmir', code: '01' },
  { name: 'Jharkhand', code: '20' },
  { name: 'Karnataka', code: '29' },
  { name: 'Kerala', code: '32' },
  { name: 'Ladakh', code: '38' },
  { name: 'Lakshadweep', code: '31' },
  { name: 'Madhya Pradesh', code: '23' },
  { name: 'Maharashtra', code: '27' },
  { name: 'Manipur', code: '14' },
  { name: 'Meghalaya', code: '17' },
  { name: 'Mizoram', code: '15' },
  { name: 'Nagaland', code: '13' },
  { name: 'Odisha', code: '21' },
  { name: 'Puducherry', code: '34' },
  { name: 'Punjab', code: '03' },
  { name: 'Rajasthan', code: '08' },
  { name: 'Sikkim', code: '11' },
  { name: 'Tamil Nadu', code: '33' },
  { name: 'Telangana', code: '36' },
  { name: 'Tripura', code: '16' },
  { name: 'Uttar Pradesh', code: '09' },
  { name: 'Uttarakhand', code: '05' },
  { name: 'West Bengal', code: '19' },
  { name: 'Other Territory', code: '97' },
  { name: 'Outside India (Export)', code: '96' },
];

export function stateCode(name: string): string {
  return INDIAN_STATES.find((s) => s.name === name)?.code ?? '';
}

export const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank' },
] as const;

export const UNITS = ['Nos', 'Hrs', 'Days', 'Months', 'Pcs', 'Sq.ft', 'Job', 'Lot'];
