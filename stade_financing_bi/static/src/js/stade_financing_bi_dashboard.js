/** @odoo-module **/
import { Component, onMounted, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class StadeFinancingBiDashboard extends Component {
    static template = "stade_financing_bi.Dashboard";

    setup() {
        this.action = useService("action");
        this._onMessage = (ev) => {
            const data = ev.data || {};
            if (data.type !== "stade-bi-drill") {
                return;
            }
            this.action.doAction({
                type: "ir.actions.client",
                tag: "stade_financing_bi_drill",
                name: data.title || data.key,
                params: {
                    key: data.key,
                    title: data.title || data.key,
                    filters: data.filters || {},
                },
            });
        };
        onMounted(() => window.addEventListener("message", this._onMessage));
        onWillUnmount(() => window.removeEventListener("message", this._onMessage));
    }
}

registry.category("actions").add("stade_financing_bi_dashboard", StadeFinancingBiDashboard);
