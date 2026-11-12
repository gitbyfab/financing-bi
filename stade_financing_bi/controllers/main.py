import calendar
import json
import logging
from datetime import date, datetime, timedelta

from odoo import fields, http
from odoo.http import request

_logger = logging.getLogger(__name__)

MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
          "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

FINANCING_STATES = (
    ("draft", "Cotización"), ("requested", "Solicitud"), ("verification", "Verificación"),
    ("analysis", "Análisis"), ("committee", "Comité"), ("approved", "Aprobado"),
    ("conditionally_approved", "Aprobado cond."), ("rejected", "Rechazado"),
    ("formalized", "Formalizado"), ("disbursed", "Desembolsado"), ("running", "Vigente"),
    ("overdue", "En mora"), ("judicial", "Judicial"), ("restructured", "Reestructurado"),
    ("written_off", "Castigado"), ("cancelled", "Cancelado"),
)

ACTIVE_STATES = ("disbursed", "running", "overdue", "judicial", "restructured")

STATE_LABELS = dict(FINANCING_STATES)


def _model(name):
    return name in request.env


def fmt_pct(value):
    return ("%.1f" % (value or 0.0)).replace(".", ",")


class FinancingBiController(http.Controller):
    """Sirve el tablero de financiamiento y sus datos calculados desde Odoo."""

    # ------------------------------------------------------------------
    # Filtros y moneda
    # ------------------------------------------------------------------
    def _set_filters(self, kw):
        today = date.today()
        period = kw.get("period") or "anio"

        def as_int(value, default=0):
            try:
                return int(value)
            except (TypeError, ValueError):
                return default

        month = as_int(kw.get("month"), 0)
        year = as_int(kw.get("year"), 0)
        if month < 1 or month > 12:
            month = today.month
        if year < 1900 or year > 2200:
            year = today.year

        if period == "sem":
            d0 = today - timedelta(days=today.weekday())
            d1 = d0 + timedelta(days=6)
            month, year = d0.month, d0.year
        elif period == "trim":
            q = (today.month - 1) // 3
            m0 = q * 3 + 1
            d0 = date(today.year, m0, 1)
            d1 = date(today.year, m0 + 2, calendar.monthrange(today.year, m0 + 2)[1])
            month, year = d0.month, d0.year
        elif period == "anio":
            d0 = date(year, 1, 1)
            d1 = date(year, 12, 31)
        elif period == "custom":
            d0 = fields.Date.to_date(kw.get("date_from")) or date(year, month, 1)
            d1 = fields.Date.to_date(kw.get("date_to")) or today
            month, year = d0.month, d0.year
        else:
            d0 = date(year, month, 1)
            d1 = date(year, month, calendar.monthrange(year, month)[1])
        span = (d1 - d0).days + 1
        self._f = {
            "period": period,
            "date_from": d0,
            "date_to": d1,
            "prev_from": d0 - timedelta(days=span),
            "prev_to": d0 - timedelta(days=1),
            "month": month,
            "year": year,
            "company_id": int(kw["company_id"]) if kw.get("company_id") else None,
            "currency_id": int(kw["currency_id"]) if kw.get("currency_id") else None,
        }

    def _company_currency(self):
        return request.env.company.currency_id

    def _default_currency(self):
        """Moneda por defecto del tablero: USD si está activa; si no, la de compañía."""
        usd = request.env["res.currency"].search(
            [("name", "=", "USD"), ("active", "=", True)], limit=1)
        return usd or self._company_currency()

    def _report_currency(self):
        cid = self._f.get("currency_id")
        if not cid:
            return self._default_currency()
        cur = request.env["res.currency"].browse(cid)
        return cur if cur.exists() else self._default_currency()

    def _rate_date(self):
        return min(self._f["date_to"], date.today())

    def _needs_fx(self):
        return self._report_currency() != self._company_currency()

    def _conv(self, amount):
        return self._at(amount, self._rate_date())

    def _at(self, amount, on_date):
        amount = self._as_float(amount)
        if not amount or not self._needs_fx():
            return amount
        return amount * self._rate_on(on_date)

    def _rate_on(self, on_date):
        on_date = self._as_date(on_date) or date.today()
        cache = request.__dict__.setdefault("_financing_bi_rate_on", {})
        key = (request.env.company.id, self._report_currency().id, on_date)
        if key not in cache:
            comp = self._company_currency()
            cache[key] = comp._get_conversion_rate(
                comp, self._report_currency(), request.env.company, on_date)
        return cache[key]

    def _to_report(self, amount, currency, on_date, company_amount=None):
        amount = self._as_float(amount)
        target = self._report_currency()
        comp = self._company_currency()
        currency = currency or comp
        on_date = self._as_date(on_date) or date.today()
        if currency == target:
            return amount
        if company_amount is None:
            if currency == comp:
                company_amount = amount
            else:
                company_amount = currency._convert(
                    amount, comp, request.env.company, on_date)
        if target == comp:
            return self._as_float(company_amount)
        return self._as_float(company_amount) * self._rate_on(on_date)

    # ------------------------------------------------------------------
    # Utilidades
    # ------------------------------------------------------------------
    def _as_float(self, value):
        return float(value or 0.0)

    def _as_date(self, value):
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        if isinstance(value, str) and value:
            return date.fromisoformat(value[:10])
        return None

    def _month_ranges(self, n=6, end=None):
        ref = end or date.today()
        out = []
        for i in range(n - 1, -1, -1):
            m = ref.month - i
            y = ref.year
            while m <= 0:
                m += 12
                y -= 1
            d0 = date(y, m, 1)
            d1 = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
            out.append((MONTHS[m - 1], d0, d1))
        return out

    def _chart_end(self):
        return min(date.today(), self._f["date_to"])

    def _allowed(self):
        user = request.env.user
        return (user.has_group("financing.group_financing_manager")
                or user.has_group("base.group_system"))

    # ------------------------------------------------------------------
    # Datos del tablero
    # ------------------------------------------------------------------
    def _financing(self):
        if not _model("financing.operation") or not self._allowed():
            return {"available": False}
        try:
            today = date.today()
            d0 = self._as_date(self._f.get("date_from")) or today
            d1 = self._as_date(self._f.get("date_to")) or today
            span = (d1 - d0).days + 1
            p1 = d0 - timedelta(days=1)
            p0 = p1 - timedelta(days=span - 1)
            Op = request.env["financing.operation"].sudo()
            op_fields = [f for f in (
                "name", "state", "balance_due", "balance_capital", "balance_interest",
                "balance_late", "balance_expense", "balance_commission",
                "amount_principal", "amount_disbursed", "days_overdue_max",
                "currency_id", "date_disbursement", "date_quote", "partner_id",
                "credit_program_id", "contractual_irr", "adjusted_irr",
            ) if f in Op._fields]

            def conv(op, amount, field="date_disbursement"):
                cur = (request.env["res.currency"].browse(op["currency_id"][0])
                       if op.get("currency_id") else request.env.company.currency_id)
                on = self._as_date(op.get(field)) or self._as_date(op.get("date_quote")) or today
                return self._to_report(amount or 0.0, cur, on)

            active_rows = Op.search_read([("state", "in", ACTIVE_STATES)], op_fields)
            active = [o for o in active_rows if (o.get("balance_due") or 0) > 0]
            cartera = sum(conv(o, o.get("balance_due")) for o in active)
            capital = sum(conv(o, o.get("balance_capital")) for o in active)
            interes = sum(conv(o, o.get("balance_interest")) for o in active)
            late_fees = sum(conv(o, o.get("balance_late")) for o in active)
            gastos = sum(conv(o, o.get("balance_expense")) for o in active)
            comision = sum(conv(o, o.get("balance_commission")) for o in active)
            principal_sum = sum(conv(o, o.get("amount_principal")) for o in active)
            ticket_series = [
                {"name": (o.get("partner_id") or [None, o.get("name") or ""])[1],
                 "value": round(conv(o, o.get("amount_principal")), 2)}
                for o in active
            ]

            # Aging: se toma del reporte si existe; si no, se calcula de las operaciones.
            buckets = {"d1_30": ["1–30", 0.0, 0], "d31_60": ["31–60", 0.0, 0],
                       "d61_90": ["61–90", 0.0, 0], "d90_plus": ["+90", 0.0, 0]}
            if _model("financing.report.aging"):
                AG = request.env["financing.report.aging"].sudo()
                for r in AG.search_read([], ["aging_bucket", "overdue_total",
                                             "overdue_installment_count"]):
                    b = r.get("aging_bucket")
                    if b in buckets:
                        buckets[b][1] += self._conv(r.get("overdue_total") or 0)
                        buckets[b][2] += r.get("overdue_installment_count") or 0
            else:
                has_days = "days_overdue_max" in Op._fields
                for o in active:
                    late = conv(o, o.get("balance_late"))
                    if late <= 0:
                        continue
                    days = o.get("days_overdue_max") or 0
                    if not has_days:
                        key = "d1_30"
                    else:
                        key = ("d1_30" if days <= 30 else "d31_60" if days <= 60
                               else "d61_90" if days <= 90 else "d90_plus")
                    buckets[key][1] += late
                    buckets[key][2] += 1
            vencido = sum(v[1] for v in buckets.values())
            aging = [{"name": "Al día", "value": round(max(cartera - vencido, 0.0), 2)}]
            for b in ("d1_30", "d31_60", "d61_90", "d90_plus"):
                aging.append({"name": buckets[b][0], "value": round(buckets[b][1], 2)})
            aging90 = buckets["d90_plus"][1]

            # Provisiones
            prov_balance = prov_capital = 0.0
            if _model("financing.report.provision"):
                PR = request.env["financing.report.provision"].sudo()
                for r in PR.search_read([], ["balance_capital", "provision_balance"]):
                    prov_balance += self._conv(r.get("provision_balance") or 0)
                    prov_capital += self._conv(r.get("balance_capital") or 0)
            cobertura = (prov_balance / prov_capital * 100) if prov_capital else 0.0

            # Desembolsos del período
            disb = Op.search_read(
                [("date_disbursement", ">=", d0), ("date_disbursement", "<=", d1)],
                ["amount_disbursed", "currency_id", "date_disbursement"])
            disb_amount = sum(conv(o, o.get("amount_disbursed")) for o in disb)
            disb_prev_rows = Op.search_read(
                [("date_disbursement", ">=", p0), ("date_disbursement", "<=", p1)],
                ["amount_disbursed", "currency_id", "date_disbursement"])
            disb_prev = sum(conv(o, o.get("amount_disbursed")) for o in disb_prev_rows)
            disb_delta = (((disb_amount - disb_prev) / disb_prev * 100)
                          if disb_prev else (100.0 if disb_amount else 0.0))
            disb_series = []
            for label, m0, m1 in self._month_ranges(12, self._chart_end()):
                rows = Op.search_read(
                    [("date_disbursement", ">=", m0), ("date_disbursement", "<", m1)],
                    ["amount_disbursed", "currency_id", "date_disbursement"])
                disb_series.append({
                    "name": label,
                    "value": round(sum(conv(o, o.get("amount_disbursed")) for o in rows), 2),
                    "count": len(rows),
                })

            # Comité de crédito
            approve = conditional = reject = 0
            approve_amount = cond_amount = 0.0
            committee_rows = []
            if _model("financing.credit.committee.line"):
                CL = request.env["financing.credit.committee.line"].sudo()
                comm = CL.search_read(
                    [("session_date", ">=", d0), ("session_date", "<=", d1)],
                    ["decision", "approved_amount", "session_date"])
                approve = sum(1 for c in comm if c.get("decision") == "approve")
                conditional = sum(1 for c in comm if c.get("decision") == "conditional")
                reject = sum(1 for c in comm if c.get("decision") == "reject")
                approve_amount = sum(self._conv(c.get("approved_amount") or 0) for c in comm
                                     if c.get("decision") == "approve")
                cond_amount = sum(self._conv(c.get("approved_amount") or 0) for c in comm
                                  if c.get("decision") == "conditional")
                committee_rows = [
                    {"name": "Aprobadas", "count": approve, "amount": round(approve_amount, 2)},
                    {"name": "Condicionales", "count": conditional, "amount": round(cond_amount, 2)},
                    {"name": "Rechazadas", "count": reject, "amount": 0.0},
                ]
            approved_amount = approve_amount + cond_amount
            total_cases = approve + conditional + reject
            appr_now = approve + conditional
            appr_prev = 0
            if _model("financing.credit.committee.line"):
                comm_prev = request.env["financing.credit.committee.line"].sudo().search_read(
                    [("session_date", ">=", p0), ("session_date", "<=", p1)], ["decision"])
                appr_prev = sum(1 for c in comm_prev
                                if c.get("decision") in ("approve", "conditional"))
            appr_delta = (((appr_now - appr_prev) / appr_prev * 100)
                          if appr_prev else (100.0 if appr_now else 0.0))
            tasa = (appr_now / total_cases * 100) if total_cases else 0.0

            # Riesgo / cosechas
            fpd = exp_loss = 0.0
            cohort_rows = []
            if _model("financing.risk.report.cohort"):
                CO = request.env["financing.risk.report.cohort"].sudo()
                cohorts = CO.search_read(
                    [], ["cohort_month", "operation_count", "fpd_count", "fpd_rate",
                         "expected_loss_total"],
                    order="cohort_month desc", limit=12)
                sel = [c for c in cohorts if c.get("cohort_month")
                       and d0 <= (self._as_date(c["cohort_month"]) or d0) <= d1]
                sel = sel or cohorts
                c_ops = sum(c.get("operation_count") or 0 for c in sel)
                c_fpd = sum(c.get("fpd_count") or 0 for c in sel)
                fpd = (c_fpd / c_ops * 100) if c_ops else 0.0
                exp_loss = sum(self._conv(c.get("expected_loss_total") or 0) for c in sel)
                for c in sel:
                    cd = self._as_date(c.get("cohort_month"))
                    cohort_rows.append({
                        "name": cd.strftime("%m/%Y") if cd else "",
                        "ops": c.get("operation_count") or 0,
                        "fpd": c.get("fpd_count") or 0,
                        "rate": round((c.get("fpd_rate") or 0) * 100, 1),
                        "loss": round(self._conv(c.get("expected_loss_total") or 0), 2),
                    })

            # Promesas y gestiones
            pcount = {s: 0 for s in ("open", "kept", "broken", "cancelled")}
            pamount = {s: 0.0 for s in pcount}
            if _model("financing.payment.promise"):
                PP = request.env["financing.payment.promise"].sudo()
                promises = PP.search_read(
                    [("promise_date", ">=", d0), ("promise_date", "<=", d1)],
                    ["state", "amount", "promise_date"])
                for p in promises:
                    s = p.get("state")
                    if s in pcount:
                        pcount[s] += 1
                        pamount[s] += self._conv(p.get("amount") or 0)
            promise_rows = [
                {"name": "Abiertas", "count": pcount["open"], "amount": round(pamount["open"], 2)},
                {"name": "Cumplidas", "count": pcount["kept"], "amount": round(pamount["kept"], 2)},
                {"name": "Incumplidas", "count": pcount["broken"], "amount": round(pamount["broken"], 2)},
                {"name": "Canceladas", "count": pcount["cancelled"], "amount": round(pamount["cancelled"], 2)},
            ]

            action_rows = []
            if _model("financing.collection.action"):
                CA = request.env["financing.collection.action"].sudo()
                actions = CA.search_read(
                    [("date", ">=", d0), ("date", "<=", d1)], ["result", "date"])
                a_labels = {"contact": "Contacto exitoso", "no_answer": "Sin respuesta",
                            "promise": "Promesa", "refused": "Rechazado", "info": "Información"}
                a_count = {}
                for a in actions:
                    label = a_labels.get(a.get("result"), a.get("result") or "Otro")
                    a_count[label] = a_count.get(label, 0) + 1
                action_rows = [{"name": k, "count": v}
                               for k, v in sorted(a_count.items(), key=lambda x: -x[1])]
            actions_count = sum(r["count"] for r in action_rows)

            queues = []
            if _model("financing.collection.queue"):
                QU = request.env["financing.collection.queue"].sudo()
                for q in QU.search_read([("active", "=", True)],
                                        ["name", "operation_count"]):
                    n = q.get("operation_count") or 0
                    queues.append({"name": q.get("name") or "—", "value": n, "count": n})

            # Distribución por estado y programa
            state_agg = {}
            prog_agg = {}
            for o in active:
                label = STATE_LABELS.get(o.get("state"), o.get("state") or "—")
                value = conv(o, o.get("balance_due"))
                state_agg[label] = state_agg.get(label, 0.0) + value
                pname = (o.get("credit_program_id") or [None, "Sin programa"])[1]
                prog_agg[pname] = prog_agg.get(pname, 0.0) + value
            states = [{"name": k, "value": round(v, 2)}
                      for k, v in sorted(state_agg.items(), key=lambda x: -x[1])]
            programs = [{"name": k, "value": round(v, 2)}
                        for k, v in sorted(prog_agg.items(), key=lambda x: -x[1])]

            # Embudo
            all_ops = Op.search_read(
                [], ["state", "amount_principal", "currency_id",
                     "date_disbursement", "date_quote"])
            fcount, famount = {}, {}
            for o in all_ops:
                label = STATE_LABELS.get(o.get("state"), o.get("state") or "—")
                fcount[label] = fcount.get(label, 0) + 1
                famount[label] = famount.get(label, 0.0) + conv(o, o.get("amount_principal"))
            funnel = [{"name": label, "count": fcount.get(label, 0),
                       "amount": round(famount.get(label, 0.0), 2)}
                      for _key, label in FINANCING_STATES if fcount.get(label)]

            tir_num = sum((o.get("contractual_irr") or 0.0) * conv(o, o.get("amount_principal"))
                          for o in active)
            tir = (tir_num / principal_sum) if principal_sum else 0.0
            tir_adj_num = sum((o.get("adjusted_irr") or 0.0) * conv(o, o.get("amount_principal"))
                              for o in active)
            tir_adj = (tir_adj_num / principal_sum) if principal_sum else 0.0

            metrics = {
                "fin_cartera": round(cartera, 2),
                "fin_capital": round(capital, 2),
                "fin_interes": round(interes, 2),
                "fin_mora": round(vencido, 2),
                "fin_mora_pct": round((vencido / cartera * 100) if cartera else 0.0, 1),
                "fin_aging90": round(aging90, 2),
                "fin_desembolsos": round(disb_amount, 2),
                "fin_desembolsos_count": len(disb),
                "fin_disb_prev": round(disb_prev, 2),
                "fin_disb_delta": round(disb_delta, 1),
                "fin_appr_prev": appr_prev,
                "fin_appr_delta": round(appr_delta, 1),
                "fin_aprobados": round(approved_amount, 2),
                "fin_aprobados_count": approve + conditional,
                "fin_tasa_aprobacion": round(tasa, 1),
                "fin_ticket": round((principal_sum / len(active)) if active else 0.0, 2),
                "fin_provision": round(prov_balance, 2),
                "fin_cobertura": round(cobertura, 1),
                "fin_fpd": round(fpd, 1),
                "fin_perdida": round(exp_loss, 2),
                "fin_tir": round(tir * 100, 1),
                "fin_tir_adj": round(tir_adj * 100, 1),
                "fin_operaciones": len(active),
                "fin_clientes": len({(o.get("partner_id") or [None])[0] for o in active
                                     if o.get("partner_id")}),
                "fin_promesas_cumplidas": pcount["kept"],
                "fin_promesas_incumplidas": pcount["broken"],
                "fin_gestiones": actions_count,
                "fin_gastos": round(gastos, 2),
                "fin_comision": round(comision, 2),
                "fin_mora_interes": round(late_fees, 2),
            }
            return {
                "available": True,
                "metrics": metrics,
                "aging": aging,
                "states": states,
                "programs": programs,
                "funnel": funnel,
                "committee": {"rows": committee_rows, "approve": approve,
                              "conditional": conditional, "reject": reject,
                              "amount": round(approved_amount, 2)},
                "promises": {"rows": promise_rows, "open": pcount["open"],
                             "kept": pcount["kept"], "broken": pcount["broken"]},
                "actions": action_rows,
                "queues": queues,
                "disbursements": disb_series,
                "cohorts": cohort_rows,
                "tickets": ticket_series,
            }
        except Exception:
            _logger.exception("Financing BI: no se pudo calcular el tablero de financiamiento")
            return {"available": False}

    def _cur(self, currency_id):
        if isinstance(currency_id, (list, tuple)):
            currency_id = currency_id[0] if currency_id else None
        if currency_id:
            cur = request.env["res.currency"].browse(currency_id)
            if cur.exists():
                return cur
        return self._company_currency()

    def _amount(self, amount, currency_id, on_date=None):
        return self._to_report(amount or 0.0, self._cur(currency_id),
                               on_date or date.today())

    def _evolution_ranges(self):
        """Buckets de evolución según el período: semana→días, mes→días, año→meses."""
        d0, d1 = self._f["date_from"], self._f["date_to"]
        period = self._f["period"]
        weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
        if period == "sem":
            n = (d1 - d0).days + 1
            return [(weekdays[(d0 + timedelta(days=i)).weekday()],
                     d0 + timedelta(days=i), d0 + timedelta(days=i + 1))
                    for i in range(n)]
        if period == "mes":
            n = (d1 - d0).days + 1
            return [((d0 + timedelta(days=i)).strftime("%d"),
                     d0 + timedelta(days=i), d0 + timedelta(days=i + 1))
                    for i in range(n)]
        if period == "anio":
            out = []
            for m in range(1, 13):
                s = date(d0.year, m, 1)
                e = date(d0.year + 1, 1, 1) if m == 12 else date(d0.year, m + 1, 1)
                out.append((MONTHS[m - 1], s, e))
            return out
        span = (d1 - d0).days + 1
        if span <= 62:
            return [((d0 + timedelta(days=i)).strftime("%d/%m"),
                     d0 + timedelta(days=i), d0 + timedelta(days=i + 1))
                    for i in range(span)]
        out = []
        y, m = d0.year, d0.month
        while date(y, m, 1) <= d1:
            s = date(y, m, 1)
            e = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
            out.append((MONTHS[m - 1], s, e))
            m += 1
            if m > 12:
                m = 1
                y += 1
        return out

    def _bucket_index(self, ranges, day):
        for i, (_label, start, end) in enumerate(ranges):
            if start <= day < end:
                return i
        return None

    def _disb_series(self):
        ranges = self._evolution_ranges()
        if not ranges:
            return []
        Op = request.env["financing.operation"].sudo()
        fields = [f for f in ("date_disbursement", "amount_disbursed", "currency_id")
                  if f in Op._fields]
        rows = Op.search_read(
            [("date_disbursement", ">=", ranges[0][1]),
             ("date_disbursement", "<", ranges[-1][2])], fields)
        values = [0.0] * len(ranges)
        counts = [0] * len(ranges)
        for o in rows:
            day = self._as_date(o.get("date_disbursement"))
            if not day:
                continue
            idx = self._bucket_index(ranges, day)
            if idx is None:
                continue
            values[idx] += self._to_report(o.get("amount_disbursed") or 0.0,
                                           self._cur(o.get("currency_id")), day)
            counts[idx] += 1
        return [{"name": ranges[i][0], "value": round(values[i], 2),
                 "count": counts[i]} for i in range(len(ranges))]

    def _income_series(self):
        ranges = self._evolution_ranges()
        if not ranges:
            return []
        rows = request.env["account.move.line"].sudo().search_read(
            [("financing_move_type", "in", ("accrual", "commission")),
             ("date", ">=", ranges[0][1]), ("date", "<", ranges[-1][2])],
            ["balance", "date"])
        values = [0.0] * len(ranges)
        for r in rows:
            day = self._as_date(r.get("date"))
            if not day:
                continue
            idx = self._bucket_index(ranges, day)
            if idx is None:
                continue
            values[idx] += self._at(r.get("balance") or 0.0, day)
        return [{"name": ranges[i][0], "value": round(values[i], 2)}
                for i in range(len(ranges))]

    def _income_split_series(self):
        ranges = self._evolution_ranges()
        if not ranges:
            return [], []
        rows = request.env["account.move.line"].sudo().search_read(
            [("financing_move_type", "in", ("accrual", "commission")),
             ("date", ">=", ranges[0][1]), ("date", "<", ranges[-1][2])],
            ["balance", "date", "financing_move_type"])
        interest = [0.0] * len(ranges)
        commission = [0.0] * len(ranges)
        for r in rows:
            day = self._as_date(r.get("date"))
            if not day:
                continue
            idx = self._bucket_index(ranges, day)
            if idx is None:
                continue
            value = self._at(r.get("balance") or 0.0, day)
            if r.get("financing_move_type") == "accrual":
                interest[idx] += value
            else:
                commission[idx] += value
        return (
            [{"name": ranges[i][0], "value": round(interest[i], 2)}
             for i in range(len(ranges))],
            [{"name": ranges[i][0], "value": round(commission[i], 2)}
             for i in range(len(ranges))],
        )

    def _analytics(self, fin):
        """Datos adicionales para los tableros por categoría."""
        today = date.today()
        d0, d1 = self._f["date_from"], self._f["date_to"]
        M = fin.get("metrics", {}) if fin.get("available") else {}
        disb_series = self._disb_series()
        income_series = self._income_series()
        interest_series, commission_series = self._income_split_series()
        Op = request.env["financing.operation"].sudo()
        fields = [f for f in (
            "name", "state", "balance_due", "balance_capital", "balance_interest",
            "balance_late", "balance_expense", "balance_commission", "amount_principal",
            "amount_disbursed", "amount_approved", "amount_requested", "amount_commission",
            "amount_insurance", "amount_down_payment", "currency_id", "date_disbursement",
            "date_quote", "partner_id", "credit_program_id", "current_pd", "current_lgd",
            "current_ead", "current_expected_loss", "actual_lgd", "risk_premium",
            "loss_at_writeoff", "installment_income_ratio", "days_overdue_max",
            "financed_object_value", "contractual_irr", "adjusted_irr",
        ) if f in Op._fields]
        active = []
        if fin.get("available"):
            for o in Op.search_read([("state", "in", ACTIVE_STATES)], fields):
                if (o.get("balance_due") or 0) > 0:
                    active.append(o)

        def conv(o, amount, field="date_disbursement"):
            on = (self._as_date(o.get(field)) or self._as_date(o.get("date_quote"))
                  or today)
            return self._to_report(amount or 0.0, self._cur(o.get("currency_id")), on)

        cartera = sum(conv(o, o.get("balance_due")) for o in active)
        capital = sum(conv(o, o.get("balance_capital")) for o in active)
        interes = sum(conv(o, o.get("balance_interest")) for o in active)
        mora = sum(conv(o, o.get("balance_late")) for o in active)
        gastos = sum(conv(o, o.get("balance_expense")) for o in active)
        ead = sum(conv(o, o.get("current_ead")) for o in active)
        el = sum(conv(o, o.get("current_expected_loss")) for o in active)
        pd_w = sum((o.get("current_pd") or 0) * conv(o, o.get("current_ead")) for o in active)
        lgd_w = sum((o.get("current_lgd") or 0) * conv(o, o.get("current_ead")) for o in active)
        prima_w = sum((o.get("risk_premium") or 0) * conv(o, o.get("amount_principal"))
                      for o in active)
        principal_w = sum(conv(o, o.get("amount_principal")) for o in active)
        pd = (pd_w / ead * 100) if ead else 0.0
        lgd = (lgd_w / ead * 100) if ead else 0.0
        prima = (prima_w / principal_w * 100) if principal_w else 0.0

        cuota_w = sum((o.get("installment_income_ratio") or 0) * conv(o, o.get("balance_due"))
                      for o in active)
        cuota_ing = (cuota_w / cartera * 100) if cartera else 0.0
        dp = sum(conv(o, o.get("amount_down_payment")) for o in active)
        ltv = (principal_w / (principal_w + dp) * 100) if (principal_w + dp) else 0.0
        inicial = (dp / (dp + principal_w) * 100) if (dp + principal_w) else 0.0

        dpds = [o.get("days_overdue_max") or 0 for o in active
                if (o.get("balance_late") or 0) > 0]
        dpd_avg = (sum(dpds) / len(dpds)) if dpds else 0.0
        dpd_max = max(dpds) if dpds else 0
        en_mora = len([o for o in active if (o.get("balance_late") or 0) > 0])
        restructured = len([o for o in active if o.get("restructured")])
        overdue_installments = 0
        if _model("financing.report.aging"):
            for r in request.env["financing.report.aging"].sudo().search_read(
                    [], ["overdue_installment_count"]):
                overdue_installments += r.get("overdue_installment_count") or 0

        # Vintage / cosechas (base: operaciones activas, por mes de desembolso)
        vint = {}
        for o in active:
            dt = self._as_date(o.get("date_disbursement")) or self._as_date(o.get("date_quote"))
            key = dt.strftime("%m/%Y") if dt else "—"
            v = vint.setdefault(key, {"name": key, "ops": 0, "saldo": 0.0,
                                      "mora": 0.0, "_d": dt or date.min})
            v["ops"] += 1
            v["saldo"] += conv(o, o.get("balance_due"))
            v["mora"] += conv(o, o.get("balance_late"))
        vintage = []
        for v in sorted(vint.values(), key=lambda x: x["_d"]):
            vintage.append({"name": v["name"], "ops": v["ops"],
                            "saldo": round(v["saldo"], 2), "mora": round(v["mora"], 2),
                            "mora_pct": round((v["mora"] / v["saldo"] * 100)
                                              if v["saldo"] else 0.0, 1)})

        top = sorted(
            [{"cliente": (o.get("partner_id") or [None, "—"])[1],
              "operacion": o.get("name") or "",
              "estado": STATE_LABELS.get(o.get("state"), o.get("state") or ""),
              "saldo": round(conv(o, o.get("balance_due")), 2),
              "mora": round(conv(o, o.get("balance_late")), 2),
              "dias": o.get("days_overdue_max") or 0} for o in active],
            key=lambda r: (-r["mora"], -r["saldo"]))[:10]

        aging = fin.get("aging", [])
        aging_total = sum(a["value"] for a in aging) or 1
        aging_detail = [{"name": a["name"], "value": a["value"],
                         "pct": round(a["value"] / aging_total * 100, 1)} for a in aging]
        aging90_pct = (M.get("fin_aging90", 0) / cartera * 100) if cartera else 0.0

        # Provisión
        provision = prov_capital = 0.0
        if _model("financing.report.provision"):
            for r in request.env["financing.report.provision"].sudo().search_read(
                    [], ["balance_capital", "provision_balance", "currency_id"]):
                provision += self._amount(r.get("provision_balance"), r.get("currency_id"))
                prov_capital += self._amount(r.get("balance_capital"), r.get("currency_id"))
        coverage = (provision / prov_capital * 100) if prov_capital else 0.0

        # Cosechas / FPD (vista de riesgo)
        cohorts = []
        fpd = 0.0
        if _model("financing.risk.report.cohort"):
            rows = request.env["financing.risk.report.cohort"].sudo().search_read(
                [], ["cohort_month", "operation_count", "fpd_count", "fpd_rate",
                     "expected_loss_total", "avg_adjusted_irr", "avg_risk_premium",
                     "currency_id"], order="cohort_month desc", limit=24)
            c_ops = sum(r.get("operation_count") or 0 for r in rows)
            c_fpd = sum(r.get("fpd_count") or 0 for r in rows)
            fpd = (c_fpd / c_ops * 100) if c_ops else 0.0
            for r in rows:
                cd = self._as_date(r.get("cohort_month"))
                cohorts.append({
                    "name": cd.strftime("%m/%Y") if cd else "",
                    "ops": r.get("operation_count") or 0,
                    "fpd": r.get("fpd_count") or 0,
                    "rate": round((r.get("fpd_rate") or 0) * 100, 1),
                    "loss": round(self._amount(r.get("expected_loss_total"),
                                               r.get("currency_id"), cd or today), 2),
                    "tir": round((r.get("avg_adjusted_irr") or 0) * 100, 1),
                    "prima": round((r.get("avg_risk_premium") or 0) * 100, 1),
                })

        # Roll / cure
        roll = []
        if _model("financing.risk.report.roll.rate"):
            RR = request.env["financing.risk.report.roll.rate"].sudo()
            rf = [f for f in ("period_month", "roll_rate", "cure_rate", "origin_label")
                  if f in RR._fields]
            if rf:
                for r in RR.search_read([], rf, order="period_month desc", limit=12):
                    pm = self._as_date(r.get("period_month"))
                    roll.append({"name": pm.strftime("%m/%Y") if pm else "",
                                 "roll": round((r.get("roll_rate") or 0) * 100, 1),
                                 "cure": round((r.get("cure_rate") or 0) * 100, 1)})
        elif _model("financing.risk.report.roll"):
            RR = request.env["financing.risk.report.roll"].sudo()
            rf = [f for f in ("period_month", "roll_rate", "cure_rate", "origin_label")
                  if f in RR._fields]
            if rf:
                for r in RR.search_read([], rf, order="period_month desc", limit=12):
                    pm = self._as_date(r.get("period_month"))
                    roll.append({"name": pm.strftime("%m/%Y") if pm else "",
                                 "roll": round((r.get("roll_rate") or 0) * 100, 1),
                                 "cure": round((r.get("cure_rate") or 0) * 100, 1)})

        # Castigos
        wo_fields = [f for f in ("loss_at_writeoff", "currency_id", "date_disbursement",
                                 "date_quote") if f in Op._fields]
        wo_rows = Op.search_read([("state", "=", "written_off")], wo_fields)
        actual_loss = sum(conv(o, o.get("loss_at_writeoff")) for o in wo_rows)

        # Rentabilidad: ingresos del período desde apuntes contables
        def move_sum(kind, m0=None, m1=None):
            dom = [("financing_move_type", "=", kind),
                   ("date", ">=", m0 or d0), ("date", "<", m1 or (d1 + timedelta(days=1)))]
            rows = request.env["account.move.line"].sudo().search_read(
                dom, ["balance", "date"])
            return sum(self._at(r.get("balance") or 0,
                                self._as_date(r.get("date")) or today) for r in rows)

        income_interest = move_sum("accrual")
        income_commission = move_sum("commission")
        income_insurance = sum(
            conv(o, o.get("amount_insurance")) for o in Op.search_read(
                [("date_disbursement", ">=", d0), ("date_disbursement", "<=", d1)],
                [f for f in ("amount_insurance", "currency_id", "date_disbursement",
                             "date_quote") if f in Op._fields]))
        income_total = income_interest + income_commission + income_insurance
        income_prev = (
            move_sum("accrual", self._f["prev_from"], self._f["prev_to"] + timedelta(days=1))
            + move_sum("commission", self._f["prev_from"], self._f["prev_to"] + timedelta(days=1))
        )
        income_delta = (((income_total - income_prev) / income_prev * 100)
                        if income_prev else (100.0 if income_total else 0.0))
        margin = M.get("fin_tir", 0.0) - prima
        rendimiento = (income_interest / cartera * 100) if cartera else 0.0

        series = income_series

        prog = {}
        for o in active:
            pname = (o.get("credit_program_id") or [None, "Sin programa"])[1]
            p = prog.setdefault(pname, {"name": pname, "ops": 0, "cartera": 0.0,
                                        "mora": 0.0, "_tir": 0.0, "_prima": 0.0,
                                        "_w": 0.0})
            c = conv(o, o.get("balance_due"))
            w = conv(o, o.get("amount_principal"))
            p["ops"] += 1
            p["cartera"] += c
            p["mora"] += conv(o, o.get("balance_late"))
            p["_tir"] += (o.get("adjusted_irr") or 0) * w
            p["_prima"] += (o.get("risk_premium") or 0) * w
            p["_w"] += w
        by_program = []
        for p in sorted(prog.values(), key=lambda x: -x["cartera"]):
            w = p["_w"] or 1
            by_program.append({
                "name": p["name"], "ops": p["ops"],
                "cartera": round(p["cartera"], 2), "mora": round(p["mora"], 2),
                "tir": round(p["_tir"] / w * 100, 1),
                "prima": round(p["_prima"] / w * 100, 1),
            })

        # Conversión del embudo
        total_ops = Op.search_count([])
        disb_ops = (Op.search_count([("date_disbursement", "!=", False)])
                    if "date_disbursement" in Op._fields else 0)
        conversion = (disb_ops / total_ops * 100) if total_ops else 0.0
        disb_count = M.get("fin_desembolsos_count", 0) or 0
        disb_ticket = (M.get("fin_desembolsos", 0.0) / disb_count) if disb_count else 0.0

        # Alertas para la portada
        alerts = []
        if provision < el:
            alerts.append({"level": "a", "text": "Provisión menor que la pérdida esperada"})
        if not M.get("fin_desembolsos"):
            alerts.append({"level": "a", "text": "Sin desembolsos en el período"})
        if (fin.get("promises", {}).get("broken") or 0) > (fin.get("promises", {}).get("kept") or 0):
            alerts.append({"level": "a", "text": "Promesas de pago incumplidas por encima de las cumplidas"})
        if not alerts:
            alerts.append({"level": "g", "text": "Sin observaciones en el período"})

        cartera_cat = {
            "kpis": {
                "car_cartera": round(cartera, 2),
                "car_capital": round(capital, 2),
                "car_interes": round(interes, 2),
                "car_mora": round(mora, 2),
                "car_mora_pct": M.get("fin_mora_pct", 0),
                "car_aging90": M.get("fin_aging90", 0),
                "car_aging90_pct": round(aging90_pct, 1),
                "car_dpd_avg": round(dpd_avg, 1),
                "car_dpd_max": dpd_max,
                "car_operaciones": len(active),
                "car_clientes": M.get("fin_clientes", 0),
                "car_vencidos": overdue_installments,
                "car_en_mora": en_mora,
                "car_desembolsos": M.get("fin_desembolsos", 0),
                "car_desembolsos_count": disb_count,
                "car_ticket": round(disb_ticket, 2),
                "car_conversion": round(conversion, 1),
            },
            "aging": aging,
            "aging_detail": aging_detail,
            "states": fin.get("states", []),
            "programs": fin.get("programs", []),
            "vintage": vintage,
            "top": top,
            "alerts": alerts,
            "disbursements": disb_series,
        }
        risk_top = sorted([
            {"cliente": (o.get("partner_id") or [None, "—"])[1],
             "operacion": o.get("name") or "",
             "pd": round((o.get("current_pd") or 0) * 100, 1),
             "lgd": round((o.get("current_lgd") or 0) * 100, 1),
             "ead": round(conv(o, o.get("current_ead")), 2),
             "el": round(conv(o, o.get("current_expected_loss")), 2)}
            for o in active if (o.get("current_expected_loss") or 0) > 0
        ], key=lambda r: -r["el"])[:8]

        riesgo = {
            "kpis": {
                "rie_el": round(el, 2),
                "rie_provision": round(provision, 2),
                "rie_cobertura": round(coverage, 1),
                "rie_gap": round(provision - el, 2),
                "rie_fpd": round(fpd, 1),
                "rie_pd": round(pd, 1),
                "rie_lgd": round(lgd, 1),
                "rie_ead": round(ead, 2),
                "rie_actual_loss": round(actual_loss, 2),
                "rie_writeoffs": len(wo_rows),
                "rie_restructured": restructured,
            },
            "cohorts": cohorts,
            "roll": roll,
            "top": risk_top,
            "provision_vs_el": [
                {"name": "Provisión", "value": round(provision, 2)},
                {"name": "Pérdida esperada", "value": round(el, 2)},
            ],
        }
        rentabilidad = {
            "kpis": {
                "ren_tir": M.get("fin_tir", 0),
                "ren_tir_adj": M.get("fin_tir_adj", 0),
                "ren_prima": round(prima, 1),
                "ren_ingreso_interes": round(income_interest, 2),
                "ren_ingreso_comision": round(income_commission, 2),
                "ren_ingreso_seguro": round(income_insurance, 2),
                "ren_ingreso_total": round(income_total, 2),
                "ren_ingreso_delta": round(income_delta, 1),
                "ren_margen": round(margin, 2),
                "ren_rendimiento": round(rendimiento, 2),
                "ren_cuota_ingreso": round(cuota_ing, 1),
                "ren_ltv": round(ltv, 1),
                "ren_inicial": round(inicial, 1),
            },
            "by_program": by_program,
            "income_series": series,
            "income_lines": {
                "interest": interest_series,
                "commission": commission_series,
            },
            "income_mix": [
                {"name": "Intereses", "value": round(income_interest, 2)},
                {"name": "Comisión", "value": round(income_commission, 2)},
                {"name": "Seguro", "value": round(income_insurance, 2)},
            ],
        }
        return {"cartera": cartera_cat, "riesgo": riesgo,
                "rentabilidad": rentabilidad}

    def _op_conv(self, o, amount, field="date_disbursement"):
        on = (self._as_date(o.get(field)) or self._as_date(o.get("date_quote"))
              or date.today())
        return self._to_report(amount or 0.0, self._cur(o.get("currency_id")), on)

    def _extra_categories(self, fin):
        """Tableros de originación, cobranza, tesorería, comercial y SLA."""
        today = date.today()
        d0, d1 = self._f["date_from"], self._f["date_to"]
        M = fin.get("metrics", {}) if fin.get("available") else {}
        Op = request.env["financing.operation"].sudo()
        op_fields = [f for f in (
            "name", "state", "partner_id", "amount_requested", "amount_approved",
            "amount_principal", "amount_disbursed", "amount_commission", "balance_due",
            "amount_insurance", "currency_id", "date_quote", "date_disbursement",
            "date_first_due", "reject_reason_id", "channel_id", "user_id",
            "vendor_id", "credit_program_id", "subject_type", "restructured",
            "closure_state", "date_written_off", "term", "interest_rate",
            "current_pd", "current_lgd", "current_ead", "current_expected_loss",
        ) if f in Op._fields]
        ops = Op.search_read([], op_fields)
        active = [o for o in ops if o.get("state") in ACTIVE_STATES]
        op_partner = {o["id"]: (o.get("partner_id") or [None, "—"])[1] for o in ops}

        def conv(o, amount, field="date_disbursement"):
            return self._op_conv(o, amount, field)

        def op_monthly(rows, date_field, amount_field):
            ranges = self._month_ranges(12, self._chart_end())
            values = [0.0] * len(ranges)
            counts = [0] * len(ranges)
            for o in rows:
                day = self._as_date(o.get(date_field))
                if not day:
                    continue
                idx = self._bucket_index(ranges, day)
                if idx is None:
                    continue
                counts[idx] += 1
                values[idx] += conv(o, o.get(amount_field), date_field)
            return [{"name": ranges[i][0], "value": round(values[i], 2),
                     "count": counts[i]} for i in range(len(ranges))]

        # ---------------- Originación y comité ----------------
        approved_states = ("approved", "conditionally_approved", "formalized",
                           "disbursed", "running", "overdue", "judicial", "restructured")
        disb_ops = [o for o in ops if o.get("date_disbursement")]
        fcount, famount = {}, {}
        for o in ops:
            label = STATE_LABELS.get(o.get("state"), o.get("state") or "—")
            fcount[label] = fcount.get(label, 0) + 1
            famount[label] = famount.get(label, 0.0) + conv(o, o.get("amount_requested"))
        funnel = [{"name": label, "count": fcount.get(label, 0),
                   "amount": round(famount.get(label, 0.0), 2)}
                  for _key, label in FINANCING_STATES if fcount.get(label)]
        committee = []
        if _model("financing.credit.committee.line"):
            CL = request.env["financing.credit.committee.line"].sudo()
            rows = CL.search_read(
                [("session_date", ">=", d0), ("session_date", "<=", d1)],
                ["decision", "approved_amount", "currency_id", "session_date"])
            for dec, label in (("approve", "Aprobadas"),
                               ("conditional", "Condicionales"),
                               ("reject", "Rechazadas")):
                sel = [r for r in rows if r.get("decision") == dec]
                committee.append({
                    "name": label, "count": len(sel),
                    "amount": round(sum(self._to_report(
                        r.get("approved_amount"), self._cur(r.get("currency_id")),
                        self._as_date(r.get("session_date")) or today) for r in sel), 2),
                })
        rej = {}
        for o in ops:
            if o.get("reject_reason_id"):
                name = (o.get("reject_reason_id") or [None, "Sin motivo"])[1]
                rej[name] = rej.get(name, 0) + 1
        rejects = [{"name": k, "value": v}
                   for k, v in sorted(rej.items(), key=lambda x: -x[1])]
        ch = {}
        for o in ops:
            name = (o.get("channel_id") or [None, "Sin canal"])[1]
            ch[name] = ch.get(name, 0) + 1
        channels = [{"name": k, "value": v}
                    for k, v in sorted(ch.items(), key=lambda x: -x[1])]
        times = []
        for o in disb_ops:
            q = self._as_date(o.get("date_quote"))
            d = self._as_date(o.get("date_disbursement"))
            if q and d:
                times.append((d - q).days)
        requested = sum(conv(o, o.get("amount_requested")) for o in ops)
        approved_amt = sum(conv(o, o.get("amount_approved")) for o in ops
                           if o.get("amount_approved"))
        disb_amt = sum(conv(o, o.get("amount_disbursed")) for o in disb_ops)
        originacion = {
            "kpis": {
                "ori_solicitudes": len(ops),
                "ori_cotizaciones": len([o for o in ops if o.get("date_quote")]),
                "ori_aprobadas": len([o for o in ops if o.get("state") in approved_states]),
                "ori_desembolsadas": len(disb_ops),
                "ori_tasa": round((len([o for o in ops if o.get("state") in approved_states])
                                   / len(ops) * 100) if ops else 0.0, 1),
                "ori_conversion": round((len(disb_ops) / len(ops) * 100) if ops else 0.0, 1),
                "ori_solicitado": round(requested, 2),
                "ori_aprobado": round(approved_amt, 2),
                "ori_desembolsado": round(disb_amt, 2),
                "ori_ticket": round((disb_amt / len(disb_ops)) if disb_ops else 0.0, 2),
                "ori_tiempo": round((sum(times) / len(times)) if times else 0.0, 1),
            },
            "funnel": funnel,
            "committee": committee,
            "rejects": rejects,
            "channels": channels,
            "monthly": op_monthly(ops, "date_quote", "amount_requested"),
            "monthly_disb": op_monthly(ops, "date_disbursement", "amount_disbursed"),
            "top": sorted([
                {"cliente": (o.get("partner_id") or [None, "—"])[1],
                 "operacion": o.get("name") or "",
                 "estado": STATE_LABELS.get(o.get("state"), o.get("state") or ""),
                 "monto": round(conv(o, o.get("amount_requested")), 2),
                 "fecha": (self._as_date(o.get("date_quote")) or today).strftime("%d/%m/%Y")}
                for o in ops], key=lambda r: -r["monto"])[:8],
        }

        # ---------------- Cobranza ----------------
        promise_states = ("open", "kept", "broken", "cancelled")
        pcount = {s: 0 for s in promise_states}
        pamount = {s: 0.0 for s in promise_states}
        promises = []
        promise_rows = []
        if _model("financing.payment.promise"):
            PP = request.env["financing.payment.promise"].sudo()
            rows = PP.search_read(
                [("promise_date", ">=", d0), ("promise_date", "<=", d1)],
                ["state", "amount", "currency_id", "promise_date", "partner_id",
                 "operation_id"])
            promise_rows = rows
            for p in rows:
                st = p.get("state")
                if st in pcount:
                    pcount[st] += 1
                    pamount[st] += self._to_report(p.get("amount") or 0.0,
                                                   self._cur(p.get("currency_id")),
                                                   self._as_date(p.get("promise_date")) or today)
                promises.append({
                    "cliente": (p.get("partner_id") or [None, "—"])[1],
                    "operacion": (p.get("operation_id") or [None, "—"])[1],
                    "estado": st or "",
                    "fecha": (self._as_date(p.get("promise_date")) or today).strftime("%d/%m/%Y"),
                    "monto": round(self._to_report(p.get("amount") or 0.0,
                                                   self._cur(p.get("currency_id")),
                                                   self._as_date(p.get("promise_date")) or today), 2),
                })
        action_rows = []
        if _model("financing.collection.action"):
            CA = request.env["financing.collection.action"].sudo()
            rows = CA.search_read(
                [("date", ">=", d0), ("date", "<=", d1)],
                ["result", "channel", "date"])
            labels = {"contact": "Contacto", "no_answer": "Sin respuesta",
                      "promise": "Promesa", "refused": "Rechazado", "info": "Información"}
            agg = {}
            for a in rows:
                label = labels.get(a.get("result"), a.get("result") or "Otro")
                agg[label] = agg.get(label, 0) + 1
            action_rows = [{"name": k, "value": v}
                           for k, v in sorted(agg.items(), key=lambda x: -x[1])]
        queues = []
        if _model("financing.collection.queue"):
            QU = request.env["financing.collection.queue"].sudo()
            for q in QU.search_read([("active", "=", True)],
                                    ["name", "operation_count"]):
                queues.append({"name": q.get("name") or "—",
                               "value": q.get("operation_count") or 0})
        judicial = []
        if _model("financing.judicial.case"):
            JC = request.env["financing.judicial.case"].sudo()
            agg = {}
            for c in JC.search_read([], ["state"]):
                st = c.get("state") or "—"
                agg[st] = agg.get(st, 0) + 1
            judicial = [{"name": k, "value": v}
                        for k, v in sorted(agg.items(), key=lambda x: -x[1])]
        overdue = 0.0
        overdue_items = 0
        if _model("financing.report.aging"):
            for r in request.env["financing.report.aging"].sudo().search_read(
                    [], ["overdue_total", "overdue_installment_count", "currency_id"]):
                overdue += self._to_report(r.get("overdue_total") or 0.0,
                                           self._cur(r.get("currency_id")), today)
                overdue_items += r.get("overdue_installment_count") or 0
        pranges = self._month_ranges(12, self._chart_end())
        pvals = [0.0] * len(pranges)
        pcounts = [0] * len(pranges)
        for p in promise_rows:
            day = self._as_date(p.get("promise_date"))
            if not day:
                continue
            idx = self._bucket_index(pranges, day)
            if idx is not None:
                pvals[idx] += self._to_report(p.get("amount") or 0.0,
                                              self._cur(p.get("currency_id")), day)
                pcounts[idx] += 1
        monthly_promises = [{"name": pranges[i][0], "value": round(pvals[i], 2),
                             "count": pcounts[i]} for i in range(len(pranges))]
        cobranza = {
            "kpis": {
                "cob_promesas": sum(pcount.values()),
                "cob_abiertas": pcount.get("open", 0),
                "cob_cumplidas": pcount.get("kept", 0),
                "cob_incumplidas": pcount.get("broken", 0),
                "cob_monto": round(sum(pamount.values()), 2),
                "cob_gestiones": sum(a["value"] for a in action_rows),
                "cob_contacto": round((sum(a["value"] for a in action_rows
                                          if a["name"] == "Contacto")
                                       / sum(a["value"] for a in action_rows) * 100)
                                      if action_rows else 0.0, 1),
                "cob_colas": len(queues),
                "cob_judiciales": sum(j["value"] for j in judicial),
                "cob_vencido": round(overdue, 2),
                "cob_cuotas": overdue_items,
            },
            "promises": promises,
            "actions": action_rows,
            "queues": queues,
            "judicial": judicial,
            "monthly": monthly_promises,
        }

        # ---------------- Tesorería ----------------
        bank_states = []
        bank_amount = 0.0
        bank_count = 0
        if _model("financing.bank.import.line"):
            BL = request.env["financing.bank.import.line"].sudo()
            rows = BL.search_read(
                [("date_value", ">=", d0), ("date_value", "<=", d1)],
                ["state", "amount", "currency_id", "date_value"])
            bank_count = len(rows)
            agg = {}
            for r in rows:
                val = self._to_report(r.get("amount") or 0.0,
                                      self._cur(r.get("currency_id")),
                                      self._as_date(r.get("date_value")) or today)
                bank_amount += val
                st = r.get("state") or "—"
                a = agg.setdefault(st, {"count": 0, "amount": 0.0})
                a["count"] += 1
                a["amount"] += val
            bank_states = [{"name": k, "count": v["count"], "value": round(v["amount"], 2)}
                           for k, v in agg.items()]
        due = {"d30": 0.0, "d60": 0.0, "d90": 0.0, "more": 0.0}
        due_table = []
        currencies = {}
        if _model("financing.installment"):
            INS = request.env["financing.installment"].sudo()
            rows = INS.search_read(
                [("state", "=", "pending"), ("date_due", ">=", today)],
                ["date_due", "amount_balance", "currency_id", "operation_id",
                 "name"], order="date_due", limit=500)
            for r in rows:
                dd = self._as_date(r.get("date_due"))
                val = self._to_report(r.get("amount_balance") or 0.0,
                                      self._cur(r.get("currency_id")), dd or today)
                days = (dd - today).days if dd else 0
                if days <= 30:
                    due["d30"] += val
                elif days <= 60:
                    due["d60"] += val
                elif days <= 90:
                    due["d90"] += val
                else:
                    due["more"] += val
                cur_name = self._cur(r.get("currency_id")).name
                currencies[cur_name] = currencies.get(cur_name, 0.0) + val
                due_table.append({
                    "cliente": op_partner.get((r.get("operation_id") or [None])[0], "—"),
                    "operacion": (r.get("operation_id") or [None, "—"])[1],
                    "cuota": r.get("name") or "",
                    "fecha": dd.strftime("%d/%m/%Y") if dd else "",
                    "monto": round(val, 2),
                })
        due_table = due_table[:10]
        payments = 0.0
        accruals = 0.0
        monthly_cobrado, monthly_devengado = [], []
        ranges = self._month_ranges(12, self._chart_end())
        cob_vals = [0.0] * len(ranges)
        dev_vals = [0.0] * len(ranges)
        for r in request.env["account.move.line"].sudo().search_read(
                [("financing_move_type", "in", ("payment", "accrual")),
                 ("date", ">=", ranges[0][1]), ("date", "<", ranges[-1][2])],
                ["balance", "date", "financing_move_type"]):
            day = self._as_date(r.get("date"))
            if not day:
                continue
            idx = self._bucket_index(ranges, day)
            if idx is None:
                continue
            val = self._at(r.get("balance") or 0.0, day)
            if r.get("financing_move_type") == "payment":
                payments += val if d0 <= day <= d1 else 0.0
                cob_vals[idx] += val
            else:
                accruals += val if d0 <= day <= d1 else 0.0
                dev_vals[idx] += val
        monthly_cobrado = [{"name": ranges[i][0], "value": round(cob_vals[i], 2)}
                           for i in range(len(ranges))]
        monthly_devengado = [{"name": ranges[i][0], "value": round(dev_vals[i], 2)}
                             for i in range(len(ranges))]
        matching = [r for r in bank_states
                    if (r["name"] or "").lower() in ("matched", "reconciled", "done")]
        matched = sum(r["count"] for r in matching)
        conciliation = (matched / bank_count * 100) if bank_count else 0.0
        tesoreria = {
            "kpis": {
                "tes_recaudacion": round(bank_amount if bank_count else payments, 2),
                "tes_banco": round(bank_amount, 2),
                "tes_lineas": bank_count,
                "tes_conciliadas": round(conciliation, 1),
                "tes_pendientes": max(bank_count - matched, 0),
                "tes_v30": round(due["d30"], 2),
                "tes_v60": round(due["d60"], 2),
                "tes_v90": round(due["d90"], 2),
                "tes_more": round(due["more"], 2),
                "tes_cobrado": round(payments, 2),
                "tes_devengado": round(accruals, 2),
            },
            "due": [
                {"name": "0–30 d", "value": round(due["d30"], 2)},
                {"name": "31–60 d", "value": round(due["d60"], 2)},
                {"name": "61–90 d", "value": round(due["d90"], 2)},
                {"name": "+90 d", "value": round(due["more"], 2)},
            ],
            "bank_states": bank_states,
            "currencies": [{"name": k, "value": round(v, 2)}
                           for k, v in sorted(currencies.items(), key=lambda x: -x[1])],
            "table": due_table,
            "monthly_cobrado": monthly_cobrado,
            "monthly_devengado": monthly_devengado,
        }

        # ---------------- Comercial ----------------
        clients = {}
        channels_c, vendors_c, programs_c, subjects = {}, {}, {}, {}
        for o in active:
            pid = (o.get("partner_id") or [None])[0]
            c = clients.setdefault(pid, {"name": (o.get("partner_id") or [None, "—"])[1],
                                         "count": 0, "value": 0.0})
            c["count"] += 1
            c["value"] += conv(o, o.get("balance_due") if "balance_due" in o else o.get("amount_principal"))
            ch = (o.get("channel_id") or [None, "Sin canal"])[1]
            channels_c[ch] = channels_c.get(ch, 0.0) + conv(o, o.get("amount_principal"))
            vd = (o.get("vendor_id") or [None, "Sin proveedor"])[1]
            vendors_c[vd] = vendors_c.get(vd, 0.0) + conv(o, o.get("amount_principal"))
            pg = (o.get("credit_program_id") or [None, "Sin programa"])[1]
            programs_c[pg] = programs_c.get(pg, 0.0) + conv(o, o.get("amount_principal"))
            sub = o.get("subject_type") or "natural"
            subjects[sub] = subjects.get(sub, 0) + 1
        total_client = sum(c["value"] for c in clients.values())
        top_client = max([c["value"] for c in clients.values()] or [0.0])
        com_cartera = sum(conv(o, o.get("balance_due") or o.get("amount_principal"))
                          for o in active)
        objects = []
        if _model("financing.financed.object"):
            FO = request.env["financing.financed.object"].sudo()
            rows = FO.search_read([], ["value", "object_type_id", "currency_id"])
            agg = {}
            for r in rows:
                name = (r.get("object_type_id") or [None, "Sin tipo"])[1]
                val = self._to_report(r.get("value") or 0.0,
                                      self._cur(r.get("currency_id")), today)
                a = agg.setdefault(name, {"count": 0, "value": 0.0})
                a["count"] += 1
                a["value"] += val
            objects = [{"name": k, "count": v["count"], "value": round(v["value"], 2)}
                       for k, v in agg.items()]
        comercial = {
            "kpis": {
                "com_clientes": len([c for c in clients.values() if c["count"]]),
                "com_operaciones": len(active),
                "com_ticket": round((sum(conv(o, o.get("amount_principal")) for o in active)
                                     / len(active)) if active else 0.0, 2),
                "com_concentracion": round((top_client / total_client * 100)
                                           if total_client else 0.0, 1),
                "com_pn": subjects.get("natural", 0),
                "com_pj": subjects.get("legal", 0),
                "com_cartera": round(com_cartera, 2),
                "com_top1": round(top_client, 2),
                "com_rest": round(max(total_client - top_client, 0.0), 2),
            },
            "clients": sorted([{"name": c["name"], "count": c["count"],
                                "value": round(c["value"], 2)}
                               for c in clients.values()], key=lambda x: -x["value"]),
            "programs": [{"name": k, "value": round(v, 2)}
                         for k, v in sorted(programs_c.items(), key=lambda x: -x[1])],
            "channels": [{"name": k, "value": round(v, 2)}
                         for k, v in sorted(channels_c.items(), key=lambda x: -x[1])],
            "vendors": [{"name": k, "value": round(v, 2)}
                        for k, v in sorted(vendors_c.items(), key=lambda x: -x[1])],
            "subjects": [{"name": ("Persona natural" if k == "natural" else "Persona jurídica"),
                          "value": v} for k, v in subjects.items()],
            "objects": objects,
            "monthly": op_monthly(ops, "date_quote", "amount_requested"),
        }

        # ---------------- Eficiencia / SLA ----------------
        stages = []
        outside = 0
        total_stage = 0
        deadlines = {}
        if _model("financing.stage.deadline"):
            for d in request.env["financing.stage.deadline"].sudo().search_read(
                    [], ["stage", "days"]):
                if d.get("stage"):
                    deadlines.setdefault(d.get("stage"), d.get("days") or 0)
        if _model("financing.partner.document.stage.log"):
            SL = request.env["financing.partner.document.stage.log"].sudo()
            rows = SL.search_read([], ["stage", "duration_hours", "date_start", "date_end"])
            agg = {}
            for r in rows:
                st = r.get("stage") or "—"
                dur = r.get("duration_hours") or 0.0
                a = agg.setdefault(st, {"count": 0, "hours": 0.0, "max": 0.0})
                a["count"] += 1
                a["hours"] += dur
                a["max"] = max(a["max"], dur)
                total_stage += 1
                limit = deadlines.get(st)
                if limit and dur > limit * 24:
                    outside += 1
            stages = [{"name": k, "count": v["count"],
                       "value": round((v["hours"] / v["count"]) / 24, 1),
                       "hours": round(v["hours"] / v["count"], 1),
                       "max": round(v["max"] / 24, 1)}
                      for k, v in agg.items()]
        doc_states = []
        docs_expired = 0
        docs_pending = 0
        if _model("financing.partner.document"):
            DOC = request.env["financing.partner.document"].sudo()
            for r in DOC.search_read([], ["state", "expiry_date"]):
                st = r.get("state") or "—"
                doc_states.append(st)
                if st == "pending":
                    docs_pending += 1
                exp = self._as_date(r.get("expiry_date"))
                if exp and exp < today and st != "received":
                    docs_expired += 1
            agg = {}
            for st in doc_states:
                agg[st] = agg.get(st, 0) + 1
            doc_states = [{"name": k, "value": v}
                          for k, v in sorted(agg.items(), key=lambda x: -x[1])]
        form_progress = []
        pending_recaudos = 0
        if "financing_partner_form_progress" in request.env["res.partner"]._fields:
            Partner = request.env["res.partner"].sudo()
            rows = Partner.search_read([("financing_operation_ids", "!=", False)],
                                       ["financing_partner_form_progress",
                                        "financing_origination_pending_count"])
            form_progress = [r.get("financing_partner_form_progress") or 0 for r in rows]
            pending_recaudos = sum(r.get("financing_origination_pending_count") or 0
                                   for r in rows)
        reversals = 0
        if _model("financing.reversal.event"):
            reversals = request.env["financing.reversal.event"].sudo().search_count([])
        sla = {
            "kpis": {
                "sla_total": total_stage,
                "sla_dentro": max(total_stage - outside, 0),
                "sla_ciclo": round((sum(s["value"] for s in stages) / len(stages))
                                   if stages else 0.0, 1),
                "sla_fuera": round((outside / total_stage * 100) if total_stage else 0.0, 1),
                "sla_docs_vencidos": docs_expired,
                "sla_docs_pendientes": docs_pending,
                "sla_recaudos": pending_recaudos,
                "sla_fichas": round((sum(form_progress) / len(form_progress))
                                    if form_progress else 0.0, 1),
                "sla_reversos": reversals,
            },
            "stages": stages,
            "doc_states": doc_states,
            "deadlines": [{"name": k, "value": v} for k, v in deadlines.items()],
        }

        return {"originacion": originacion, "cobranza": cobranza,
                "tesoreria": tesoreria, "comercial": comercial, "sla": sla}

    def _currency_options(self):
        currencies = request.env["res.currency"].search([("active", "=", True)])
        comp = self._company_currency()
        out = [{"id": comp.id, "name": comp.name, "symbol": comp.symbol or comp.name}]
        for c in currencies:
            if c.id != comp.id:
                out.append({"id": c.id, "name": c.name, "symbol": c.symbol or c.name})
        return out

    def _data(self):
        financing = self._financing()
        cur = self._report_currency()
        data = {
            "currencies": self._currency_options(),
            "filters": {
                "period": self._f["period"],
                "date_from": self._f["date_from"].isoformat(),
                "date_to": self._f["date_to"].isoformat(),
                "month": self._f["month"],
                "year": self._f["year"],
                "currency_id": cur.id,
                "currency_symbol": cur.symbol or cur.name,
                "company_id": request.env.company.id,
            },
            "metrics": financing.get("metrics", {}) if financing.get("available") else {},
            "financing": financing,
            "role": {"is_manager": True, "seller_only": False},
            "user": {
                "name": request.env.user.name or request.env.user.login,
                "login": request.env.user.login,
                "job_title": getattr(request.env.user.partner_id, "function", "") or "",
            },
            "company": {"name": request.env.company.name},
            "debug": bool(request.session.debug),
        }
        data.update(self._analytics(financing))
        data.update(self._extra_categories(financing))
        return data

    # ------------------------------------------------------------------
    # Drill-through
    # ------------------------------------------------------------------
    def _drill(self, key=None, search="", sort="", direction="asc", page=1, limit=50):
        custom = self._financing_drill(key) if key else None
        if not custom:
            return {"columns": [], "rows": [], "total": 0, "page": 1, "pages": 1,
                    "title": key or "", "kind": "empty", "model": ""}
        columns, rows, kind, model = custom
        if search:
            s = search.lower()
            rows = [r for r in rows if any(s in str(v).lower() for v in r.values())]
        if sort:
            col = next((c for c in columns if c["name"] == sort), None)
            numeric = bool(col and col["type"] in ("num", "money"))
            rows.sort(key=lambda r: (r.get(sort) or 0) if numeric else str(r.get(sort) or ""),
                      reverse=(direction == "desc"))
        total = len(rows)
        try:
            page = max(1, int(page))
        except Exception:
            page = 1
        try:
            limit = max(1, min(500, int(limit)))
        except Exception:
            limit = 50
        pages = max(1, (total + limit - 1) // limit)
        page = min(page, pages)
        rows = rows[(page - 1) * limit: page * limit]
        cur = self._report_currency()
        return {"columns": columns, "rows": rows, "total": total, "page": page, "pages": pages,
                "title": self._drill_title(key), "kind": kind, "model": model,
                "currency": (cur.symbol or cur.name), "currency_name": cur.name,
                "facets": [], "facet_field": None, "facet": None}

    def _drill_title(self, key):
        return {
            "fin_cartera": "Cartera total",
            "fin_mora": "Mora de cartera",
            "fin_mora_pct": "Mora de cartera",
            "fin_aging90": "Cartera +90 días",
            "fin_desembolsos": "Desembolsos del período",
            "fin_desembolsos_count": "Desembolsos del período",
            "fin_aprobados": "Aprobaciones del período",
            "fin_aprobados_count": "Aprobaciones del período",
            "fin_tasa_aprobacion": "Decisiones del comité",
            "fin_ticket": "Operaciones activas",
            "fin_provision": "Provisiones de cartera",
            "fin_cobertura": "Provisiones de cartera",
            "fin_fpd": "FPD por cosecha",
            "fin_perdida": "FPD por cosecha",
            "fin_tir": "Operaciones activas",
            "fin_operaciones": "Operaciones activas",
            "fin_clientes": "Operaciones activas",
            "fin_promesas_cumplidas": "Promesas de pago",
            "fin_promesas_incumplidas": "Promesas de pago",
            "fin_gestiones": "Gestiones de cobranza",
        }.get(key, key or "")

    def _financing_drill(self, key):
        if not _model("financing.operation") or not self._allowed():
            return None
        today = date.today()
        d0 = self._as_date(self._f.get("date_from")) or today
        d1 = self._as_date(self._f.get("date_to")) or today
        Op = request.env["financing.operation"].sudo()

        def C(*spec):
            return [{"name": s[0], "label": s[1],
                     "type": s[2] if len(s) > 2 else "num"} for s in spec]

        def conv(op, amount, field="date_disbursement"):
            cur = (request.env["res.currency"].browse(op["currency_id"][0])
                   if op.get("currency_id") else request.env.company.currency_id)
            on = self._as_date(op.get(field)) or self._as_date(op.get("date_quote")) or today
            return self._to_report(amount or 0.0, cur, on)

        op_fields = [f for f in (
            "name", "state", "balance_due", "balance_late", "days_overdue_max",
            "currency_id", "date_disbursement", "date_quote", "partner_id",
            "contractual_irr", "adjusted_irr", "amount_principal") if f in Op._fields]
        if key in ("fin_cartera", "fin_mora", "fin_mora_pct", "fin_aging90",
                   "fin_operaciones", "fin_ticket", "fin_tir"):
            rows = []
            for o in Op.search_read([("state", "in", ACTIVE_STATES)], op_fields):
                if key in ("fin_mora", "fin_mora_pct") and not (o.get("balance_late") or 0):
                    continue
                if key == "fin_aging90" and (o.get("days_overdue_max") or 0) <= 90:
                    continue
                if key not in ("fin_mora", "fin_mora_pct", "fin_aging90") and (o.get("balance_due") or 0) <= 0:
                    continue
                rows.append({
                    "cliente": (o.get("partner_id") or [None, "—"])[1],
                    "operacion": o.get("name") or "",
                    "estado": STATE_LABELS.get(o.get("state"), o.get("state") or ""),
                    "saldo": round(conv(o, o.get("balance_due")), 2),
                    "mora": round(conv(o, o.get("balance_late")), 2),
                    "dias": o.get("days_overdue_max") or 0,
                    "tir": round((o.get("contractual_irr") or 0) * 100, 1),
                })
            return (C(("cliente", "Cliente", "text"), ("operacion", "Operación", "text"),
                      ("estado", "Estado", "text"), ("saldo", "Saldo"), ("mora", "Mora"),
                      ("dias", "Días", "num"), ("tir", "TIR %", "num")),
                    rows, "grouped", "financing.operation")

        if key in ("fin_desembolsos", "fin_desembolsos_count"):
            rows = []
            for o in Op.search_read(
                    [("date_disbursement", ">=", d0), ("date_disbursement", "<=", d1)],
                    ["name", "partner_id", "amount_disbursed", "currency_id",
                     "date_disbursement", "state"]):
                rows.append({
                    "cliente": (o.get("partner_id") or [None, "—"])[1],
                    "operacion": o.get("name") or "",
                    "fecha": self._as_date(o.get("date_disbursement")).strftime("%d/%m/%Y")
                    if self._as_date(o.get("date_disbursement")) else "",
                    "monto": round(conv(o, o.get("amount_disbursed")), 2),
                    "estado": STATE_LABELS.get(o.get("state"), o.get("state") or ""),
                })
            return (C(("cliente", "Cliente", "text"), ("operacion", "Operación", "text"),
                      ("fecha", "Fecha", "text"), ("monto", "Desembolso"),
                      ("estado", "Estado", "text")),
                    rows, "grouped", "financing.operation")

        if key in ("fin_aprobados", "fin_tasa_aprobacion", "fin_aprobados_count"):
            if not _model("financing.credit.committee.line"):
                return None
            CL = request.env["financing.credit.committee.line"].sudo()
            dec_labels = {"approve": "Aprobada", "conditional": "Condicional",
                          "reject": "Rechazada"}
            rows = []
            for c in CL.search_read(
                    [("session_date", ">=", d0), ("session_date", "<=", d1)],
                    ["decision", "approved_amount", "session_date"]):
                d = self._as_date(c.get("session_date"))
                rows.append({"decision": dec_labels.get(c.get("decision"), c.get("decision") or ""),
                             "monto": round(self._conv(c.get("approved_amount") or 0), 2),
                             "fecha": d.strftime("%d/%m/%Y") if d else ""})
            return (C(("decision", "Decisión", "text"), ("monto", "Monto aprobado"),
                      ("fecha", "Fecha", "text")),
                    rows, "grouped", "financing.credit.committee.line")

        if key in ("fin_promesas_cumplidas", "fin_promesas_incumplidas"):
            if not _model("financing.payment.promise"):
                return None
            PP = request.env["financing.payment.promise"].sudo()
            st_labels = {"open": "Abierta", "kept": "Cumplida", "broken": "Incumplida",
                         "cancelled": "Cancelada"}
            rows = []
            for p in PP.search_read(
                    [("promise_date", ">=", d0), ("promise_date", "<=", d1)],
                    ["state", "amount", "promise_date", "partner_id", "operation_id"]):
                d = self._as_date(p.get("promise_date"))
                rows.append({
                    "cliente": (p.get("partner_id") or [None, "—"])[1],
                    "operacion": (p.get("operation_id") or [None, "—"])[1],
                    "estado": st_labels.get(p.get("state"), p.get("state") or ""),
                    "monto": round(self._conv(p.get("amount") or 0), 2),
                    "fecha": d.strftime("%d/%m/%Y") if d else "",
                })
            return (C(("cliente", "Cliente", "text"), ("operacion", "Operación", "text"),
                      ("estado", "Estado", "text"), ("monto", "Monto"),
                      ("fecha", "Fecha", "text")),
                    rows, "grouped", "financing.payment.promise")

        if key == "fin_gestiones":
            if not _model("financing.collection.action"):
                return None
            CA = request.env["financing.collection.action"].sudo()
            ch_labels = {"phone": "Teléfono", "email": "Correo", "visit": "Visita",
                         "whatsapp": "WhatsApp", "letter": "Carta"}
            res_labels = {"contact": "Contacto exitoso", "no_answer": "Sin respuesta",
                          "promise": "Promesa", "refused": "Rechazado", "info": "Información"}
            rows = []
            for a in CA.search_read([("date", ">=", d0), ("date", "<=", d1)],
                                    ["date", "channel", "result", "partner_id", "operation_id"]):
                d = self._as_date(a.get("date"))
                rows.append({
                    "cliente": (a.get("partner_id") or [None, "—"])[1],
                    "operacion": (a.get("operation_id") or [None, "—"])[1],
                    "canal": ch_labels.get(a.get("channel"), a.get("channel") or ""),
                    "resultado": res_labels.get(a.get("result"), a.get("result") or ""),
                    "fecha": d.strftime("%d/%m/%Y") if d else "",
                })
            return (C(("cliente", "Cliente", "text"), ("operacion", "Operación", "text"),
                      ("canal", "Canal", "text"), ("resultado", "Resultado", "text"),
                      ("fecha", "Fecha", "text")),
                    rows, "grouped", "financing.collection.action")

        if key in ("fin_fpd", "fin_perdida"):
            if not _model("financing.risk.report.cohort"):
                return None
            CO = request.env["financing.risk.report.cohort"].sudo()
            rows = []
            for c in CO.search_read([], ["cohort_month", "operation_count", "fpd_count",
                                         "fpd_rate", "expected_loss_total"],
                                    order="cohort_month desc", limit=24):
                d = self._as_date(c.get("cohort_month"))
                rows.append({
                    "cosecha": d.strftime("%m/%Y") if d else "",
                    "operaciones": c.get("operation_count") or 0,
                    "fpd": c.get("fpd_count") or 0,
                    "tasa": round((c.get("fpd_rate") or 0) * 100, 1),
                    "perdida": round(self._conv(c.get("expected_loss_total") or 0), 2),
                })
            return (C(("cosecha", "Cosecha", "text"), ("operaciones", "Operaciones", "num"),
                      ("fpd", "FPD", "num"), ("tasa", "Tasa FPD %", "num"),
                      ("perdida", "Pérdida esperada")),
                    rows, "grouped", "financing.risk.report.cohort")

        if key in ("fin_provision", "fin_cobertura"):
            if not _model("financing.report.provision"):
                return None
            PR = request.env["financing.report.provision"].sudo()
            rows = []
            for r in PR.search_read([], ["balance_capital", "provision_balance",
                                         "provision_coverage"]):
                rows.append({
                    "capital": round(self._conv(r.get("balance_capital") or 0), 2),
                    "provision": round(self._conv(r.get("provision_balance") or 0), 2),
                    "cobertura": round((r.get("provision_coverage") or 0), 1),
                })
            return (C(("capital", "Capital pendiente"), ("provision", "Provisión"),
                      ("cobertura", "Cobertura %", "num")),
                    rows, "grouped", "financing.report.provision")
        return None

    # ------------------------------------------------------------------
    # Rutas
    # ------------------------------------------------------------------
    @http.route("/stade/financing-bi", type="http", auth="user", website=False)
    def financing_bi(self, **kw):
        if not self._allowed():
            return request.not_found()
        import os
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "static", "src", "maqueta_financing.html")
        with open(path, "r", encoding="utf-8") as fh:
            html = fh.read()
        boot = {k: kw.get(k) for k in ("period", "company_id", "currency_id",
                                       "date_from", "date_to") if kw.get(k)}
        if boot:
            html = html.replace(
                "<head>",
                "<head><script>window.STADE_BOOT = %s;</script>" % json.dumps(boot), 1)
        return request.make_response(
            html, headers=[("Content-Type", "text/html; charset=utf-8"),
                           ("Cache-Control", "no-store, max-age=0"),
                           ("Pragma", "no-cache")])

    @http.route("/stade/financing-bi/data", type="json", auth="user")
    def financing_bi_data(self, **kw):
        if not self._allowed():
            return {"filters": {}, "metrics": {}, "financing": {"available": False},
                    "role": {"is_manager": False}, "debug": False}
        self._set_filters(kw)
        return self._data()

    @http.route("/stade/financing-bi/drill", type="json", auth="user")
    def financing_bi_drill(self, key=None, **kw):
        if not self._allowed():
            return {"columns": [], "rows": [], "total": 0, "page": 1, "pages": 1,
                    "title": key or "", "kind": "empty", "model": ""}
        self._set_filters(kw)
        return self._drill(key=key, search=kw.get("search", ""), sort=kw.get("sort", ""),
                           direction=kw.get("direction", "asc"), page=kw.get("page", 1),
                           limit=kw.get("limit", 50))
