/** @odoo-module **/
import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";

export class StadeFinancingBiDrill extends Component {
    static template = "stade_financing_bi.Drill";
    static props = { "*": true };

    setup() {
        this.action = useService("action");
        const params = (this.props.action && this.props.action.params) || {};
        this.key = params.key || "";
        this.filters = params.filters || {};
        this.back = params.back || null;
        this.state = useState({
            columns: [],
            rows: [],
            total: 0,
            page: 1,
            pages: 1,
            limit: 50,
            search: "",
            sort: "",
            direction: "asc",
            title: params.title || this.key,
            model: "",
            kind: "",
            currency: "",
            currency_name: "",
            loading: true,
        });
        onWillStart(() => this.load());
    }

    get params() {
        return Object.assign({}, this.filters, {
            key: this.key,
            search: this.state.search,
            sort: this.state.sort,
            direction: this.state.direction,
            page: this.state.page,
            limit: this.state.limit,
        });
    }

    async load() {
        this.state.loading = true;
        const res = await rpc("/stade/financing-bi/drill", this.params);
        Object.assign(this.state, res);
        this.state.loading = false;
    }

    onInput(ev) {
        this.state.search = ev.target.value;
    }

    onKeydown(ev) {
        if (ev.key === "Enter") {
            this.search();
        }
    }

    search() {
        this.state.page = 1;
        this.load();
    }

    clearSearch() {
        this.state.search = "";
        this.state.page = 1;
        this.load();
    }

    sortBy(col) {
        if (this.state.sort === col.name) {
            this.state.direction = this.state.direction === "asc" ? "desc" : "asc";
        } else {
            this.state.sort = col.name;
            this.state.direction = "asc";
        }
        this.state.page = 1;
        this.load();
    }

    goBack() {
        if (this.back) {
            this.action.doAction(this.back);
        } else {
            window.history.back();
        }
    }

    goPage(delta) {
        const p = this.state.page + delta;
        if (p >= 1 && p <= this.state.pages) {
            this.state.page = p;
            this.load();
        }
    }

    fmt(v, col) {
        if (v === null || v === undefined || v === "") {
            return "";
        }
        if (typeof v === "number" && col && col.type === "money") {
            const n = v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return this.state.currency ? (this.state.currency + " " + n) : n;
        }
        if (typeof v === "number") {
            if (Number.isInteger(v)) {
                return v.toLocaleString("es-VE");
            }
            return v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (typeof v === "string" && v.trim().endsWith("%")) {
            return v.replace(".", ",");
        }
        return v;
    }
}

registry.category("actions").add("stade_financing_bi_drill", StadeFinancingBiDrill);
