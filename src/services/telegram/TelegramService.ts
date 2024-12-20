import { Context, Scenes, Telegraf, session } from "telegraf";
import { InlineKeyboardMarkup, Message } from "telegraf/typings/core/types/typegram";
import { ExtraEditMessageText } from "telegraf/typings/telegram-types";
import { loginKeyboard, mainKeyboard, cancelKeyboard, getTotalProfitKeyboard } from "./keyboards";
import { PublicKey } from "@solana/web3.js";
import { ZenRows } from "zenrows";
import UserService from "../UserService";
import User from "../../models/UserModel";
import { GmgnWalletResponse, GmgnWalletToken } from "../../types/Interfaces";
import { FmtString } from "telegraf/typings/format";

if (!process.env.TELEGRAM_BOT_API_KEY) {
    console.error("TELEGRAM_BOT_API_KEY not set");
    process.exit(1);
}

if (!process.env.ZENROWS_API_KEY) {
    console.error("ZENROWS_API_KEY not set");
    process.exit(1);
}

export interface MySession extends Scenes.SceneSession {
    isActive?: boolean;
    walletAddress?: string;
    tokens?: GmgnWalletToken[]
    tokensPage?: number; 
    apiCursor?: string; 
    firstSelectedTokenIndex?: number;
    secondSelectedTokenIndex?: number;
    mainMsg?: Message.TextMessage;
    changeWalletMsg?: Message.TextMessage;
};

export interface MyContext extends Context {
    session: MySession;
	scene: Scenes.SceneContextScene<MyContext, Scenes.SceneSessionData>;
}

export type MsgArgsType = [
    text: string | FmtString,
    extra?: ExtraEditMessageText
];

class TelegramService {
    private getTotalProfitPageSize = 5;

