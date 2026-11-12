{
    "name": "Financing BI",
    "summary": "Tablero de Business Intelligence para empresas con el módulo de financiamiento",
    "version": "18.0.1.2.0",
    "category": "Productivity",
    "author": "STADE",
    "website": "https://stade.com",
    "license": "OPL-1",
    "web_icon": "stade_financing_bi,static/description/icon_bi.png",
    "depends": ["base", "web", "account", "financing"],
    "data": [
        "views/stade_financing_bi_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "stade_financing_bi/static/src/js/stade_financing_bi_dashboard.js",
            "stade_financing_bi/static/src/xml/stade_financing_bi_dashboard.xml",
            "stade_financing_bi/static/src/js/stade_financing_bi_drill.js",
            "stade_financing_bi/static/src/xml/stade_financing_bi_drill.xml",
            "stade_financing_bi/static/src/css/stade_financing_bi.css",
        ],
    },
    "application": True,
    "installable": True,
}
