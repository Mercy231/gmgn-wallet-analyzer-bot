import { InlineKeyboardButton, InlineKeyboardMarkup } from "telegraf/typings/core/types/typegram";
import { GmgnWalletToken } from "../../types/Interfaces";

export const mainKeyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
        [{ text: "Change Wallet", callback_data: "change_wallet" }],
        [{ text: "Get total profit", callback_data: "get_total_profit_1" }]
    ]
};

export const loginKeyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
        [{ text: "Connect Wallet", callback_data: "change_wallet" }]
    ]
};

export const cancelKeyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
        [{ text: "Cancel", callback_data: "cancel" }]
    ]
};

export const getTotalProfitKeyboard = (
    tokens: GmgnWalletToken[],
    startIndex: number,
    pageNumber: number,
    itemsPerPage: number,
    firstSelectedIndex?: number
) => {
    const buttons: InlineKeyboardButton[][] = [];
    const lastPage = Math.ceil(tokens.length / itemsPerPage);
    const endIndex = startIndex + itemsPerPage - 1;

    tokens.forEach((token, index) => {
        if (index < startIndex || index > endIndex) {
            return;
        }

        const shortAddress = `${token.token.address.slice(0, 5)}...${token.token.address.slice(-5)}`
        
        buttons.push([{
            text: `${index + 1}. ${token.token.symbol} - ${token.token.name} - ${shortAddress}`,
            callback_data: `get_total_profit_1_${firstSelectedIndex !== undefined ? "1" : "0"}` + index
        }]);
    });

    const controls: InlineKeyboardButton[] = [];

    if (pageNumber > 1) {
        controls.push({ text: "Previous", callback_data: `get_total_profit_${pageNumber - 1}` })
    }
    
    controls.push({ text: "Cancel", callback_data: "cancel" });

    if (pageNumber !== lastPage) {
        controls.push({ text: "Next", callback_data: `get_total_profit_${pageNumber + 1}` });
    }

    const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
            ...buttons,
            [...controls]
        ]
    };

    return  keyboard;
};