    start = async () => {
        const changeWalletScene = new Scenes.BaseScene<MyContext>("change_wallet_scene");
        changeWalletScene.enter(async (ctx) => {
            ctx.session.changeWalletMsg = await ctx.reply(
                "<b>Send your Wallet address</b>",
                { 
                    parse_mode: "HTML",
                    reply_markup: ctx.session.walletAddress 
                    ? cancelKeyboard : undefined
                }
            );
        });
        changeWalletScene.on("message", async (ctx) => {
            await ctx.deleteMessage(ctx.message.message_id);

            if (ctx.text && ctx.text.startsWith("/")) {           
                await ctx.scene.leave();
                bot.handleUpdate({
                    update_id: ctx.update.update_id,
                    message: ctx.update.message
                });
                return;
            }

            if (ctx.text === ctx.session.walletAddress) {
                try {
                    await ctx.deleteMessage(ctx.session.changeWalletMsg?.message_id);
                } finally {
                    ctx.session.changeWalletMsg = await ctx.reply(
                        "<b>This address is already connected. Try again</b>",
                        {
                            parse_mode: "HTML",
                            reply_markup: ctx.session.walletAddress 
                            ? cancelKeyboard : undefined
                        }
                    );
                    return;
                }
            }

            if (!ctx.text || !this.isValidSolanaAddress(ctx.text)) {
                try {
                    await ctx.deleteMessage(ctx.session.changeWalletMsg?.message_id);
                } finally {
                    ctx.session.changeWalletMsg = await ctx.reply(
                        "<b>Invalid wallet address. Try again</b>",
                        {
                            parse_mode: "HTML",
                            reply_markup: ctx.session.walletAddress 
                            ? cancelKeyboard : undefined
                        }
                    );
                    return;
                }
            }

            const user = await UserService.update(ctx.from.id.toString(), { wallet_address: ctx.text });

            if (typeof user === "string") {
                try {
                    await ctx.deleteMessage(ctx.session.changeWalletMsg?.message_id);
                } finally {
                    await this.sendErrorMessage(ctx, user);
                    await ctx.scene.leave();
                    return;
                }
            }

            ctx.session.walletAddress = user.wallet_address as string;

            try {
                await bot.telegram.editMessageText(
                    ctx.chat.id,
                    ctx.session.mainMsg?.message_id,
                    undefined,
                    `<b>Solana Wallet address:</b>\n<code>${ctx.session.walletAddress}</code>`,
                    {
                        parse_mode: "HTML",
                        reply_markup: mainKeyboard
                    }
                );
            } catch (error: any) {
                let message: string;
                let keyboard: InlineKeyboardMarkup;

                if (ctx.session.walletAddress) {
                    message = `<b>Solana Wallet address:</b>\n<code>${ctx.session.walletAddress}</code>`;
                    keyboard = mainKeyboard;
                } else {
                    message = "<b>Welcome to Solana Wallet Analyzer Bot!</b>\n\n<i>Connect your Wallet to continue</i>"
                    keyboard = loginKeyboard;
                }

                ctx.session.mainMsg = await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
            } finally {
                await ctx.scene.leave();
            }
        });
        changeWalletScene.action("cancel", async (ctx) => {
            ctx.scene.leave();
        });
        changeWalletScene.leave(async (ctx) => {
            try {
                await ctx.deleteMessage(ctx.session.changeWalletMsg?.message_id);
            } finally {
                return;
            }
        });
        
        const bot = new Telegraf<MyContext>(process.env.TELEGRAM_BOT_API_KEY ?? "");

        const stage = new Scenes.Stage<MyContext>([
            changeWalletScene
        ]);

        bot.use(session());
        bot.use(stage.middleware());

        bot.use(async (ctx, next) => {
            if (ctx.session.isActive) {
                return next();
            }

            if (ctx.from === undefined) {
                return next();
            }

            const user = await UserService.getByOneId(ctx.from.id.toString());

            if (user instanceof User) {
                ctx.session = {
                    isActive: true,
                    walletAddress: user.wallet_address ?? undefined 
                };
                return next();
            }

            const newUser = await UserService.create({
                telegram_id: ctx.from.id.toString(),
                first_name: ctx.from.first_name,
                last_name: ctx.from.last_name,
                username: ctx.from.username,
            });

            if (typeof newUser === "string") {
                console.error(newUser);
                
                await ctx.reply("Error: " + newUser);

                return next();
            }

            ctx.session = { isActive: true };
            return next();
        });
      
        bot.command("start", async (ctx) => {
            ctx.session.tokens = undefined;
            ctx.session.firstSelectedTokenIndex = undefined;
            ctx.session.secondSelectedTokenIndex = undefined;
            ctx.session.tokensPage = undefined;

            let message: string;
            let keyboard: InlineKeyboardMarkup;

            if (ctx.session.walletAddress) {
                message = `<b>Solana Wallet address:</b>\n<code>${ctx.session.walletAddress}</code>`;
                keyboard = mainKeyboard;
            } else {
                message = "<b>Welcome to Solana Wallet Analyzer Bot!</b>\n\n<i>Connect your Wallet to continue</i>"
                keyboard = loginKeyboard;
            }

            ctx.session.mainMsg = await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
        });

        bot.action("change_wallet", async (ctx) => {
            ctx.session.tokens = undefined;
            
            await ctx.answerCbQuery();
            await ctx.scene.enter("change_wallet_scene");
        });

        bot.action(/^get_total_profit_\d+(_\d+)?$/, async (ctx) => {
            if (!ctx.session.walletAddress) {
                return;
            }

            if (ctx.session.tokens === undefined) {
                const walletData = await this.getRecentPnlTokens(ctx.session.walletAddress);

                if (!walletData) {
                    await ctx.answerCbQuery("GMGN API error. Try again");
                    return;
                }
                
                if (walletData.holdings.length < 1) {
                    await ctx.answerCbQuery("No available tokens");
                    return;
                }
    
                ctx.session.tokens = walletData.holdings;
                ctx.session.apiCursor = walletData.next;
            }

            const callbackData = ctx.match[0];
            const arrayOfCallbackItems = callbackData.split("_");
            const firstNumber = arrayOfCallbackItems[arrayOfCallbackItems.length - 2];
            const secondNumber = arrayOfCallbackItems[arrayOfCallbackItems.length - 1];
            const isTokenSelected = !isNaN(parseInt(firstNumber));            

            if (isTokenSelected) {
                const isSecondTokenWasSelected = parseInt(secondNumber[0]);
                const tokenIndex = parseInt(secondNumber.slice(1));

                if (isSecondTokenWasSelected && ctx.session.firstSelectedTokenIndex !== undefined) {
                    ctx.session.secondSelectedTokenIndex = tokenIndex;

                    const firstTokenIndex = ctx.session.firstSelectedTokenIndex;
                    const secondTokenIndex = tokenIndex;

                    const selected: GmgnWalletToken[] = [];

                    ctx.session.tokens.forEach((item, index) => {
                        if (index < firstTokenIndex || index > secondTokenIndex) {
                            return;
                        }

                        selected.push(item);
                    });

                    const firstToken = ctx.session.tokens[firstTokenIndex]
                    const secondToken = ctx.session.tokens[secondTokenIndex]

                    let message = "<b>Selected Tokens:</b>\n\nFrom:\n";
                    message += `Name: <i>${firstToken.token.name}</i>\n`;
                    message += `Symbol: <i>${firstToken.token.symbol}</i>\n`;
                    message += `Total profit: <i>$${parseFloat(firstToken.total_profit).toFixed(2)}</i>`;
                    message += ` | <i>${(parseFloat(firstToken.total_profit_pnl) * 100).toFixed(2)}%</i>\n\n`;

                    message += "To:\n";
                    message += `Name: <i>${secondToken.token.name}</i>\n`;
                    message += `Symbol: <i>${secondToken.token.symbol}</i>\n`;
                    message += `Total profit: <i>$${parseFloat(secondToken.total_profit).toFixed(2)}</i>`;
                    message += ` | <i>${(parseFloat(secondToken.total_profit_pnl) * 100).toFixed(2)}%</i>\n\n`;

                    let totalProfit = 0;
                    let totalProfitPnl = 0;
                    
                    selected.forEach(item => {                        
                        totalProfit += parseFloat(item.total_profit);
                        totalProfitPnl += parseFloat(item.total_profit_pnl) * 100;
                    });

                    let totalProfitStr = totalProfit.toFixed(2);
                    let totalProfitPnlStr = totalProfitPnl.toFixed(2);

                    if (totalProfitStr[0] !== "-") {
                        totalProfitStr = "+$" + totalProfitStr;
                    } else {
                        totalProfitStr = "-$" + totalProfitStr;
                    }
                    if (totalProfitPnlStr[0] !== "-") {
                        totalProfitPnlStr = "+" + totalProfitPnlStr;
                    }

                    message += `Total Profit:  <b>${totalProfitStr}</b>`;

                    await ctx.editMessageText(
                        message,
                        {
                            parse_mode: "HTML"
                        }
                    );

                    ctx.session.tokens = undefined;
                    ctx.session.firstSelectedTokenIndex = undefined;
                    ctx.session.secondSelectedTokenIndex = undefined;
                    ctx.session.apiCursor = undefined;
                    ctx.session.tokensPage = undefined;

                    return;
                } else {
                    ctx.session.firstSelectedTokenIndex = tokenIndex;
                }

                ctx.session.tokensPage = 1;
            } else {
                ctx.session.tokensPage = parseInt(secondNumber);
            }
            
            const pageSize = this.getTotalProfitPageSize
            const tokensPage = ctx.session.tokensPage;
            let startIndex = (tokensPage - 1) * pageSize;
            if (ctx.session.firstSelectedTokenIndex !== undefined) {
                startIndex += ctx.session.firstSelectedTokenIndex + 1
            }
            const endIndex = startIndex + pageSize - 1;
            let tokensList: GmgnWalletToken[] = [];
            
            tokensList = ctx.session.tokens.slice(startIndex);

            ctx.session.apiCursor = ctx.session.apiCursor ?? "";
            
            if (tokensList.length < pageSize && ctx.session.apiCursor.length > 1 && ctx.session.walletAddress) {
                const walletData = await this.getRecentPnlTokens(
                    ctx.session.walletAddress,
                    ctx.session.apiCursor
                );
        
                if (walletData) {
                    ctx.session.tokens = [...ctx.session.tokens, ...walletData.holdings];
                    tokensList = ctx.session.tokens.slice(startIndex);
                    ctx.session.apiCursor = walletData.next;
                } else {
                    await ctx.answerCbQuery("GMGN API error. Try again");
                    return;
                }
            }

            let message = "<b>Select first token from the list:</b>\n\n";

            tokensList.forEach(item => {
                const index = ctx.session.tokens?.indexOf(item);
                if (index === undefined || index === -1 || index && index > endIndex) {
                    return;
                }

                message += `<b>${index + 1}.</b> Name: <i>${item.token.name}</i>\n`;
                message += `  Symbol: <i>${item.token.symbol}</i>\n`;
                message += `  Total profit: <i>$${parseFloat(item.total_profit).toFixed(2)}</i>`;
                message += ` | <i>${(parseFloat(item.total_profit_pnl) * 100).toFixed(2)}%</i>\n\n`;
            });

            const msgArgs: MsgArgsType = [
                message,
                {
                    parse_mode: "HTML",
                    reply_markup: getTotalProfitKeyboard(
                        ctx.session.tokens,
                        startIndex,
                        ctx.session.tokensPage,
                        this.getTotalProfitPageSize,
                        ctx.session.firstSelectedTokenIndex
                    )
                }
            ];

            try {
                await ctx.editMessageText(...msgArgs);
            } catch (_) {
                ctx.session.mainMsg = await ctx.reply(...msgArgs);
            }
        });

        bot.action("cancel", async (ctx) => {
            ctx.session.tokens = undefined;
            ctx.session.firstSelectedTokenIndex = undefined;
            ctx.session.secondSelectedTokenIndex = undefined;

            await ctx.editMessageText(
                `<b>Solana Wallet address:</b>\n<code>${ctx.session.walletAddress}</code>`,
                {
                    parse_mode: "HTML",
                    reply_markup: mainKeyboard
                }
            );
        });

        bot.launch();
    };

