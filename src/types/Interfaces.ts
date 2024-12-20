export interface GmgnWalletResponse {
    code: number;
    reason: string;
    message: string;
    data: {
        holdings: GmgnWalletToken[];
        /** Pagination cursor (cursor field) */
        next: string;
    };
};

export interface GmgnWalletToken {
    token: {
        address: string;
        token_address: string;
        symbol: string;
        name: string;
        decimals: number;
        /** @format URL */
        logo: string;
        /** @format float number */
        price_change_6h: number;
        is_show_alert: boolean;
        is_honeypot: unknown;
    };
    /** @format float number */
    balance: string;
    /** @format float number */
    usd_value: string;
    /** @format float number */
    realized_profit_30d: string;
    /** @format float number */
    realized_profit: string;
    /** @format float number (+num*100) */
    realized_pnl: string;
    /** @format float number */
    realized_pnl_30d: string;
    /** @format float number */
    unrealized_profit: string;
    /** @format float number */
    unrealized_pnl: string;
    /** @format float number */
    total_profit: string;
    /** @format float number */
    total_profit_pnl: string;
    /** @format float number */
    avg_cost: string;
    /** @format float number */
    avg_sold: string;
    /** @format integer number */
    buy_30d: number;
    /** @format integer number */
    sell_30d: number;
    /** @format integer number */
    sells: number;
    /** @format float number */
    price: string;
    /** @format float number */
    cost: string;
    /** @format float number */
    position_percent: string;
    /** @format Unix time */
    last_active_timestamp: string;
    /** @format float number */
    history_sold_income: string;
    /** @format float number */
    history_bought_cost: string;
};