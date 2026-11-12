(function () {
    "use strict";

    var STADE_F = { period: "anio", currency_id: "", date_from: "", date_to: "", month: "", year: "" };
    var DATA = null;
    var LOAD = 0;
    var SYM = "$";
    var ACTIVE = "cartera";
    var LAST_CFG = null;
    var DRILL_KEYS = {
        fin_cartera: 1, fin_mora: 1, fin_mora_pct: 1, fin_aging90: 1,
        fin_desembolsos: 1, fin_operaciones: 1, fin_tir: 1, fin_provision: 1,
        fin_cobertura: 1, fin_perdida: 1, fin_fpd: 1
    };

    var TITLES = {
        cartera: ["Cartera y mora", "Tamaño, composición y mora de la cartera"],
        riesgo: ["Riesgo y provisiones", "Pérdida esperada, cobertura y cosechas"],
        rentabilidad: ["Rentabilidad", "TIR, ingresos y spread del negocio"],
        originacion: ["Originación y comité", "Embudo, aprobación y colocación"],
        cobranza: ["Cobranza", "Promesas, gestiones, colas y vencido"],
        tesoreria: ["Tesorería", "Cobros, banco y flujo de vencimientos"],
        comercial: ["Comercial y producto", "Clientes, canales, programas y bienes"],
        sla: ["Eficiencia y SLA", "Tiempos, documentos y etapas"]
    };

    var MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    var THEME = "dark";
    var SEG_COLORS = ["#5B9BD5", "#4DB6AC", "#D4AF6A", "#8A8F98", "#5E6B7A"];
    var GAUGE_COLORS = ["#5B9BD5", "#4DB6AC", "#D4AF6A"];
    var CHART = { grid: "#232323", label: "#7a7f87", line: "#5B9BD5", area: "#5B9BD5",
        bar: "#2A4257", barHot: "#D4AF6A", maxLabel: "#D4AF6A", gaugeOff: "#262626", stepped2: "#4DB6AC" };

    function readScheme() {
        var m = document.cookie.match(/(?:^|;\s*)color_scheme=([^;]+)/);
        if (m) return decodeURIComponent(m[1]) === "dark" ? "dark" : "light";
        try {
            var pel = window.parent.document.documentElement;
            var pbody = window.parent.document.body;
            if (pel.getAttribute("data-bs-theme") === "dark" ||
                pel.classList.contains("o_color_scheme_dark") ||
                (pbody && pbody.classList.contains("o_color_scheme_dark"))) return "dark";
        } catch (e) {}
        return "light";
    }

    function applyTheme(scheme) {
        THEME = scheme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", THEME);
        var light = THEME === "light";
        SEG_COLORS = light
            ? ["#2F5D8A", "#2F7F7A", "#B98A3C", "#8A8F98", "#C9D1D9"]
            : ["#5B9BD5", "#4DB6AC", "#D4AF6A", "#8A8F98", "#5E6B7A"];
        GAUGE_COLORS = light
            ? ["#2F5D8A", "#2F7F7A", "#B98A3C"]
            : ["#5B9BD5", "#4DB6AC", "#D4AF6A"];
        CHART = light ? {
            grid: "#e6e4df", label: "#8a877f", line: "#2F5D8A", area: "#2F5D8A",
            bar: "#D6E2EE", barHot: "#B98A3C", maxLabel: "#B98A3C", gaugeOff: "#eceae4",
            stepped2: "#2F7F7A"
        } : {
            grid: "#232323", label: "#7a7f87", line: "#5B9BD5", area: "#5B9BD5",
            bar: "#2A4257", barHot: "#D4AF6A", maxLabel: "#D4AF6A", gaugeOff: "#262626",
            stepped2: "#4DB6AC"
        };
    }

    var TIPS = {
        "Cartera total": "Saldo por cobrar de las operaciones activas: capital + interés + mora.",
        "Desembolsos": "Monto colocado en el período seleccionado.",
        "Mora": "Saldo vencido sobre la cartera total.",
        "TIR contractual": "TIR contractual ponderada por capital financiado.",
        "Evolución de desembolsos": "Monto desembolsado por día o mes según el período.",
        "Desembolsos del período": "Monto colocado en el período seleccionado.",
        "Operaciones activas": "Operaciones con saldo pendiente de cobro.",
        "Provisión y pérdida": "Provisión constituida frente a la pérdida esperada.",
        "Composición por antigüedad": "Distribución del saldo por antigüedad de mora.",
        "Operaciones desembolsadas": "Cantidad de operaciones desembolsadas por período.",
        "Pérdida esperada": "PD × LGD × EAD de la cartera activa.",
        "Provisión": "Provisión constituida para cubrir la pérdida esperada.",
        "Cobertura": "Provisión sobre capital pendiente.",
        "FPD": "Primer pago vencido de las operaciones de la cosecha.",
        "Pérdida esperada por cosecha": "Pérdida esperada acumulada por mes de desembolso.",
        "Cobertura de provisión": "Provisión constituida sobre la pérdida esperada.",
        "Exposición (EAD)": "Saldo expuesto al incumplimiento.",
        "Riesgo de crédito": "Indicadores de pérdida esperada y cobertura.",
        "FPD por cosecha": "Tasa de primer pago vencido por cosecha.",
        "TIR ajustada": "TIR ajustada por riesgo de la operación.",
        "Prima de riesgo": "Prima exigida por riesgo, ponderada por capital.",
        "Spread de riesgo": "TIR contractual menos prima de riesgo.",
        "Ingreso financiero": "Intereses, comisiones y seguro devengados en el período.",
        "Composición del ingreso": "Peso de intereses, comisiones y seguro.",
        "Rendimiento del período": "Ingreso por intereses sobre la cartera.",
        "Ingresos": "Detalle de los ingresos del período.",
        "TIR ajustada por programa": "TIR ajustada por riesgo de cada programa.",
        "Programas": "Programas de crédito y su aporte a la cartera.",
        "Aging de cartera": "Distribución del saldo por antigüedad.",
        "Provisión y brecha": "Provisión constituida frente a la pérdida esperada y brecha sin cubrir.",
        "Cosechas": "Comportamiento de las operaciones agrupadas por mes de desembolso.",
        "Castigos": "Pérdida realizada al castigo frente a la pérdida esperada.",
        "Operaciones por pérdida esperada": "Operaciones con mayor pérdida esperada.",
        "PD promedio": "Probabilidad de incumplimiento ponderada por EAD.",
        "LGD promedio": "Severidad de la pérdida ponderada por EAD.",
        "EAD": "Exposición al incumplimiento: saldo expuesto."
    };

    /* ----------------------------- format ----------------------------- */
    window.fmtDec = function (v, dec) {
        v = Number(v) || 0;
        return v.toLocaleString("es-VE", {
            minimumFractionDigits: 0,
            maximumFractionDigits: dec === undefined ? 1 : dec
        });
    };

    function symbol() { return SYM; }

    function money(v) {
        return SYM + " " + (Number(v) || 0).toLocaleString("es-VE", {
            minimumFractionDigits: 2, maximumFractionDigits: 2
        });
    }

    function shortMoney(v) {
        var a = Math.abs(v || 0);
        if (a >= 1e9) return SYM + " " + (v / 1e9).toFixed(1).replace(".", ",") + "B";
        if (a >= 1e6) return SYM + " " + (v / 1e6).toFixed(1).replace(".", ",") + "M";
        if (a >= 1e3) return SYM + " " + Math.round(v / 1e3) + "k";
        return SYM + " " + (Number(v) || 0).toFixed(0);
    }

    function fmt(v, f) {
        if (f === "days") return Math.round(v || 0) + " d";
        if (f === "compact") {
            var a = Math.abs(v || 0);
            if (!a) return SYM + " 0";
            if (a >= 1e9) return SYM + " " + (v / 1e9).toFixed(2).replace(".", ",") + "B";
            if (a >= 1e6) return SYM + " " + (v / 1e6).toFixed(1).replace(".", ",") + "M";
            if (a >= 1e3) return SYM + " " + Math.round(v / 1e3) + "k";
            return money(v);
        }
        if (f === "percent") return fmtDec(v, 1) + "%";
        if (f === "number") return Math.round(v || 0).toLocaleString("es-VE");
        if (f === "signedpct") return (v >= 0 ? "▲ " : "▼ ") + fmtDec(Math.abs(v), 1) + "%";
        return money(v);
    }

    function pct(v) { return fmtDec(v, 1) + "%"; }

    function $id(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s === undefined || s === null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function deltaHTML(delta, note) {
        if (delta === null || delta === undefined) {
            return note ? '<span class="delta flat">•</span> ' + esc(note) : "";
        }
        var up = Number(delta) >= 0;
        return '<span class="delta ' + (up ? "up" : "down") + '">' +
            (up ? "▲" : "▼") + " " + fmtDec(Math.abs(delta), 1) + "%</span> " + esc(note || "");
    }

    /* ----------------------------- charts ----------------------------- */
    function emptyChart(el) {
        el.innerHTML = '<div class="chart-empty">Sin datos en el período.</div>';
    }

    function smoothPath(points) {
        if (!points.length) return "";
        if (points.length === 1) return "M" + points[0][0] + " " + points[0][1];
        var d = "M" + points[0][0] + " " + points[0][1];
        for (var i = 0; i < points.length - 1; i++) {
            var p0 = points[i === 0 ? 0 : i - 1];
            var p1 = points[i];
            var p2 = points[i + 1];
            var p3 = points[i + 2 < points.length ? i + 2 : i + 1];
            var cp1x = p1[0] + (p2[0] - p0[0]) / 6;
            var cp1y = p1[1] + (p2[1] - p0[1]) / 6;
            var cp2x = p2[0] - (p3[0] - p1[0]) / 6;
            var cp2y = p2[1] - (p3[1] - p1[1]) / 6;
            d += "C" + cp1x + " " + cp1y + " " + cp2x + " " + cp2y + " " + p2[0] + " " + p2[1];
        }
        return d;
    }

    function drawArea(id, series, opts) {
        var el = $id(id);
        if (!el) return;
        var items = series || [];
        var max = Math.max.apply(null, items.map(function (i) { return i.value || 0; }).concat([0]));
        if (!items.length || max <= 0) { emptyChart(el); return; }
        var W = el.clientWidth || 760, H = el.clientHeight || 260;
        var padL = 52, padR = 12, padT = 12, padB = 26;
        var iw = W - padL - padR, ih = H - padT - padB, n = items.length;
        var x = function (i) { return padL + (n === 1 ? iw / 2 : iw * i / (n - 1)); };
        var y = function (v) { return padT + ih - (v / max) * ih; };
        var fmtY = (opts && opts.fmtY) || shortMoney;
        var svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">';
        svg += '<defs><linearGradient id="agrad" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="' + CHART.area + '" stop-opacity="0.16"/>' +
            '<stop offset="100%" stop-color="' + CHART.area + '" stop-opacity="0"/></linearGradient></defs>';
        for (var g = 0; g <= 4; g++) {
            var v = max * g / 4, yy = y(v);
            svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy +
                '" stroke="' + CHART.grid + '" stroke-width="1" stroke-dasharray="3 5"/>';
            svg += '<text x="' + (padL - 8) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="9" fill="' + CHART.label + '">' + fmtY(v) + "</text>";
        }
        var pts = items.map(function (it, i) { return [x(i), y(it.value || 0)]; });
        var line = smoothPath(pts);
        var area = line + "L" + x(n - 1) + " " + y(0) + " L" + x(0) + " " + y(0) + " Z";
        svg += '<path d="' + area + '" fill="url(#agrad)"/>';
        svg += '<path d="' + line + '" fill="none" stroke="' + CHART.line + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
        var step = Math.max(1, Math.ceil(n / 8));
        items.forEach(function (it, i) {
            if (i % step === 0 || i === n - 1) {
                svg += '<text x="' + x(i) + '" y="' + (H - 7) + '" text-anchor="middle" font-size="9" fill="' + CHART.label + '">' + esc(it.name) + "</text>";
            }
        });
        svg += "</svg>";
        el.innerHTML = svg;
    }

    function drawGauge(id, items) {
        var el = $id(id);
        if (!el) return;
        var total = (items || []).reduce(function (s, i) { return s + (i.value || 0); }, 0);
        var N = 64, size = 210, cx = size / 2, cy = size / 2, r1 = 74, r2 = 90;
        var thresholds = [], acc = 0;
        (items || []).forEach(function (it, i) {
            acc += it.value || 0;
            thresholds.push({ end: total ? acc / total : 0, color: GAUGE_COLORS[i % GAUGE_COLORS.length] });
        });
        var svg = '<svg viewBox="0 0 ' + size + " " + size + '" style="width:' + size + "px;height:" + size + 'px">';
        for (var i = 0; i < N; i++) {
            var f = (i + 0.5) / N;
            var color = CHART.gaugeOff;
            if (total > 0) {
                for (var k = 0; k < thresholds.length; k++) {
                    if (f <= thresholds[k].end) { color = thresholds[k].color; break; }
                }
            }
            var ang = (-90 + i * (360 / N)) * Math.PI / 180;
            var x1 = cx + r1 * Math.cos(ang), y1 = cy + r1 * Math.sin(ang);
            var x2 = cx + r2 * Math.cos(ang), y2 = cy + r2 * Math.sin(ang);
            svg += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
                '" stroke="' + color + '" stroke-width="5" stroke-linecap="round"/>';
        }
        svg += "</svg>";
        el.innerHTML = svg;
    }

    function drawMini(id, values) {
        var el = $id(id);
        if (!el) return;
        var vals = (values || []).slice(-34);
        if (!vals.length) { el.innerHTML = ""; return; }
        var max = Math.max.apply(null, vals.concat([0]));
        if (max <= 0) { el.innerHTML = ""; return; }
        el.innerHTML = vals.map(function (v) {
            var h = Math.max(2, Math.round((v / max) * 100));
            var color = v === max ? CHART.barHot : CHART.bar;
            return '<span style="height:' + h + '%;background:' + color + '"></span>';
        }).join("");
    }

    function drawBars(id, series, opts) {
        var el = $id(id);
        if (!el) return;
        var items = series || [];
        var max = Math.max.apply(null, items.map(function (i) { return i.value || 0; }).concat([0]));
        if (!items.length || max <= 0) { emptyChart(el); return; }
        var W = el.clientWidth || 760, H = el.clientHeight || 210;
        var padL = 40, padR = 10, padT = 22, padB = 26;
        var iw = W - padL - padR, ih = H - padT - padB, n = items.length;
        var gap = n > 40 ? 1 : 3;
        var bw = n === 1 ? Math.min(140, iw * 0.22) : Math.max(2, (iw - gap * (n - 1)) / n);
        var fmtY = (opts && opts.fmtY) || function (v) { return Math.round(v); };
        var svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">';
        for (var g = 0; g <= 4; g++) {
            var v = max * g / 4, yy = padT + ih - (v / max) * ih;
            svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy +
                '" stroke="' + CHART.grid + '" stroke-width="1" stroke-dasharray="3 5"/>';
            svg += '<text x="' + (padL - 7) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="8.5" fill="' + CHART.label + '">' + fmtY(v) + "</text>";
        }
        var maxIdx = 0;
        items.forEach(function (it, i) { if ((it.value || 0) > (items[maxIdx].value || 0)) maxIdx = i; });
        items.forEach(function (it, i) {
            var h = Math.max(1, ((it.value || 0) / max) * ih);
            var xx = n === 1 ? padL + (iw - bw) / 2 : padL + i * (bw + gap);
            var yy = padT + ih - h;
            var fill = i === maxIdx ? CHART.barHot : CHART.bar;
            svg += '<rect x="' + xx.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) +
                '" rx="' + Math.min(2, bw / 2) + '" fill="' + fill + '"/>';
        });
        var step = Math.max(1, Math.ceil(n / 8));
        items.forEach(function (it, i) {
            if (i % step === 0 || i === n - 1) {
                var xx = (n === 1 ? padL + iw / 2 : padL + i * (bw + gap) + bw / 2);
                svg += '<text x="' + xx.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle" font-size="9" fill="' + CHART.label + '">' + esc(it.name) + "</text>";
            }
        });
        if ((opts && opts.maxLabel) !== false) {
            var mx = n === 1 ? padL + iw / 2 : padL + maxIdx * (bw + gap) + bw / 2;
            svg += '<text x="' + mx.toFixed(1) + '" y="' + (padT - 6) + '" text-anchor="middle" font-size="9" fill="' + CHART.maxLabel + '">' + fmtY(items[maxIdx].value || 0) + "</text>";
        }
        svg += "</svg>";
        el.innerHTML = svg;
    }

    function renderSegments(id, items, moneyVals) {
        var el = $id(id);
        if (!el) return;
        var total = (items || []).reduce(function (s, i) { return s + (i.value || 0); }, 0);
        if (!total) { el.innerHTML = '<div class="chart-empty" style="height:60px">Sin datos.</div>'; return; }
        var bar = items.map(function (it, i) {
            var w = ((it.value || 0) / total) * 100;
            return '<span style="width:' + w.toFixed(2) + "%;background:" + SEG_COLORS[i % SEG_COLORS.length] + '"></span>';
        }).join("");
        var leg = items.map(function (it, i) {
            var val = moneyVals ? shortMoney(it.value || 0) : Math.round(((it.value || 0) / total) * 100) + "%";
            return '<span><b style="background:' + SEG_COLORS[i % SEG_COLORS.length] + '"></b>' + esc(it.name) + " · " + val + "</span>";
        }).join("");
        el.innerHTML = '<div class="seg-bar">' + bar + '</div><div class="seg-legend">' + leg + "</div>";
    }

    /* ----------------------------- config ----------------------------- */
    function cfgCartera(D) {
        var C = D.cartera || {}, K = C.kpis || {}, R = D.riesgo || {}, RK = R.kpis || {};
        var P = D.rentabilidad || {}, PK = P.kpis || {}, M = D.metrics || {};
        var alerts = C.alerts || [];
        var attention = [];
        if ((K.car_vencidos || 0) > 0) attention.push({ icon: "▤", text: "Cuotas vencidas", count: K.car_vencidos });
        if ((K.car_en_mora || 0) > 0) attention.push({ icon: "◔", text: "Operaciones en mora", count: K.car_en_mora });
        if ((M.fin_promesas_incumplidas || 0) > 0) attention.push({ icon: "◷", text: "Promesas incumplidas", count: M.fin_promesas_incumplidas });
        if (!attention.length) attention = alerts.map(function (a) { return { icon: "!", text: a.text, count: 1 }; });
        return {
            kpis: [
                { label: "Cartera total", value: K.car_cartera, fmt: "compact", note: "Capital + interés + mora" },
                { label: "Mora", value: K.car_mora_pct, fmt: "percent", note: "Saldo vencido sobre cartera" },
                { label: "Cartera +90", value: K.car_aging90, fmt: "compact", note: pct(K.car_aging90_pct) + " de la cartera" },
                { label: "TIR contractual", value: PK.ren_tir, fmt: "percent", note: "Ajustada " + pct(PK.ren_tir_adj) }
            ],
            main: {
                title: "Evolución de desembolsos",
                value: K.car_desembolsos, fmt: "compact",
                sub: "Evolución de desembolsos · " + K.car_desembolsos_count + " operaciones · Ticket " + fmt(K.car_ticket, "compact") + " · Conversión " + pct(K.car_conversion),
                delta: M.fin_disb_delta,
                series: C.disbursements || [],
                fmtY: shortMoney
            },
            insight: "La mora es <b>" + pct(K.car_mora_pct) + "</b> sobre una cartera de <b>" + fmt(K.car_cartera, "compact") + "</b>. La cartera +90 representa <b>" + pct(K.car_aging90_pct) + "</b> y la cobertura de provisión es <b>" + pct(RK.rie_cobertura) + "</b>.",
            budget: {
                title: "Composición por antigüedad",
                value: K.car_mora, fmt: "compact",
                sub: "Saldo vencido por tramo",
                items: C.aging || [],
                money: true
            },
            bars: {
                title: "Cartera por programa",
                value: (C.programs || []).length, fmt: "number",
                sub: "Cartera por programa · saldo por programa",
                series: C.programs || [],
                fmtY: shortMoney
            },
            gauge: {
                title: "Cobertura de provisión",
                centerLabel: "Cobertura",
                centerValue: pct(RK.rie_cobertura),
                items: [
                    { name: "Provisión", value: RK.rie_provision || 0 },
                    { name: "No cubierto", value: Math.max((RK.rie_el || 0) - (RK.rie_provision || 0), 0) }
                ],
                detailKey: "fin_provision"
            },
            mini: {
                title: "Operaciones activas",
                value: K.car_operaciones, fmt: "number",
                left: (K.car_clientes || 0) + " clientes",
                right: "DPD " + fmt(K.car_dpd_avg, "days"),
                bars: (C.disbursements || []).map(function (d) { return d.value || 0; })
            },
            detail: {
                title: "Composición de la cartera",
                rows: [
                    { label: "Capital", value: K.car_capital, fmt: "compact" },
                    { label: "Interés", value: K.car_interes, fmt: "compact" },
                    { label: "Comisión", value: M.fin_comision, fmt: "compact" },
                    { label: "Gastos", value: M.fin_gastos, fmt: "compact" }
                ],
                detailKey: "fin_cartera"
            },
            tables: [
                {
                    title: "Mora por cosecha",
                    sub: "Saldo y mora por mes de desembolso.",
                    headers: ["Cosecha", "Ops", "Saldo", "Mora", "% Mora"],
                    rows: (C.vintage || []).map(function (v) {
                        return [esc(v.name), String(v.ops || 0), fmt(v.saldo || 0, "compact"),
                            fmt(v.mora || 0, "compact"), pct(v.mora_pct || 0)];
                    })
                },
                {
                    title: "Top operaciones",
                    sub: "Mayor exposición por cartera y mora.",
                    headers: ["Cliente", "Operación", "Saldo", "Mora", "Días"],
                    rows: (C.top || []).map(function (r) {
                        return [esc(r.cliente), esc(r.operacion), fmt(r.saldo || 0, "compact"),
                            fmt(r.mora || 0, "compact"), String(r.dias || 0)];
                    })
                },
                {
                    title: "Cartera por estado",
                    sub: "Saldo por estado de la operación.",
                    headers: ["Estado", "Saldo", "% cartera"],
                    rows: (C.states || []).map(function (st) {
                        return [esc(st.name), fmt(st.value || 0, "compact"),
                            pct(K.car_cartera ? (st.value / K.car_cartera * 100) : 0)];
                    })
                }
            ],
            attention: { title: "Observaciones", items: attention }
        };
    }

    function cfgRiesgo(D) {
        var C = D.cartera || {}, CK = C.kpis || {}, R = D.riesgo || {}, RK = R.kpis || {};
        var coverage = RK.rie_cobertura || 0;
        var fpd = RK.rie_fpd || 0;
        var attention = [];
        if ((RK.rie_provision || 0) <= 0) attention.push({ icon: "◌", text: "Sin provisión constituida", count: 1 });
        if (!attention.length) attention.push({ icon: "✓", text: "Sin observaciones" });
        return {
            kpis: [
                { label: "Pérdida esperada", value: RK.rie_el, fmt: "compact", note: "PD × LGD × EAD" },
                { label: "Provisión", value: RK.rie_provision, fmt: "compact", note: "Constituida" },
                { label: "Cobertura", value: coverage, fmt: "percent", note: "Provisión / pérdida esperada" },
                { label: "FPD", value: fpd, fmt: "percent", note: "Primer pago vencido" }
            ],
            main: {
                title: "Pérdida esperada por cosecha",
                value: RK.rie_el, fmt: "compact",
                sub: "Pérdida esperada por cosecha",
                delta: null,
                series: (R.cohorts || []).map(function (c) { return { name: c.name, value: c.loss || 0 }; }),
                fmtY: shortMoney
            },
            insight: "La cobertura de provisión es <b>" + pct(coverage) + "</b> de la pérdida esperada. El FPD se ubica en <b>" + pct(fpd) + "</b> y la pérdida realizada del período es <b>" + shortMoney(RK.rie_actual_loss || 0) + "</b>.",
            budget: {
                title: "Cobertura de provisión",
                value: coverage, fmt: "percent",
                sub: "Provisión sobre pérdida esperada",
                items: [
                    { name: "Provisión", value: RK.rie_provision || 0 },
                    { name: "No cubierto", value: Math.max((RK.rie_el || 0) - (RK.rie_provision || 0), 0) }
                ],
                money: true
            },
            bars: {
                title: "FPD por cosecha",
                value: fpd, fmt: "percent",
                sub: "FPD por cosecha",
                series: (R.cohorts || []).map(function (c) { return { name: c.name, value: c.rate || 0 }; }),
                fmtY: function (v) { return fmtDec(v, 0) + "%"; }
            },
            gauge: {
                title: "Pérdida esperada",
                centerLabel: "Cobertura",
                centerValue: pct(coverage),
                items: [
                    { name: "Provisión", value: RK.rie_provision || 0 },
                    { name: "No cubierto", value: Math.max((RK.rie_el || 0) - (RK.rie_provision || 0), 0) }
                ],
                detailKey: "fin_provision"
            },
            mini: {
                title: "Exposición (EAD)",
                value: RK.rie_ead, fmt: "compact",
                left: "PD " + pct(RK.rie_pd),
                right: "LGD " + pct(RK.rie_lgd),
                bars: (R.cohorts || []).map(function (c) { return c.loss || 0; })
            },
            detail: {
                title: "Riesgo de crédito",
                rows: [
                    { label: "Pérdida esperada", value: RK.rie_el, fmt: "compact" },
                    { label: "Provisión", value: RK.rie_provision, fmt: "compact" },
                    { label: "Gap", value: RK.rie_gap, fmt: "compact", tone: (RK.rie_gap || 0) >= 0 ? "good" : "bad" },
                    { label: "Exposición (EAD)", value: RK.rie_ead, fmt: "compact" }
                ],
                detailKey: "fin_perdida"
            },
            attention: { title: "Observaciones", items: attention }
        };
    }

    function cfgRentabilidad(D) {
        var P = D.rentabilidad || {}, K = P.kpis || {};
        var programs = (P.by_program || []).map(function (p) {
            return { icon: "▦", text: p.name, count: p.ops || 0 };
        });
        return {
            kpis: [
                { label: "TIR contractual", value: K.ren_tir, fmt: "percent", note: "Ponderada por capital" },
                { label: "TIR ajustada", value: K.ren_tir_adj, fmt: "percent", note: "Neta de riesgo" },
                { label: "Prima de riesgo", value: K.ren_prima, fmt: "percent", note: "Sobre el capital" },
                { label: "Spread de riesgo", value: K.ren_margen, fmt: "percent", note: "TIR − prima" }
            ],
            main: {
                title: "Ingreso financiero",
                value: K.ren_ingreso_total, fmt: "compact",
                sub: "Intereses + comisiones + seguro",
                delta: null,
                series: P.income_series || [],
                fmtY: shortMoney
            },
            insight: "La TIR contractual es <b>" + pct(K.ren_tir) + "</b> y la prima de riesgo <b>" + pct(K.ren_prima) + "</b>, dejando un spread de <b>" + pct(K.ren_margen) + "</b>. El ingreso del período es <b>" + shortMoney(K.ren_ingreso_total || 0) + "</b>.",
            budget: {
                title: "Composición del ingreso",
                value: K.ren_ingreso_total, fmt: "compact",
                sub: "Interés, comisión y seguro",
                items: P.income_mix || [],
                money: true
            },
            bars: {
                title: "TIR ajustada por programa",
                value: K.ren_tir_adj, fmt: "percent",
                sub: "TIR ajustada por programa",
                series: (P.by_program || []).map(function (p) { return { name: p.name, value: p.tir || 0 }; }),
                fmtY: function (v) { return fmtDec(v, 0) + "%"; }
            },
            gauge: {
                title: "Ingreso del período",
                centerLabel: "Ingreso total",
                centerValue: shortMoney(K.ren_ingreso_total || 0),
                items: P.income_mix || [],
                detailKey: null
            },
            mini: {
                title: "Rendimiento del período",
                value: K.ren_rendimiento, fmt: "percent",
                left: "Cuota/ingreso " + pct(K.ren_cuota_ingreso),
                right: "LTV " + pct(K.ren_ltv),
                bars: (P.income_series || []).map(function (d) { return d.value || 0; })
            },
            detail: {
                title: "Ingresos",
                rows: [
                    { label: "Intereses", value: K.ren_ingreso_interes, fmt: "compact" },
                    { label: "Comisión", value: K.ren_ingreso_comision, fmt: "compact" },
                    { label: "Seguro", value: K.ren_ingreso_seguro, fmt: "compact" },
                    { label: "Total", value: K.ren_ingreso_total, fmt: "compact" }
                ],
                detailKey: null
            },
            attention: { title: "Programas", items: programs }
        };
    }


    /* ---------------------- dashboard-5: Riesgo ---------------------- */
    function rankHTML(rows) {
        if (!rows || !rows.length) return '<div class="v5-empty">Sin datos.</div>';
        var max = Math.max.apply(null, rows.map(function (r) { return r.value || 0; }).concat([0])) || 1;
        return '<div class="rank-list">' + rows.map(function (r) {
            var w = Math.max(2, Math.round((r.value || 0) / max * 100));
            return '<div class="rank-row"><span class="rank-fill" style="width:' + w + '%"></span>' +
                '<span class="rank-name">' + esc(r.name) + '</span>' +
                '<span class="rank-value">' + fmt(r.value, r.fmt) + '</span></div>';
        }).join("") + "</div>";
    }

    function drawLine(id, series, opts) {
        var el = $id(id);
        if (!el) return;
        var items = series || [];
        var max = Math.max.apply(null, items.map(function (i) { return i.value || 0; }).concat([0]));
        if (!items.length || max <= 0) { emptyChart(el); return; }
        var W = el.clientWidth || 760, H = el.clientHeight || 230;
        var padL = 12, padR = 12, padT = 16, padB = 26;
        var iw = W - padL - padR, ih = H - padT - padB, n = items.length;
        var x = function (i) { return padL + (n === 1 ? iw / 2 : iw * i / (n - 1)); };
        var y = function (v) { return padT + ih - (v / max) * ih; };
        var svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">';
        for (var g = 0; g <= 3; g++) {
            var yy = padT + ih - (ih * g / 3);
            svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy +
                '" stroke="' + CHART.grid + '" stroke-width="1" stroke-dasharray="2 6"/>';
        }
        var pts = items.map(function (it, i) { return [x(i), y(it.value || 0)]; });
        var line = "M" + pts[0][0] + " " + pts[0][1];
        for (var i = 1; i < pts.length; i++) line += "L" + pts[i][0] + " " + pts[i][1];
        svg += '<path d="' + line + '" fill="none" stroke="' + CHART.line + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
        pts.forEach(function (p) {
            svg += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.2" fill="' + CHART.line + '" stroke="' + CHART.area + '" stroke-width="1.5"/>';
        });
        var step = Math.max(1, Math.ceil(n / 10));
        items.forEach(function (it, i) {
            if (i % step === 0 || i === n - 1) {
                svg += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9.5" fill="' + CHART.label + '">' + esc(it.name) + "</text>";
            }
        });
        svg += "</svg>";
        el.innerHTML = svg;
    }

    function cfgRiesgo5(D) {
        var R = D.riesgo || {}, K = R.kpis || {};
        var C = D.cartera || {}, F = D.financing || {};
        var coverage = K.rie_cobertura || 0;
        var fpd = K.rie_fpd || 0;
        var cohorts = R.cohorts || [];
        var top = R.top || [];
        var queues = F.queues || [];
        var roll = R.roll || [];
        var programs = C.programs || [];
        return {
            hero: {
                value: K.rie_ead, fmt: "compact",
                sub: "Exposición al incumplimiento · PD × LGD × EAD",
                pill: "Cosechas " + cohorts.length,
                pillTone: "",
                series: cohorts.map(function (c) { return { name: c.name, value: c.loss || 0 }; }),
                foot: [
                    { label: "Cosechas", value: cohorts.length, fmt: "number" },
                    { label: "Operaciones", value: cohorts.reduce(function (s, c) { return s + (c.ops || 0); }, 0), fmt: "number" },
                    { label: "Programas", value: programs.length, fmt: "number" }
                ]
            },
            side: {
                title: "Pérdida realizada",
                value: K.rie_actual_loss || 0, fmt: "compact",
                status: "Realizada frente a la esperada",
                tone: "neutral",
                rows: [],
                foot: ""
            },
            tables: [
                {
                    title: "Cosechas",
                    sub: "FPD y pérdida esperada por cosecha.",
                    headers: ["Cosecha", "Ops", "FPD", "Pérdida"],
                    rows: cohorts.map(function (c) {
                        return [esc(c.name), String(c.ops || 0), pct(c.rate || 0), fmt(c.loss || 0, "compact")];
                    })
                },
                {
                    title: "Operaciones por pérdida esperada",
                    sub: "Mayor exposición al riesgo.",
                    headers: ["Cliente", "PD", "LGD", "EL"],
                    rows: top.map(function (t) {
                        return [esc(t.cliente), pct(t.pd || 0), pct(t.lgd || 0), fmt(t.el || 0, "compact")];
                    })
                }
            ],
            cards: [
                {
                    title: "FPD por cosecha",
                    sub: "Tasa de primer pago vencido.",
                    rows: cohorts.map(function (c) {
                        return { name: c.name, value: c.rate || 0, fmt: "percent" };
                    })
                },
                {
                    title: "Colas de mora",
                    sub: "Operaciones por cola de cobranza.",
                    rows: queues.map(function (q) {
                        return { name: q.name, value: q.value || 0, fmt: "number" };
                    })
                },
                {
                    title: "Roll y cure",
                    sub: "Migración y regularización.",
                    rows: roll.map(function (r) {
                        return { name: r.name, value: r.roll || 0, fmt: "percent" };
                    })
                },
                {
                    title: "Reestructuradas y castigos",
                    sub: "Operaciones reestructuradas y castigadas.",
                    rows: [
                        { name: "Reestructuradas", value: K.rie_restructured || 0, fmt: "number" },
                        { name: "Castigadas", value: K.rie_writeoffs || 0, fmt: "number" }
                    ]
                }
            ],
            strip: [
                { label: "PD promedio", value: K.rie_pd || 0, fmt: "percent", note: "Ponderada por EAD" },
                { label: "LGD promedio", value: K.rie_lgd || 0, fmt: "percent", note: "Ponderada por EAD" },
                { label: "Brecha realizada", value: (K.rie_actual_loss || 0) - (K.rie_el || 0), fmt: "compact", note: "Realizada − esperada" }
            ]
        };
    }

    function viewHTML5(cfg) {
        var tables = cfg.tables.map(function (t) {
            var head = t.headers.map(function (h, i) {
                return '<th' + (i > 0 ? ' class="num"' : "") + ">" + esc(h) + "</th>";
            }).join("");
            var body = t.rows && t.rows.length
                ? t.rows.map(function (r) {
                    return "<tr>" + r.map(function (v, i) {
                        return '<td' + (i > 0 ? ' class="num"' : "") + ">" + v + "</td>";
                    }).join("") + "</tr>";
                }).join("")
                : '<tr><td colspan="' + t.headers.length + '" class="v5-empty">Sin datos.</td></tr>';
            return '<div class="card"><div class="v5-title">' + esc(t.title) + '</div>' +
                '<div class="v5-sub">' + esc(t.sub) + '</div>' +
                '<table class="tbl5"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
        }).join("");
        var cards = cfg.cards.map(function (c) {
            return '<div class="card"><div class="v5-title">' + esc(c.title) + '</div>' +
                '<div class="v5-sub">' + esc(c.sub) + '</div>' + rankHTML(c.rows) + "</div>";
        }).join("");
        var strip = cfg.strip.map(function (s) {
            return '<div class="v5-metric"><div class="v5-metric-label">' + esc(s.label) + "</div>" +
                '<div class="v5-metric-value">' + fmt(s.value, s.fmt) + "</div>" +
                '<div class="v5-metric-note">' + esc(s.note || "") + "</div></div>";
        }).join("");
        var foot = (cfg.hero.foot || []).map(function (f) {
            return "<div><span>" + esc(f.label) + "</span><b>" + fmt(f.value, f.fmt) + "</b></div>";
        }).join("");
        return '<div class="v5">' +
            '<div class="v5-top">' +
                '<div class="card v5-hero">' +
                    '<div class="v5-hero-top"><div><div class="v5-value">' + fmt(cfg.hero.value, cfg.hero.fmt) + "</div>" +
                        '<div class="v5-sub">' + esc(cfg.hero.sub) + "</div></div>" +
                        '<div class="v5-pill ' + (cfg.hero.pillTone || "") + '">' + esc(cfg.hero.pill) + "</div></div>" +
                    '<div class="v5-line" id="v5-line"></div>' +
                    '<div class="v5-hero-foot">' + foot + "</div>" +
                "</div>" +
                '<div class="card v5-side">' +
                    '<div class="v5-title">' + esc(cfg.side.title) + "</div>" +
                    '<div class="v5-value">' + fmt(cfg.side.value, cfg.side.fmt) + "</div>" +
                    '<div class="v5-status"><span class="dot ' + cfg.side.tone + '"></span>' + esc(cfg.side.status) + "</div>" +
                    rankHTML(cfg.side.rows) +
                    (cfg.side.foot ? '<div class="v5-side-foot">' + esc(cfg.side.foot) + "</div>" : "") +
                "</div>" +
            "</div>" +
            '<div class="v5-tables">' + tables + "</div>" +
            '<div class="v5-cards">' + cards + "</div>" +
            '<div class="card v5-strip">' + strip + "</div>" +
        "</div>";
    }

    function renderCharts5(cfg) {
        drawBars("v5-line", cfg.hero.series, { fmtY: cfg.hero.fmtY || shortMoney });
    }


    /* ---------------------- dashboard-2: Rentabilidad ---------------------- */
    function drawStepped(id, interest, commission, opts) {
        var el = $id(id);
        if (!el) return;
        var A = interest || [], B = commission || [];
        var n = Math.max(A.length, B.length);
        if (!n) { emptyChart(el); return; }
        var max = Math.max.apply(null, A.map(function (i) { return i.value || 0; })
            .concat(B.map(function (i) { return i.value || 0; })).concat([0]));
        if (max <= 0) { emptyChart(el); return; }
        var W = el.clientWidth || 600, H = el.clientHeight || 230;
        var padL = 44, padR = 12, padT = 14, padB = 26;
        var iw = W - padL - padR, ih = H - padT - padB;
        var x = function (i) { return padL + (n === 1 ? iw / 2 : iw * i / (n - 1)); };
        var y = function (v) { return padT + ih - (v / max) * ih; };
        var fmtY = (opts && opts.fmtY) || shortMoney;
        var svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">';
        for (var g = 0; g <= 4; g++) {
            var v = max * g / 4, yy = y(v);
            svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy +
                '" stroke="' + CHART.grid + '" stroke-width="1" stroke-dasharray="3 5"/>';
            svg += '<text x="' + (padL - 7) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="8.5" fill="' + CHART.label + '">' + fmtY(v) + "</text>";
        }
        function stepped(items) {
            if (!items.length) return "";
            var prev = items[0].value || 0;
            var d = "M" + x(0) + " " + y(prev);
            for (var i = 1; i < items.length; i++) {
                var val = items[i].value || 0;
                d += " L" + x(i) + " " + y(prev) + " L" + x(i) + " " + y(val);
                prev = val;
            }
            return d;
        }
        svg += '<path d="' + stepped(A) + '" fill="none" stroke="' + CHART.line + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
        svg += '<path d="' + stepped(B) + '" fill="none" stroke="' + CHART.stepped2 + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
        var labels = A.length ? A : B;
        var step = Math.max(1, Math.ceil(n / 10));
        labels.forEach(function (it, i) {
            if (i % step === 0 || i === n - 1) {
                svg += '<text x="' + x(i) + '" y="' + (H - 7) + '" text-anchor="middle" font-size="9" fill="' + CHART.label + '">' + esc(it.name) + "</text>";
            }
        });
        svg += "</svg>";
        el.innerHTML = svg;
    }

    function cfgRentabilidad2(D) {
        var P = D.rentabilidad || {}, K = P.kpis || {};
        var lines = P.income_lines || {};
        var total = K.ren_ingreso_total || 0;
        var comTotal = (lines.commission || []).reduce(function (s, x) { return s + (x.value || 0); }, 0);
        var comPct = total ? (comTotal / total * 100) : 0;
        var spread = K.ren_margen || 0;
        var delta = K.ren_ingreso_delta;
        var badge = (delta === undefined || delta === null) ? "" : ((delta >= 0 ? "▲ " : "▼ ") + fmtDec(Math.abs(delta), 1) + "%");
        var badgeTone = (delta !== undefined && delta !== null && delta < 0) ? "bad" : "";
        return {
            kpis: [
                { label: "TIR contractual", value: K.ren_tir, fmt: "percent", note: "Ponderada por capital" },
                { label: "TIR ajustada", value: K.ren_tir_adj, fmt: "percent", note: "Neta de riesgo" },
                { label: "Prima de riesgo", value: K.ren_prima, fmt: "percent", note: "Sobre el capital" },
                { label: "Spread de riesgo", value: spread, fmt: "percent", note: "TIR − prima" }
            ],
            main: {
                title: "Ingreso financiero",
                badge: badge, badgeTone: badgeTone,
                sub: "Ingresos del período. Intereses + comisiones + seguro.",
                series: P.income_series || []
            },
            side: {
                title: "Intereses vs. comisiones",
                badge: "Comisiones " + pct(comPct),
                sub: "Evolución del ingreso por tipo.",
                interest: lines.interest || [],
                commission: lines.commission || []
            },
            table: {
                title: "Rentabilidad por programa",
                sub: "TIR ajustada y prima por programa.",
                headers: ["Programa", "Ops", "Cartera", "TIR aj.", "Prima"],
                rows: (P.by_program || []).map(function (p) {
                    return [esc(p.name), String(p.ops || 0), fmt(p.cartera || 0, "compact"),
                        pct(p.tir || 0), pct(p.prima || 0)];
                })
            },
            health: {
                title: "Ingreso del período",
                value: total, fmt: "compact",
                text: "Intereses + comisiones + seguro.",
                cta: "Ver detalle →",
                icon: "＋"
            },
            activity: [
                { icon: "％", title: "Intereses", sub: "Devengado del período", value: fmt(K.ren_ingreso_interes || 0, "compact") },
                { icon: "＋", title: "Comisiones", sub: "Cobradas en el período", value: fmt(K.ren_ingreso_comision || 0, "compact") },
                { icon: "▤", title: "Seguro", sub: "Ingreso por seguro", value: fmt(K.ren_ingreso_seguro || 0, "compact") },
                { icon: "≈", title: "Rendimiento", sub: "Ingreso / cartera", value: pct(K.ren_rendimiento) },
                { icon: "◔", title: "Cuota / ingreso", sub: "Esfuerzo del cliente", value: pct(K.ren_cuota_ingreso) },
                { icon: "▤", title: "LTV", sub: "Financiamiento / valor", value: pct(K.ren_ltv) }
            ]
        };
    }

    function viewHTML2(cfg) {
        var kpis = cfg.kpis.map(function (k) {
            var note = k.note || "";
            if (k.tone) {
                var cls = k.tone === "good" ? "up" : (k.tone === "bad" ? "down" : "flat");
                note = '<span class="delta ' + cls + '">●</span> ' + esc(k.note || "");
            }
            return '<div class="v2-kpi"><div class="v2-kpi-label">' + esc(k.label) + "</div>" +
                '<div class="v2-kpi-value">' + fmt(k.value, k.fmt) + "</div>" +
                '<div class="v2-kpi-note">' + note + "</div></div>";
        }).join("");
        var head = cfg.table.headers.map(function (h, i) {
            return '<th' + (i > 0 ? ' class="num"' : "") + ">" + esc(h) + "</th>";
        }).join("");
        var rows = cfg.table.rows && cfg.table.rows.length
            ? cfg.table.rows.map(function (r) {
                return "<tr>" + r.map(function (v, i) {
                    return '<td' + (i > 0 ? ' class="num"' : "") + ">" + v + "</td>";
                }).join("") + "</tr>";
            }).join("")
            : '<tr><td colspan="' + cfg.table.headers.length + '" class="v5-empty">Sin datos.</td></tr>';
        var activity = cfg.activity.map(function (a) {
            return '<div class="v2-activity-item"><div class="v2-activity-icon">' + esc(a.icon) + "</div>" +
                '<div class="v2-activity-txt"><b>' + esc(a.title) + "</b><small>" + esc(a.sub) + "</small></div>" +
                '<div class="v2-activity-val">' + esc(a.value) + "</div></div>";
        }).join("");
        var badge = cfg.main.badge ? '<span class="v2-badge ' + (cfg.main.badgeTone || "") + '">' + esc(cfg.main.badge) + "</span>" : "";
        var sideBadge = cfg.side.badge ? '<span class="v2-badge">' + esc(cfg.side.badge) + "</span>" : "";
        return '<div class="v2">' +
            '<div class="card v2-kpis">' + kpis + "</div>" +
            '<div class="v2-charts">' +
                '<div class="card"><div class="v2-title"><span class="v2-t">' + esc(cfg.main.title) + "</span>" + badge + "</div>" +
                    '<div class="v2-sub">' + esc(cfg.main.sub) + "</div>" +
                    '<div class="v2-bars" id="v2-bars"></div></div>' +
                '<div class="card"><div class="v2-title"><span class="v2-t">' + esc(cfg.side.title) + "</span>" + sideBadge + "</div>" +
                    '<div class="v2-sub">' + esc(cfg.side.sub) + "</div>" +
                    '<div class="v2-steps" id="v2-steps"></div>' +
                    '<div class="v2-legend"><span><b style="background:' + CHART.line + '"></b>' + esc((cfg.side.legend || ["Intereses", "Comisiones"])[0]) + '</span>' +
                    '<span><b style="background:' + CHART.stepped2 + '"></b>' + esc((cfg.side.legend || ["Intereses", "Comisiones"])[1]) + '</span></div></div>' +
            "</div>" +
            '<div class="v2-bottom">' +
                '<div class="card v2-tablecard"><div class="v2-title"><span class="v2-t">' + esc(cfg.table.title) + "</span></div>" +
                    '<div class="v2-sub">' + esc(cfg.table.sub) + "</div>" +
                    '<table class="tbl5"><thead><tr>' + head + "</tr></thead><tbody>" + rows + "</tbody></table>" +
                    '<div class="v2-viewall">Ver todo →</div></div>' +
                '<div class="v2-split">' +
                    '<div class="card v2-health"><div class="v2-health-icon">' + esc(cfg.health.icon) + "</div>" +
                        '<div class="v2-health-title">' + esc(cfg.health.title) + "</div>" +
                        (cfg.health.value !== undefined
                            ? '<div class="v2-health-value">' + fmt(cfg.health.value, cfg.health.fmt) + "</div>" : "") +
                        '<div class="v2-health-text">' + esc(cfg.health.text) + "</div>" +
                        '<button class="v2-health-btn" onclick="drill(\'fin_tir\')">' + esc(cfg.health.cta) + "</button></div>" +
                    '<div class="card"><div class="v2-title"><span class="v2-t">Indicadores</span></div>' + activity + "</div>" +
                "</div>" +
            "</div>" +
        "</div>";
    }

    function renderCharts2(cfg) {
        drawBars("v2-bars", cfg.main.series, { fmtY: shortMoney });
        drawStepped("v2-steps", cfg.side.interest, cfg.side.commission, { fmtY: shortMoney });
    }


    /* ---------------------- Originación y comité ---------------------- */
    function cfgOriginacion(D) {
        var O = D.originacion || {}, K = O.kpis || {};
        var conversion = K.ori_conversion || 0;
        var committee = O.committee || [];
        return {
            hero: {
                value: K.ori_solicitudes, fmt: "number",
                sub: "Solicitudes y cotizaciones del período",
                pill: "Conversión " + pct(conversion),
                pillTone: "",
                series: (O.monthly || []).map(function (m) {
                    return { name: m.name, value: m.count || 0 };
                }),
                fmtY: function (v) { return Math.round(v); },
                foot: [
                    { label: "Aprobadas", value: K.ori_aprobadas || 0, fmt: "number" },
                    { label: "Desembolsadas", value: K.ori_desembolsadas || 0, fmt: "number" },
                    { label: "Tiempo", value: K.ori_tiempo || 0, fmt: "days" }
                ]
            },
            side: {
                title: "Tasa de aprobación",
                value: K.ori_tasa || 0, fmt: "percent",
                status: "Casos aprobados / evaluados",
                tone: "neutral",
                rows: committee.map(function (c) {
                    return { name: c.name, value: c.count || 0, fmt: "number" };
                }).concat([{ name: "Desembolsadas", value: K.ori_desembolsadas || 0, fmt: "number" }])
            },
            tables: [
                { title: "Embudo por etapa", sub: "Casos y monto solicitado.",
                  headers: ["Etapa", "Casos", "Monto"],
                  rows: (O.funnel || []).map(function (f) {
                      return [esc(f.name), String(f.count || 0), fmt(f.amount || 0, "compact")];
                  }) },
                { title: "Rechazos por motivo", sub: "Motivos registrados.",
                  headers: ["Motivo", "Casos"],
                  rows: (O.rejects || []).map(function (r) {
                      return [esc(r.name), String(r.value || 0)];
                  }) }
            ],
            cards: [
                { title: "Comité de crédito", sub: "Decisiones del período.",
                  rows: committee.map(function (c) {
                      return { name: c.name, value: c.count || 0, fmt: "number" };
                  }) },
                { title: "Canales", sub: "Solicitudes por canal.",
                  rows: (O.channels || []).map(function (c) {
                      return { name: c.name, value: c.value || 0, fmt: "number" };
                  }) },
                { title: "Montos", sub: "Solicitado, aprobado y desembolsado.",
                  rows: [
                      { name: "Solicitado", value: K.ori_solicitado || 0, fmt: "compact" },
                      { name: "Aprobado", value: K.ori_aprobado || 0, fmt: "compact" },
                      { name: "Desembolsado", value: K.ori_desembolsado || 0, fmt: "compact" }
                  ] },
                { title: "Top solicitudes", sub: "Mayor monto solicitado.",
                  rows: (O.top || []).slice(0, 5).map(function (t) {
                      return { name: t.cliente + " · " + t.operacion, value: t.monto || 0, fmt: "compact" };
                  }) }
            ],
            strip: [
                { label: "Solicitado", value: K.ori_solicitado || 0, fmt: "compact", note: "Monto del período" },
                { label: "Aprobado", value: K.ori_aprobado || 0, fmt: "compact", note: "Monto aprobado" },
                { label: "Desembolsado", value: K.ori_desembolsado || 0, fmt: "compact", note: "Colocación" }
            ]
        };
    }

    /* ---------------------- Cobranza ---------------------- */
    function cfgCobranza(D) {
        var C = D.cobranza || {}, K = C.kpis || {};
        var total = K.cob_promesas || 0;
        var kept = K.cob_cumplidas || 0;
        var cumplimiento = total ? (kept / total * 100) : 0;
        return {
            hero: {
                value: total, fmt: "number",
                sub: "Promesas de pago del período",
                pill: "Cumplimiento " + pct(cumplimiento),
                pillTone: "",
                series: (C.monthly || []).map(function (m) {
                    return { name: m.name, value: m.count || 0 };
                }),
                fmtY: function (v) { return Math.round(v); },
                foot: [
                    { label: "Abiertas", value: K.cob_abiertas || 0, fmt: "number" },
                    { label: "Cumplidas", value: kept, fmt: "number" },
                    { label: "Incumplidas", value: K.cob_incumplidas || 0, fmt: "number" }
                ]
            },
            side: {
                title: "Efectividad de cobranza",
                value: cumplimiento, fmt: "percent",
                status: "Promesas cumplidas / total",
                tone: "neutral",
                rows: [
                    { name: "Cumplidas", value: kept, fmt: "number" },
                    { name: "Incumplidas", value: K.cob_incumplidas || 0, fmt: "number" },
                    { name: "Abiertas", value: K.cob_abiertas || 0, fmt: "number" }
                ]
            },
            tables: [
                { title: "Promesas de pago", sub: "Estado y monto.",
                  headers: ["Cliente", "Estado", "Monto"],
                  rows: (C.promises || []).map(function (p) {
                      return [esc(p.cliente), esc(p.estado), fmt(p.monto || 0, "compact")];
                  }) },
                { title: "Gestiones de cobranza", sub: "Resultado de la gestión.",
                  headers: ["Resultado", "Casos"],
                  rows: (C.actions || []).map(function (a) {
                      return [esc(a.name), String(a.value || 0)];
                  }) }
            ],
            cards: [
                { title: "Colas de mora", sub: "Operaciones por cola.",
                  rows: (C.queues || []).map(function (q) {
                      return { name: q.name, value: q.value || 0, fmt: "number" };
                  }) },
                { title: "Casos judiciales", sub: "Casos por estado.",
                  rows: (C.judicial || []).map(function (j) {
                      return { name: j.name, value: j.value || 0, fmt: "number" };
                  }) },
                { title: "Gestiones", sub: "Por resultado.",
                  rows: (C.actions || []).map(function (a) {
                      return { name: a.name, value: a.value || 0, fmt: "number" };
                  }) },
                { title: "Cartera vencida", sub: "Cuotas y saldo vencido.",
                  rows: [
                      { name: "Cuotas vencidas", value: K.cob_cuotas || 0, fmt: "number" },
                      { name: "Saldo vencido", value: K.cob_vencido || 0, fmt: "compact" }
                  ] }
            ],
            strip: [
                { label: "Vencido", value: K.cob_vencido || 0, fmt: "compact", note: "Saldo vencido" },
                { label: "Cuotas vencidas", value: K.cob_cuotas || 0, fmt: "number", note: "Cuotas" },
                { label: "Gestiones", value: K.cob_gestiones || 0, fmt: "number", note: "Del período" }
            ]
        };
    }

    /* ---------------------- Tesorería ---------------------- */
    function cfgTesoreria2(D) {
        var T = D.tesoreria || {}, K = T.kpis || {};
        return {
            kpis: [
                { label: "Cobrado", value: K.tes_cobrado, fmt: "compact", note: "Pagos aplicados" },
                { label: "Procesadas", value: K.tes_conciliadas, fmt: "percent", note: "Líneas procesadas / total" },
                { label: "Borradores", value: K.tes_pendientes, fmt: "number", note: "Líneas en borrador" },
                { label: "Por vencer 30 d", value: K.tes_v30, fmt: "compact", note: "Cuotas pendientes" }
            ],
            main: { title: "Flujo por vencimientos", badge: "", sub: "Cuotas pendientes por tramo.", series: T.due || [] },
            side: { title: "Cobrado vs. devengado", badge: "", sub: "Evolución mensual.",
                    legend: ["Cobrado", "Devengado"],
                    interest: T.monthly_cobrado || [], commission: T.monthly_devengado || [] },
            table: { title: "Próximos vencimientos", sub: "Cuotas pendientes.",
                     headers: ["Cliente", "Operación", "Fecha", "Monto"],
                     rows: (T.table || []).map(function (r) {
                         return [esc(r.cliente), esc(r.operacion), esc(r.fecha), fmt(r.monto || 0, "compact")];
                     }) },
            health: { title: "Procesamiento bancario", value: K.tes_conciliadas, fmt: "percent",
                      text: "Líneas procesadas sobre el total.", cta: "Ver detalle →",
                      icon: "▤" },
            activity: [
                { icon: "＋", title: "Monto bancario", sub: "Líneas importadas", value: fmt(K.tes_banco || 0, "compact") },
                { icon: "％", title: "Devengado", sub: "Intereses del período", value: fmt(K.tes_devengado || 0, "compact") },
                { icon: "▤", title: "Por vencer +90", sub: "Cuotas pendientes", value: fmt(K.tes_more || 0, "compact") },
                { icon: "▦", title: "Líneas bancarias", sub: "Registros del período", value: String(K.tes_lineas || 0) }
            ]
        };
    }

    /* ---------------------- Comercial ---------------------- */
    function cfgComercial(D) {
        var C = D.comercial || {}, K = C.kpis || {};
        return {
            hero: {
                value: K.com_cartera, fmt: "compact",
                sub: "Cartera activa · operaciones por mes",
                pill: "Clientes " + (K.com_clientes || 0),
                pillTone: "",
                series: (C.monthly || []).map(function (m) {
                    return { name: m.name, value: m.count || 0 };
                }),
                fmtY: function (v) { return Math.round(v); },
                foot: [
                    { label: "Clientes", value: K.com_clientes || 0, fmt: "number" },
                    { label: "Operaciones", value: K.com_operaciones || 0, fmt: "number" },
                    { label: "Programas", value: (C.programs || []).length, fmt: "number" }
                ]
            },
            side: {
                title: "Concentración top 1",
                value: K.com_concentracion, fmt: "percent",
                status: "Participación del mayor cliente",
                tone: "neutral",
                rows: [
                    { name: "Top 1", value: K.com_top1 || 0, fmt: "compact" },
                    { name: "Resto", value: K.com_rest || 0, fmt: "compact" }
                ]
            },
            tables: [
                { title: "Top clientes", sub: "Por cartera.",
                  headers: ["Cliente", "Ops", "Cartera"],
                  rows: (C.clients || []).slice(0, 10).map(function (c) {
                      return [esc(c.name), String(c.count || 0), fmt(c.value || 0, "compact")];
                  }) },
                { title: "Cartera por programa", sub: "Saldo por programa.",
                  headers: ["Programa", "Cartera"],
                  rows: (C.programs || []).map(function (p) {
                      return [esc(p.name), fmt(p.value || 0, "compact")];
                  }) }
            ],
            cards: [
                { title: "Canales", sub: "Cartera por canal.",
                  rows: (C.channels || []).map(function (c) {
                      return { name: c.name, value: c.value || 0, fmt: "compact" };
                  }) },
                { title: "Proveedores", sub: "Cartera por proveedor.",
                  rows: (C.vendors || []).map(function (v) {
                      return { name: v.name, value: v.value || 0, fmt: "compact" };
                  }) },
                { title: "Tipo de sujeto", sub: "Operaciones por tipo.",
                  rows: (C.subjects || []).map(function (s) {
                      return { name: s.name, value: s.value || 0, fmt: "number" };
                  }) },
                { title: "Bienes financiados", sub: "Por tipo de bien.",
                  rows: (C.objects || []).map(function (o) {
                      return { name: o.name, value: o.value || 0, fmt: "compact" };
                  }) }
            ],
            strip: [
                { label: "Clientes", value: K.com_clientes || 0, fmt: "number", note: "Activos" },
                { label: "Operaciones", value: K.com_operaciones || 0, fmt: "number", note: "Activas" },
                { label: "Ticket promedio", value: K.com_ticket || 0, fmt: "compact", note: "Capital" }
            ]
        };
    }

    /* ---------------------- Eficiencia / SLA ---------------------- */
    function cfgSla(D) {
        var S = D.sla || {}, K = S.kpis || {};
        var outside = K.sla_fuera || 0;
        return {
            hero: {
                value: K.sla_ciclo, fmt: "days",
                sub: "Tiempo promedio por etapa",
                pill: "Fuera de SLA " + pct(outside),
                pillTone: "",
                series: (S.stages || []).map(function (st) {
                    return { name: st.name, value: st.value || 0 };
                }),
                fmtY: function (v) { return fmtDec(v, 1) + " d"; },
                foot: [
                    { label: "Etapas", value: (S.stages || []).length, fmt: "number" },
                    { label: "Docs pendientes", value: K.sla_docs_pendientes || 0, fmt: "number" },
                    { label: "Recaudos", value: K.sla_recaudos || 0, fmt: "number" }
                ]
            },
            side: {
                title: "Cumplimiento de SLA",
                value: Math.max(0, 100 - outside), fmt: "percent",
                status: "Etapas dentro del plazo configurado",
                tone: "neutral",
                rows: [
                    { name: "Dentro", value: K.sla_dentro || 0, fmt: "number" },
                    { name: "Fuera", value: Math.max((K.sla_total || 0) - (K.sla_dentro || 0), 0), fmt: "number" }
                ]
            },
            tables: [
                { title: "Tiempo por etapa", sub: "Duración promedio y máxima.",
                  headers: ["Etapa", "Casos", "Días prom.", "Máx."],
                  rows: (S.stages || []).map(function (st) {
                      return [esc(st.name), String(st.count || 0), fmtDec(st.value || 0, 1), fmtDec(st.max || 0, 1)];
                  }) },
                { title: "Documentos", sub: "Estado del expediente.",
                  headers: ["Estado", "Casos"],
                  rows: (S.doc_states || []).map(function (d) {
                      return [esc(d.name), String(d.value || 0)];
                  }) }
            ],
            cards: [
                { title: "Documentos", sub: "Vencidos y pendientes.",
                  rows: [
                      { name: "Vencidos", value: K.sla_docs_vencidos || 0, fmt: "number" },
                      { name: "Pendientes", value: K.sla_docs_pendientes || 0, fmt: "number" }
                  ] },
                { title: "Recaudos", sub: "Pendientes por cliente.",
                  rows: [{ name: "Pendientes", value: K.sla_recaudos || 0, fmt: "number" }] },
                { title: "Fichas de cliente", sub: "Avance promedio.",
                  rows: [{ name: "Avance", value: K.sla_fichas || 0, fmt: "percent" }] },
                { title: "Reversos", sub: "Eventos del período.",
                  rows: [{ name: "Reversos", value: K.sla_reversos || 0, fmt: "number" }] }
            ],
            strip: [
                { label: "Ciclo", value: K.sla_ciclo || 0, fmt: "days", note: "Promedio por etapa" },
                { label: "Fuera de SLA", value: outside, fmt: "percent", note: "Etapas fuera" },
                { label: "Docs vencidos", value: K.sla_docs_vencidos || 0, fmt: "number", note: "Expedientes" }
            ]
        };
    }

    function buildConfig(D) {
        return cfgCartera(D);
    }

    /* ----------------------------- layout ----------------------------- */
    function kpiHTML(k) {
        var note = k.note || "";
        if (k.delta !== undefined && k.delta !== null) {
            note = deltaHTML(k.delta, k.note);
        } else if (k.tone) {
            var cls = k.tone === "good" ? "up" : (k.tone === "bad" ? "down" : "flat");
            note = '<span class="delta ' + cls + '">●</span> ' + esc(k.note || "");
        }
        return '<div class="kpi">' +
            '<div class="kpi-label">' + esc(k.label) + "</div>" +
            '<div class="kpi-value">' + fmt(k.value, k.fmt) + "</div>" +
            '<div class="kpi-note">' + note + "</div>" +
            "</div>";
    }

    function attentionHTML(items) {
        if (!items || !items.length) {
            return '<div class="detail-row"><span>Sin pendientes</span><b class="good">OK</b></div>';
        }
        return items.map(function (it) {
            var count = it.count !== undefined && it.count !== null
                ? '<span class="count">' + it.count + "</span>" : "";
            return '<div class="attention-item">' +
                "<i>" + (it.icon || "•") + "</i>" +
                '<span class="txt">' + esc(it.text) + "</span>" +
                count +
                '<span class="arrow">›</span>' +
                "</div>";
        }).join("");
    }

    function viewHTML(cfg) {
        var kpis = cfg.kpis.map(kpiHTML).join("");
        var gaugeLegend = (cfg.gauge.items || []).map(function (it, i) {
            return '<span><b style="background:' + GAUGE_COLORS[i % GAUGE_COLORS.length] + '"></b>' + esc(it.name) + "</span>";
        }).join("");
        var gaugeBtn = cfg.gauge.detailKey
            ? '<button class="card-btn" onclick="drill(\'' + cfg.gauge.detailKey + '\')">Ver detalle →</button>' : "";
        var detailBtn = cfg.detail.detailKey
            ? '<button class="card-btn" onclick="drill(\'' + cfg.detail.detailKey + '\')">Ver detalle →</button>' : "";
        var insightKey = cfg.gauge.detailKey || cfg.detail.detailKey;
        var insightLink = insightKey
            ? '<button class="insight-link" onclick="drill(\'' + insightKey + '\')">Ver detalle →</button>' : "";
        var detailRows = (cfg.detail.rows || []).map(function (r) {
            return '<div class="detail-row"><span>' + esc(r.label) + '</span><b class="' + (r.tone || "") + '">' + fmt(r.value, r.fmt) + "</b></div>";
        }).join("");
        var tablesHTML = "";
        if (cfg.tables && cfg.tables.length) {
            var tcls = cfg.tables.length >= 3 ? "grid3" : "grid2";
            tablesHTML = '<div class="' + tcls + '">' + cfg.tables.map(function (t) {
                var head = t.headers.map(function (h, i) {
                    return '<th' + (i > 0 ? ' class="num"' : "") + ">" + esc(h) + "</th>";
                }).join("");
                var body = (t.rows || []).length
                    ? t.rows.map(function (r) {
                        return "<tr>" + r.map(function (v, i) {
                            return '<td' + (i > 0 ? ' class="num"' : "") + ">" + v + "</td>";
                        }).join("") + "</tr>";
                    }).join("")
                    : '<tr><td colspan="' + t.headers.length + '" class="v5-empty">Sin datos.</td></tr>';
                return '<div class="card"><div class="v2-title"><span class="v2-t">' + esc(t.title) + "</span></div>" +
                    '<div class="v2-sub">' + esc(t.sub) + "</div>" +
                    '<table class="tbl5"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
            }).join("") + "</div>";
        }
        return '' +
            '<div class="v6"><div class="v6-top">' +
            '<div class="main-col">' +
                '<div class="kpi-row">' + kpis + "</div>" +
                '<div class="card chart-card">' +
                    '<div class="chart-head">' +
                        '<div><div class="chart-value">' + fmt(cfg.main.value, cfg.main.fmt) + "</div>" +
                        '<div class="chart-sub">' + esc(cfg.main.sub) + "</div></div>" +
                        '<div class="chart-right">' + deltaHTML(cfg.main.delta, cfg.main.delta !== null ? "vs. período anterior" : "") + "</div>" +
                    "</div>" +
                    '<div class="chart-lg" id="main-chart"></div>' +
                "</div>" +
                '<div class="row-2">' +
                    '<div class="card insight-card">' +
                        '<div class="insight-head"><i>◔</i> Insight</div>' +
                        '<div class="insight-text">' + cfg.insight + "</div>" +
                        insightLink +
                    "</div>" +
                    '<div class="card">' +
                        '<div class="budget-head"><span>' + esc(cfg.budget.title) + '</span><span>Ver detalle</span></div>' +
                        '<div class="budget-value">' + fmt(cfg.budget.value, cfg.budget.fmt) + "</div>" +
                        '<div class="budget-sub">' + esc(cfg.budget.sub) + "</div>" +
                        '<div id="seg-bar"></div>' +
                    "</div>" +
                "</div>" +
                '<div class="card chart-card">' +
                    '<div class="chart-head">' +
                        '<div><div class="chart-value">' + fmt(cfg.bars.value, cfg.bars.fmt) + "</div>" +
                        '<div class="chart-sub">' + esc(cfg.bars.sub) + "</div></div>" +
                    "</div>" +
                    '<div class="chart-md" id="bar-chart"></div>' +
                "</div>" +
            "</div>" +
            '<div class="side-col">' +
                '<div class="card gauge-card">' +
                    '<div class="gauge-title">' + esc(cfg.gauge.title) + "</div>" +
                    '<div class="gauge-wrap"><div id="gauge"></div>' +
                        '<div class="gauge-center"><small>' + esc(cfg.gauge.centerLabel) + "</small><b>" + esc(cfg.gauge.centerValue) + "</b></div>" +
                    "</div>" +
                    '<div class="gauge-legend">' + gaugeLegend + "</div>" +
                    gaugeBtn +
                "</div>" +
                '<div class="card">' +
                    '<div class="mini-head"><span>' + esc(cfg.mini.title) + "</span></div>" +
                    '<div class="mini-value">' + fmt(cfg.mini.value, cfg.mini.fmt) + "</div>" +
                    '<div class="mini-note"><span>' + esc(cfg.mini.left) + "</span><span>" + esc(cfg.mini.right) + "</span></div>" +
                    '<div class="mini-bars" id="mini-bars"></div>' +
                "</div>" +
                '<div class="card">' +
                    '<div class="detail-title">' + esc(cfg.detail.title) + "</div>" +
                    detailRows + detailBtn +
                "</div>" +
                '<div class="card">' +
                    '<div class="attention-title">' + esc(cfg.attention.title) + "</div>" +
                    attentionHTML(cfg.attention.items) +
                "</div>" +
            "</div>" +
            "</div>" + tablesHTML + "</div>";
    }

    function renderCharts(cfg) {
        drawArea("main-chart", cfg.main.series, { fmtY: cfg.main.fmtY });
        drawGauge("gauge", cfg.gauge.items);
        drawMini("mini-bars", cfg.mini.bars);
        drawBars("bar-chart", cfg.bars.series, { fmtY: cfg.bars.fmtY });
        renderSegments("seg-bar", cfg.budget.items, cfg.budget.money);
    }

    /* ----------------------------- tooltips ----------------------------- */
    function animateCards(root) {
        var els = root.querySelectorAll(".card, .kpi, .v2-kpi");
        els.forEach(function (el, i) {
            el.classList.remove("bi-enter");
            void el.offsetWidth;
            el.style.animationDelay = Math.min(i, 10) * 45 + "ms";
            el.classList.add("bi-enter");
        });
    }

    function initTooltips() {
        var tip = $id("kpi-tip");
        if (!tip) {
            tip = document.createElement("div");
            tip.id = "kpi-tip";
            document.body.appendChild(tip);
        }
        var attach = function (selector) {
            document.querySelectorAll(selector).forEach(function (el) {
                var text = (el.textContent || "").trim();
                if (TIPS[text]) el.setAttribute("data-tip", TIPS[text]);
            });
        };
        attach(".kpi-label");
        attach(".chart-sub");
        attach(".gauge-title");
        attach(".mini-head > span:first-child");
        attach(".detail-title");
        attach(".attention-title");
        attach(".budget-head > span:first-child");
        attach(".v5-title");
        attach(".v2-t");
        attach(".v2-kpi-label");
        document.onmousemove = function (e) {
            var el = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
            if (!el) { tip.style.opacity = 0; return; }
            var txt = el.getAttribute("data-tip");
            if (tip.textContent !== txt) tip.textContent = txt;
            tip.style.opacity = 1;
            var w = tip.offsetWidth, h = tip.offsetHeight;
            var x = e.clientX + 16, y = e.clientY + 16;
            if (x + w > window.innerWidth - 12) x = e.clientX - w - 16;
            if (y + h > window.innerHeight - 12) y = e.clientY - h - 16;
            tip.style.left = x + "px";
            tip.style.top = y + "px";
        };
        document.onmouseleave = function () { tip.style.opacity = 0; };
    }

    /* ----------------------------- period / currency ----------------------------- */
    function populatePeriodSelectors() {
        var msel = $id("f-month"), ysel = $id("f-year");
        if (msel && !msel.dataset.loaded) {
            MONTH_NAMES.forEach(function (name, i) {
                var opt = document.createElement("option");
                opt.value = String(i + 1);
                opt.textContent = name;
                msel.appendChild(opt);
            });
            msel.dataset.loaded = "1";
        }
        if (ysel && !ysel.dataset.loaded) {
            var cy = new Date().getFullYear();
            var years = [];
            for (var y = cy - 5; y <= cy + 1; y++) years.push(y);
            years.sort(function (a, b) { return b - a; });
            years.forEach(function (y) {
                var opt = document.createElement("option");
                opt.value = String(y);
                opt.textContent = String(y);
                ysel.appendChild(opt);
            });
            ysel.dataset.loaded = "1";
        }
    }

    function updatePeriodSelectors() {
        var msel = $id("f-month"), ysel = $id("f-year"), psel = $id("period-select");
        var p = STADE_F.period;
        if (psel) psel.value = p;
        if (msel) msel.style.display = p === "mes" ? "" : "none";
        if (ysel) ysel.style.display = (p === "mes" || p === "anio") ? "" : "none";
        var custom = $id("period-custom");
        if (custom) custom.style.display = p === "custom" ? "inline-flex" : "none";
        if (msel && STADE_F.month) msel.value = String(STADE_F.month);
        if (ysel && STADE_F.year) {
            if (!ysel.querySelector('option[value="' + STADE_F.year + '"]')) {
                var opt = document.createElement("option");
                opt.value = String(STADE_F.year);
                opt.textContent = String(STADE_F.year);
                ysel.appendChild(opt);
            }
            ysel.value = String(STADE_F.year);
        }
    }

    function populateCurrencies(list) {
        var sel = $id("f-cur");
        if (!sel || sel.dataset.loaded) return;
        var company = (list || [])[0];
        var first = sel.querySelector("option");
        if (first) {
            first.value = company ? String(company.id) : "";
            first.textContent = "Moneda: compañía" + (company ? " (" + company.name + ")" : "");
        }
        (list || []).forEach(function (c) {
            var opt = document.createElement("option");
            opt.value = String(c.id);
            opt.textContent = c.name;
            sel.appendChild(opt);
        });
        sel.dataset.loaded = "1";
    }

    function periodLabel() {
        var lab = $id("period-label");
        if (!lab || !DATA || !DATA.filters) return;
        var f = DATA.filters;
        if (f.period === "mes" && f.month && f.year) {
            lab.textContent = MONTH_NAMES[parseInt(f.month, 10) - 1] + " " + f.year;
            return;
        }
        if (f.period === "anio" && f.year) { lab.textContent = "Año " + f.year; return; }
        var df = f.date_from, dt = f.date_to;
        if (df && dt) lab.textContent = df.split("-").reverse().join("/") + " – " + dt.split("-").reverse().join("/");
    }

    window.setPeriod = function (value) {
        STADE_F.period = value;
        if (value === "custom") {
            var f = $id("pc-from"), t = $id("pc-to");
            if (f && !f.value) f.value = STADE_F.date_from;
            if (t && !t.value) t.value = STADE_F.date_to;
        }
        updatePeriodSelectors();
        reload();
    };

    window.setPeriodDate = function () {
        var msel = $id("f-month"), ysel = $id("f-year");
        if (msel) STADE_F.month = msel.value;
        if (ysel) STADE_F.year = ysel.value;
        reload();
    };

    window.setCustomDates = function () {
        STADE_F.date_from = ($id("pc-from") || {}).value || "";
        STADE_F.date_to = ($id("pc-to") || {}).value || "";
        reload();
    };

    window.setFilter = function (dim, sel) {
        if (dim === "moneda") STADE_F.currency_id = sel.value;
        reload();
    };

    window.drill = function (key) {
        if (!key || !DRILL_KEYS[key]) return;
        var f = filters();
        f.compare = 0;
        window.parent.postMessage({ type: "stade-bi-drill", key: key, title: key, filters: f }, "*");
    };

    function filters() {
        var p = { period: STADE_F.period, currency_id: STADE_F.currency_id || null };
        if (STADE_F.period === "custom") {
            p.date_from = STADE_F.date_from;
            p.date_to = STADE_F.date_to;
        }
        if (STADE_F.period === "mes" || STADE_F.period === "anio") {
            p.month = STADE_F.month || null;
            p.year = STADE_F.year || null;
        }
        return p;
    }

    /* ----------------------------- render ----------------------------- */
    function render() {
        var D = DATA;
        if (!D) { document.body.classList.remove("loading"); return; }
        applyTheme(readScheme());
        SYM = (D.filters && D.filters.currency_symbol) || "$";
        populatePeriodSelectors();
        populateCurrencies(D.currencies);
        if (D.filters) {
            if (!STADE_F.date_from) STADE_F.date_from = D.filters.date_from || "";
            if (!STADE_F.date_to) STADE_F.date_to = D.filters.date_to || "";
            if (D.filters.month) STADE_F.month = String(D.filters.month);
            if (D.filters.year) STADE_F.year = String(D.filters.year);
            if (D.filters.period) STADE_F.period = D.filters.period;
        }
        var curSel = $id("f-cur");
        if (curSel) curSel.value = STADE_F.currency_id ? String(STADE_F.currency_id) : "";
        updatePeriodSelectors();
        periodLabel();

        if (D.user) {
            var uname = (D.user.name || D.user.login || "").trim();
            var parts = uname.split(/\s+/).filter(Boolean);
            var ini = parts.length
                ? (parts.length === 1 ? parts[0].slice(0, 2)
                    : parts[0].charAt(0) + parts[parts.length - 1].charAt(0))
                : "?";
            var unEl = $id("user-name-display"); if (unEl) unEl.textContent = uname || "—";
            var urEl = $id("user-role-display"); if (urEl) urEl.textContent = D.user.job_title || "";
            var uaEl = $id("user-avatar"); if (uaEl) uaEl.textContent = ini.toUpperCase();
        }
        if (D.company && D.company.name) {
            var wsEl = $id("ws-name"); if (wsEl) wsEl.textContent = D.company.name;
            var wsaEl = $id("ws-avatar");
            if (wsaEl) wsaEl.textContent = D.company.name.trim().charAt(0).toUpperCase();
        }

        var meta = TITLES[ACTIVE] || TITLES.cartera;
        var title = $id("page-title"), sub = $id("page-subtitle");
        if (title) title.textContent = meta[0];
        if (sub) sub.textContent = meta[1];

        var view = $id("view");
        var layouts5 = {
            riesgo: cfgRiesgo5, originacion: cfgOriginacion,
            cobranza: cfgCobranza, comercial: cfgComercial, sla: cfgSla
        };
        var layouts2 = { rentabilidad: cfgRentabilidad2, tesoreria: cfgTesoreria2 };
        if (layouts5[ACTIVE]) {
            LAST_CFG = layouts5[ACTIVE](D);
            if (view) { view.className = "view v5-view"; view.innerHTML = viewHTML5(LAST_CFG); }
            renderCharts5(LAST_CFG);
        } else if (layouts2[ACTIVE]) {
            LAST_CFG = layouts2[ACTIVE](D);
            if (view) { view.className = "view v2-view"; view.innerHTML = viewHTML2(LAST_CFG); }
            renderCharts2(LAST_CFG);
        } else {
            LAST_CFG = buildConfig(D);
            if (view) { view.className = "view v6-view"; view.innerHTML = viewHTML(LAST_CFG); }
            renderCharts(LAST_CFG);
        }
        initTooltips();
        if (!window._BI_QUIET && view) animateCards(view);
        window._BI_QUIET = false;

        var fresh = $id("fresh-text");
        if (fresh) fresh.innerHTML = '<span class="fresh-dot"></span>Actualizado ' + new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
        document.body.classList.remove("loading");
    }

    function reload(opts) {
        var quiet = opts && opts.quiet;
        var seq = ++LOAD;
        window._BI_QUIET = !!quiet;
        if (!quiet) {
            document.body.classList.add("loading");
            var fresh = $id("fresh-text");
            if (fresh) fresh.innerHTML = '<span class="fresh-dot"></span>Actualizando…';
        }
        fetch("/stade/financing-bi/data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: filters() })
        }).then(function (r) { return r.json(); }).then(function (res) {
            if (seq !== LOAD) return;
            var d = res && res.result;
            if (d && d.filters) {
                DATA = d;
                if (!STADE_F.currency_id && d.filters.currency_id) STADE_F.currency_id = String(d.filters.currency_id);
                render();
            } else {
                document.body.classList.remove("loading");
            }
        }).catch(function () {
            if (seq !== LOAD) return;
            document.body.classList.remove("loading");
        });
    }

    function bindNav() {
        document.querySelectorAll(".nav button[data-s]").forEach(function (b) {
            b.addEventListener("click", function () {
                var id = b.getAttribute("data-s");
                if (!TITLES[id]) return;
                ACTIVE = id;
                document.querySelectorAll(".nav button[data-s]").forEach(function (x) {
                    x.classList.toggle("active", x === b);
                });
                if (DATA) render();
            });
        });
    }

    /* ------------------------------ exportación ------------------------------ */
    function toast(msg) {
        var el = $id("bi-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "bi-toast";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add("show");
        clearTimeout(window._biToast);
        window._biToast = setTimeout(function () { el.classList.remove("show"); }, 2600);
    }

    function slug(s) {
        return (s || "tablero").toLowerCase().normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tablero";
    }

    function stamp() {
        var d = new Date();
        var p = function (n) { return String(n).padStart(2, "0"); };
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" +
            p(d.getHours()) + p(d.getMinutes());
    }

    function currentTitle() {
        var t = $id("page-title");
        return (t && t.textContent.trim()) || (TITLES[ACTIVE] && TITLES[ACTIVE][0]) || "Tablero";
    }

    function buildExportClone(offscreen) {
        var content = document.querySelector(".content");
        if (!content) return null;
        var clone = content.cloneNode(true);
        clone.classList.add("bi-export");
        clone.querySelectorAll(
            ".pill-select, .btn-ghost, .range-inputs, .load-pill, #period-custom, #bi-toast"
        ).forEach(function (el) { el.remove(); });
        var bg = getComputedStyle(document.body).backgroundColor;
        var width = Math.max(content.scrollWidth, content.getBoundingClientRect().width);
        clone.style.boxSizing = "border-box";
        clone.style.maxWidth = "none";
        clone.style.background = bg;
        clone.style.padding = "24px 28px";
        if (offscreen) {
            clone.style.width = width + "px";
            clone.style.position = "fixed";
            clone.style.left = "-100000px";
            clone.style.top = "0";
            clone.style.zIndex = "-1";
        } else {
            clone.style.width = "";
            clone.style.maxWidth = "1560px";
        }
        return clone;
    }

    function downloadData(data, filename) {
        var a = document.createElement("a");
        a.href = data;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }

    function exportImage(kind) {
        if (document.body.classList.contains("loading")) {
            toast("Espera a que carguen los datos para exportar");
            return;
        }
        if (typeof html2canvas !== "function") {
            toast("No se pudo cargar el exportador de imágenes");
            return;
        }
        var clone = buildExportClone(true);
        if (!clone) { toast("No se pudo preparar la exportación"); return; }
        document.body.appendChild(clone);
        var bg = getComputedStyle(document.body).backgroundColor;
        var width = clone.offsetWidth;
        toast("Generando " + kind.toUpperCase() + "…");
        html2canvas(clone, {
            backgroundColor: (!bg || bg === "rgba(0, 0, 0, 0)") ? "#0a0a0a" : bg,
            scale: 2,
            useCORS: true,
            logging: false,
            width: width,
            windowWidth: Math.max(window.innerWidth, width),
            windowHeight: window.innerHeight
        }).then(function (canvas) {
            var mime = kind === "jpg" ? "image/jpeg" : "image/png";
            var ext = kind === "jpg" ? "jpg" : "png";
            var data = canvas.toDataURL(mime, 0.94);
            downloadData(data, "financing-bi-" + slug(currentTitle()) + "-" + stamp() + "." + ext);
            toast((kind === "jpg" ? "JPG" : "PNG") + " exportado");
        }).catch(function (err) {
            console.error("financing bi export image", err);
            toast("No se pudo generar la imagen");
        }).finally(function () { clone.remove(); });
    }

    function exportHTML() {
        if (document.body.classList.contains("loading")) {
            toast("Espera a que carguen los datos para exportar");
            return;
        }
        toast("Generando HTML…");
        fetch("/stade_financing_bi/static/src/css/financing_bi_dark.css")
            .then(function (r) { return r.text(); })
            .then(function (css) {
                var clone = buildExportClone(false);
                if (!clone) throw new Error("no-clone");
                var theme = document.documentElement.getAttribute("data-theme") || "light";
                var title = "Financing BI · " + currentTitle();
                var html = "<!doctype html><html lang=\"es\" data-theme=\"" + theme + "\">" +
                    "<head><meta charset=\"utf-8\">" +
                    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
                    "<title>" + esc(title) + "</title>" +
                    "<style>" + css + "</style>" +
                    "<style>body{margin:0}.bi-export{padding:24px 28px;box-sizing:border-box;max-width:1560px;margin:0 auto}</style>" +
                    "</head><body>" + clone.outerHTML + "</body></html>";
                downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }),
                    "financing-bi-" + slug(currentTitle()) + "-" + stamp() + ".html");
                toast("HTML exportado");
            })
            .catch(function (err) {
                console.error("financing bi export html", err);
                toast("No se pudo generar el HTML");
            });
    }

    window.exportDashboard = function (kind) {
        if (!kind) return;
        if (kind === "html") exportHTML();
        else exportImage(kind);
    };

    window.reload = reload;
    bindNav();
    var resizeTimer = null;
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            if (!LAST_CFG) return;
            if (["riesgo", "originacion", "cobranza", "comercial", "sla"].indexOf(ACTIVE) >= 0) renderCharts5(LAST_CFG);
            else if (["rentabilidad", "tesoreria"].indexOf(ACTIVE) >= 0) renderCharts2(LAST_CFG);
            else renderCharts(LAST_CFG);
        }, 160);
    });
    applyTheme(readScheme());
    reload();
    setInterval(function () {
        if (document.visibilityState === "visible" && DATA) reload({ quiet: true });
    }, 60000);
    setInterval(function () {
        var s = readScheme();
        if (s !== THEME) { applyTheme(s); if (DATA) render(); }
    }, 1500);
})();
