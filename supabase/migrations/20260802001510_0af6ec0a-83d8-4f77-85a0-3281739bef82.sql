-- ============ enums ============
CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','revenue','expense');
CREATE TYPE public.journal_status AS ENUM ('draft','posted','void');
CREATE TYPE public.period_status AS ENUM ('open','closed');
CREATE TYPE public.expense_status AS ENUM ('recorded','paid');

-- ============ chart of accounts ============
CREATE TABLE public.ledger_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type public.account_type NOT NULL,
  subtype TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_accounts TO authenticated;
GRANT ALL ON public.ledger_accounts TO service_role;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ledger accounts" ON public.ledger_accounts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============ accounting periods ============
CREATE TABLE public.accounting_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period TEXT NOT NULL UNIQUE,
  status public.period_status NOT NULL DEFAULT 'open',
  note TEXT NOT NULL DEFAULT '',
  closed_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_periods TO authenticated;
GRANT ALL ON public.accounting_periods TO service_role;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage accounting periods" ON public.accounting_periods
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============ journal entries ============
CREATE TABLE public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_no TEXT NOT NULL UNIQUE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period TEXT NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  memo TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  source_id UUID,
  currency TEXT NOT NULL DEFAULT 'GHS',
  status public.journal_status NOT NULL DEFAULT 'posted',
  created_by UUID REFERENCES auth.users(id),
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX journal_entries_date_idx ON public.journal_entries (entry_date DESC);
CREATE INDEX journal_entries_period_idx ON public.journal_entries (period);
CREATE INDEX journal_entries_source_idx ON public.journal_entries (source, source_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage journal entries" ON public.journal_entries
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.journal_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.ledger_accounts(id),
  debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  line_no INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX journal_lines_entry_idx ON public.journal_lines (entry_id);
CREATE INDEX journal_lines_account_idx ON public.journal_lines (account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage journal lines" ON public.journal_lines
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.validate_journal_line()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.debit < 0 OR NEW.credit < 0 THEN
    RAISE EXCEPTION 'Debit and credit amounts cannot be negative';
  END IF;
  IF NEW.debit > 0 AND NEW.credit > 0 THEN
    RAISE EXCEPTION 'A journal line may carry either a debit or a credit, not both';
  END IF;
  IF NEW.debit = 0 AND NEW.credit = 0 THEN
    RAISE EXCEPTION 'A journal line must carry a debit or a credit amount';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_journal_line_trg BEFORE INSERT OR UPDATE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.validate_journal_line();

-- ============ expenses ============
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  account_id UUID REFERENCES public.ledger_accounts(id),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GHS',
  payment_method TEXT NOT NULL DEFAULT 'bank',
  reference TEXT NOT NULL DEFAULT '',
  receipt_url TEXT,
  memo TEXT NOT NULL DEFAULT '',
  status public.expense_status NOT NULL DEFAULT 'recorded',
  entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_date_idx ON public.expenses (expense_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage expenses" ON public.expenses
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============ updated_at triggers ============
CREATE TRIGGER ledger_accounts_touch BEFORE UPDATE ON public.ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER accounting_periods_touch BEFORE UPDATE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER journal_entries_touch BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER expenses_touch BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ seeded chart of accounts ============
INSERT INTO public.ledger_accounts (code, name, type, subtype, description, is_system, sort_order) VALUES
  ('1000','Paystack settlement cash','asset','cash','Funds collected by Paystack awaiting settlement to the Ashnight bank account.',TRUE,10),
  ('1010','Bank — operating account','asset','cash','Primary Ashnight operating bank account (GHS).',TRUE,20),
  ('1020','Mobile money wallet','asset','cash','MoMo float used for specialist payouts.',FALSE,30),
  ('1100','Accounts receivable','asset','receivable','Invoiced amounts not yet collected from members.',TRUE,40),
  ('1200','Prepaid expenses','asset','prepaid','Hosting, tooling and insurance paid in advance.',FALSE,50),
  ('2000','Escrow held for specialists','liability','escrow','Client money held in escrow that has not yet cleared to a specialist.',TRUE,60),
  ('2010','Specialist payouts payable','liability','payable','Cleared escrow awaiting bank or MoMo transfer.',TRUE,70),
  ('2100','Accounts payable','liability','payable','Supplier invoices received but not yet paid.',TRUE,80),
  ('2200','VAT payable','liability','tax','Ghana VAT collected on platform commission and membership fees.',TRUE,90),
  ('2210','Levies payable (NHIL/GETFund/COVID)','liability','tax','Statutory levies collected on taxable Ashnight revenue.',TRUE,100),
  ('2300','Deferred membership revenue','liability','deferred','Room memberships collected for periods not yet earned.',TRUE,110),
  ('3000','Owner capital','equity','capital','Capital introduced by the owners.',TRUE,120),
  ('3100','Retained earnings','equity','retained','Accumulated Ashnight profits carried forward.',TRUE,130),
  ('4000','Platform commission revenue','revenue','operating','Ashnight commission earned on completed bookings.',TRUE,140),
  ('4010','Room membership revenue','revenue','operating','Recognised client room membership fees.',TRUE,150),
  ('4020','Gift commission revenue','revenue','operating','Commission earned on cash gifts sent in chat.',TRUE,160),
  ('4030','Other income','revenue','other','Interest, recoveries and miscellaneous income.',FALSE,170),
  ('5000','Payment processing fees','expense','cogs','Paystack and MoMo transaction charges.',TRUE,180),
  ('5010','Specialist service cost','expense','cogs','Gross specialist share of booking value passed through escrow.',TRUE,190),
  ('5100','Refunds and chargebacks','expense','operating','Client refunds and disputed payment reversals.',TRUE,200),
  ('5200','Marketing and acquisition','expense','operating','Campaigns, ads, content and referral spend.',FALSE,210),
  ('5300','Salaries and contractors','expense','operating','Team payroll, vetting staff and contractors.',FALSE,220),
  ('5400','Hosting and software','expense','operating','Cloud hosting, database, storage and SaaS tooling.',FALSE,230),
  ('5500','Trust, safety and vetting','expense','operating','Background checks, identity verification and moderation costs.',FALSE,240),
  ('5600','Bank charges','expense','operating','Bank and transfer charges outside payment processing.',FALSE,250),
  ('5700','General and administrative','expense','operating','Office, legal, accounting and other admin costs.',FALSE,260);

-- current and previous month open by default
INSERT INTO public.accounting_periods (period, status) VALUES
  (to_char(CURRENT_DATE, 'YYYY-MM'), 'open'),
  (to_char(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM'), 'open')
ON CONFLICT (period) DO NOTHING;