    sendErrorMessage = async (ctx: MyContext, error: string) => {
        let message = `<b>Unknown error occurred:</b>\n<code>${error}</code>\n\n`;
        message += "<b>Send this message to Admin to fix the problem!</b>"
        return await ctx.reply(message, { parse_mode: "HTML" });
    };

    isValidSolanaAddress = (address: string) => {
        try {
            new PublicKey(address);
            return true;
        } catch (error: unknown) {
            return false;
        }
    };

    getRecentPnlTokens = async (walletAddress: string, cursor?: string) => {
        try {
            let params = "?limit=50&orderby=last_active_timestamp&direction=desc&showsmall=true&sellout=true&tx30d=true"
    
            if (cursor) {
                params += `&cursor=${cursor}`
            }
    
            const url = `https://gmgn.ai/api/v1/wallet_holdings/sol/${walletAddress}`;
            const client = new ZenRows(process.env.ZENROWS_API_KEY ?? "");
            const response = await client.get(url + params, { js_render: true, json_response: true });
            const htmlString = await response.text();
            const jsonResponse = JSON.parse(htmlString);

            if (!jsonResponse.html) {
                throw new Error(jsonResponse.detail);
            }

            const jsonGmgnData: GmgnWalletResponse = JSON.parse(jsonResponse.html);

            return jsonGmgnData.data;
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(`Unknown error occurred: ${error}`);
            }

            return null;
        }
    };
}

export default new TelegramService();