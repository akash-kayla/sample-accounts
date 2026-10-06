export type EntryType = 'expense' | 'income';
export type CategoryType = EntryType | 'both';
export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank';
export type DrCr = 'Dr' | 'Cr';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  order: number;
  createdAt: number;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  order: number;
  createdAt: number;
}

export type LedgerGroup =
  | 'cash'
  | 'bank'
  | 'customers'
  | 'suppliers'
  | 'expenses'
  | 'income'
  | 'duties_taxes'
  | 'capital'
  | 'fixed_assets'
  | 'current_assets'
  | 'current_liabilities'
  | 'loans';

export interface Ledger {
  id: string;
  name: string;
  group: LedgerGroup;
  openingBalance: number;
  openingType: DrCr;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  state?: string;
  /** Auto ledgers (categories, GST, sales) are computed, not stored */
  virtual?: boolean;
  createdAt: number;
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: EntryType;
  categoryId: string;
  subcategoryId: string | null;
  /** Grand total actually paid / received (GST included) */
  amount: number;
  paymentMode: PaymentMode;
  /** Counter ledger: Cash / Bank / Customer / Supplier */
  ledgerId: string;
  notes: string;
  gstEnabled: boolean;
  gstRate: number;
  gstInclusive: boolean;
  interState: boolean;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  partyName: string;
  gstin: string;
  billNo: string;
  createdAt: number;
  updatedAt: number;
}

export type VoucherType = 'payment' | 'receipt' | 'journal' | 'contra';

export interface VoucherLine {
  ledgerId: string;
  debit: number;
  credit: number;
}

export interface Voucher {
  id: string;
  type: VoucherType;
  number: string;
  date: string;
  lines: VoucherLine[];
  narration: string;
  invoiceId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface InvoiceItem {
  id: string;
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number; // percent
  gstRate: number;
}

export interface InvoiceParty {
  name: string;
  address: string;
  gstin: string;
  state: string;
  phone: string;
  email: string;
}

export type InvoiceStatus = 'draft' | 'final' | 'cancelled';

export interface Invoice {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  withGst: boolean;
  customerLedgerId: string | null;
  customer: InvoiceParty;
  placeOfSupply: string;
  items: InvoiceItem[];
  roundOff: boolean;
  notes: string;
  terms: string;
  createdAt: number;
  updatedAt: number;
}

export interface CompanyProfile {
  name: string;
  tagline: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  upiId: string;
  signatory: string;
  /** data: URL of a custom logo; empty = bundled Bananads logo */
  logo: string;
}

export interface Settings {
  currency: string;
  yearType: 'fy' | 'calendar';
  gstRates: number[];
  defaultGstRate: number;
  invoicePrefix: string;
  invoiceNotes: string;
  invoiceTerms: string;
  company: CompanyProfile;
  seeded?: boolean;
}

export type GstFilter = 'all' | 'gst' | 'nogst';
